"""
Background health monitor with persistent history.
Polls all registered servers every POLL_INTERVAL seconds.
Stores up to HISTORY_HOURS of per-server check results in memory.
"""

import asyncio
import logging
import shutil
import socket
import subprocess
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

POLL_INTERVAL = 30          # seconds between full fleet polls
HISTORY_HOURS = 2           # hours of history to keep in memory
MAX_HISTORY = int(HISTORY_HOURS * 3600 / POLL_INTERVAL)  # ~240 samples

# Global stores — populated by start_monitor()
_history: Dict[str, Deque[Dict[str, Any]]] = {}   # server_id -> deque of checks
_tool_cache: Dict[str, List[Dict[str, Any]]] = {}  # server_id -> tools list
_tool_cache_ts: Dict[str, datetime] = {}            # server_id -> when cached
TOOL_CACHE_TTL = 300  # seconds

_monitor_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# Port map — parsed from WEBAPP_PORTS.md
# ---------------------------------------------------------------------------

PORTS_MD = Path("D:/Dev/repos/mcp-central-docs/operations/WEBAPP_PORTS.md")


def load_port_map() -> List[Dict[str, str]]:
    """Parse the port allocation table from WEBAPP_PORTS.md."""
    rows: List[Dict[str, str]] = []
    if not PORTS_MD.exists():
        return rows
    in_table = False
    for line in PORTS_MD.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("| Port") and "Repo" in stripped:
            in_table = True
            continue
        if in_table:
            if not stripped.startswith("|"):
                in_table = False
                continue
            parts = [p.strip() for p in stripped.split("|")]
            parts = [p for p in parts if p]  # remove empty from leading/trailing |
            if len(parts) >= 3 and parts[0].isdigit():
                rows.append({"port": parts[0], "repo": parts[1], "service": parts[2]})
    return rows


def check_port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    """Return True if something is listening on host:port."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, ConnectionRefusedError, TimeoutError):
        return False


async def get_port_map_status() -> List[Dict[str, Any]]:
    """Load port map and check each port concurrently."""
    rows = load_port_map()
    if not rows:
        return []

    loop = asyncio.get_event_loop()

    async def check(row: Dict[str, str]) -> Dict[str, Any]:
        port = int(row["port"])
        open_ = await loop.run_in_executor(None, check_port_open, port)
        return {**row, "open": open_, "checked_at": datetime.now().isoformat()}

    results = await asyncio.gather(*[check(r) for r in rows])
    return list(results)


# ---------------------------------------------------------------------------
# History helpers
# ---------------------------------------------------------------------------

def _record(server_id: str, entry: Dict[str, Any]) -> None:
    if server_id not in _history:
        _history[server_id] = deque(maxlen=MAX_HISTORY)
    _history[server_id].appendleft(entry)


def get_history(server_id: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
    """Return history for one server or all servers."""
    if server_id:
        return {server_id: list(_history.get(server_id, []))}
    return {sid: list(dq) for sid, dq in _history.items()}


def get_uptime_summary() -> Dict[str, Dict[str, Any]]:
    """Per-server uptime % + last status over available history."""
    summary: Dict[str, Dict[str, Any]] = {}
    for sid, dq in _history.items():
        checks = list(dq)
        if not checks:
            continue
        total = len(checks)
        healthy = sum(1 for c in checks if c.get("status") == "healthy")
        summary[sid] = {
            "uptime_pct": round(100 * healthy / total, 2) if total else None,
            "total_checks": total,
            "healthy_checks": healthy,
            "last_status": checks[0].get("status") if checks else "unknown",
            "last_check": checks[0].get("timestamp") if checks else None,
            "last_response_ms": checks[0].get("response_time") if checks else None,
        }
    return summary


# ---------------------------------------------------------------------------
# Tool cache
# ---------------------------------------------------------------------------

async def fetch_tools(server_id: str, mcp_endpoint: str) -> List[Dict[str, Any]]:
    """Call tools/list on an MCP HTTP endpoint, cache result."""
    import httpx

    now = datetime.now()
    cached_ts = _tool_cache_ts.get(server_id)
    if cached_ts and (now - cached_ts).total_seconds() < TOOL_CACHE_TTL:
        return _tool_cache.get(server_id, [])

    request_body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                mcp_endpoint,
                json=request_body,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                tools = data.get("result", {}).get("tools", [])
                if not isinstance(tools, list):
                    tools = []
                _tool_cache[server_id] = tools
                _tool_cache_ts[server_id] = now
                return tools
    except Exception as e:
        logger.debug(f"tools/list failed for {server_id}: {e}")

    # Return stale cache if available
    return _tool_cache.get(server_id, [])


def get_cached_tools(server_id: str) -> List[Dict[str, Any]]:
    return _tool_cache.get(server_id, [])


def get_all_tool_cache() -> Dict[str, List[Dict[str, Any]]]:
    return dict(_tool_cache)


# ---------------------------------------------------------------------------
# Server start/stop
# ---------------------------------------------------------------------------

def _find_repo_path(server_id: str) -> Optional[Path]:
    """Guess repo path from server_id. Repos live in D:/Dev/repos/."""
    base = Path("D:/Dev/repos")
    candidate = base / server_id
    if candidate.is_dir():
        return candidate
    # Try stripping trailing -mcp, -mcp-server etc.
    for suffix in ["-mcp", "-server", "-backend"]:
        stripped = base / server_id.removesuffix(suffix)
        if stripped.is_dir():
            return stripped
    return None


def _locate_start_launcher(repo: Path) -> Tuple[Optional[List[str]], Optional[Path], str]:
    """Find start.bat or start.ps1 in repo root or fleet-standard subfolders.

    Returns (argv, cwd, error). On success error is ''.
    """
    rel_parts: tuple[tuple[str, ...], ...] = (
        (),
        ("webapp",),
        ("web_sota",),
        ("web-sota",),
        ("web",),
        ("scripts",),
    )
    for parts in rel_parts:
        d = repo.joinpath(*parts) if parts else repo
        if not d.is_dir():
            continue
        bat = d / "start.bat"
        ps1 = d / "start.ps1"
        if bat.is_file():
            return (["cmd.exe", "/c", bat.name], d, "")
        if ps1.is_file():
            ps1_abs = ps1.resolve()
            pwsh = shutil.which("powershell.exe") or shutil.which("powershell")
            if not pwsh:
                return (
                    None,
                    None,
                    f"Found {ps1_abs} but powershell.exe is not on PATH",
                )
            return (
                [
                    pwsh,
                    "-ExecutionPolicy",
                    "Bypass",
                    "-NoProfile",
                    "-File",
                    str(ps1_abs),
                ],
                d,
                "",
            )
    return (
        None,
        None,
        f"No start.bat or start.ps1 under {repo} "
        f"(checked root, webapp, web_sota, web-sota, web, scripts)",
    )


async def start_server(server_id: str, repo_path: Optional[str] = None) -> Dict[str, Any]:
    """Launch a server by running start.bat / start.ps1 (root, webapp, web_sota, …)."""
    path = Path(repo_path).expanduser() if repo_path else _find_repo_path(server_id)
    if not path or not path.is_dir():
        return {
            "ok": False,
            "error": f"Repo path not found for {server_id} (expected under D:/Dev/repos/ or set repo_path)",
        }

    cmd, cwd, loc_err = _locate_start_launcher(path)
    if not cmd or not cwd:
        return {"ok": False, "error": loc_err}
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
        )
        return {
            "ok": True,
            "pid": proc.pid,
            "command": cmd,
            "cwd": str(cwd),
            "repo": str(path),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def stop_server_by_port(port: int) -> Dict[str, Any]:
    """Kill whatever process is listening on port (Windows netstat approach)."""
    import subprocess, re

    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5
        )
        pids: set[str] = set()
        for line in result.stdout.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    pids.add(parts[-1])
        if not pids:
            return {"ok": False, "error": f"No process listening on port {port}"}
        killed = []
        for pid in pids:
            subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
            killed.append(pid)
        return {"ok": True, "killed_pids": killed, "port": port}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Log tail
# ---------------------------------------------------------------------------

def tail_mcp_logs(n_lines: int = 200) -> List[Dict[str, Any]]:
    """Read the last N lines from each Claude MCP server log file."""
    log_dir = Path("C:/Users/sandr/AppData/Roaming/Claude/logs")
    entries: List[Dict[str, Any]] = []
    if not log_dir.exists():
        return entries

    for log_file in sorted(log_dir.glob("mcp-server-*.log"), key=lambda f: f.stat().st_mtime, reverse=True)[:20]:
        server_name = log_file.stem.removeprefix("mcp-server-")
        try:
            lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
            for line in lines[-n_lines:]:
                line = line.strip()
                if not line:
                    continue
                level = "INFO"
                if any(w in line.lower() for w in ["error", "exception", "traceback", "failed"]):
                    level = "ERROR"
                elif any(w in line.lower() for w in ["warn", "warning"]):
                    level = "WARNING"
                elif any(w in line.lower() for w in ["debug"]):
                    level = "DEBUG"
                entries.append({
                    "server": server_name,
                    "msg": line,
                    "level": level,
                    "source_file": log_file.name,
                })
        except Exception:
            pass
    return entries


# ---------------------------------------------------------------------------
# GPU telemetry via nvidia-smi
# ---------------------------------------------------------------------------

def _parse_nvidia_smi(output: str) -> Dict[str, Any]:
    """Parse a single line of nvidia-smi --query-gpu CSV output."""
    parts = [p.strip() for p in output.split(",")]
    if len(parts) < 8:
        return {}
    try:
        return {
            "name": parts[0],
            "driver_version": parts[1],
            "utilization_gpu_pct": int(parts[2].replace(" %", "").strip()),
            "utilization_memory_pct": int(parts[3].replace(" %", "").strip()),
            "memory_used_mb": int(parts[4].replace(" MiB", "").strip()),
            "memory_total_mb": int(parts[5].replace(" MiB", "").strip()),
            "temperature_c": int(parts[6].replace(" C", "").strip()),
            "power_draw_w": float(parts[7].replace(" W", "").strip()),
        }
    except (ValueError, IndexError):
        return {}


async def get_gpu_stats() -> Dict[str, Any]:
    """
    Run nvidia-smi and return parsed GPU stats.
    Returns {"available": False, "error": ...} if nvidia-smi not found.
    """
    import asyncio

    _QUERY = (
        "name,driver_version,"
        "utilization.gpu,utilization.memory,"
        "memory.used,memory.total,"
        "temperature.gpu,power.draw"
    )
    cmd = [
        "nvidia-smi",
        f"--query-gpu={_QUERY}",
        "--format=csv,noheader,nounits",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=6.0)
        if proc.returncode != 0:
            return {"available": False, "error": stderr.decode(errors="replace").strip()}

        lines = [l.strip() for l in stdout.decode(errors="replace").splitlines() if l.strip()]
        gpus = []
        for line in lines:
            parsed = _parse_nvidia_smi(line)
            if parsed:
                parsed["available"] = True
                gpus.append(parsed)
        if not gpus:
            return {"available": False, "error": "No GPU data returned"}
        return {"available": True, "gpus": gpus, "gpu_count": len(gpus)}
    except FileNotFoundError:
        return {"available": False, "error": "nvidia-smi not found — not a CUDA system?"}
    except asyncio.TimeoutError:
        return {"available": False, "error": "nvidia-smi timed out"}
    except Exception as e:
        return {"available": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Ollama model list
# ---------------------------------------------------------------------------

async def get_ollama_models(ollama_url: str = "http://localhost:11434") -> Dict[str, Any]:
    """
    Fetch the list of locally available Ollama models.
    Returns {"available": False, "error": ...} if Ollama not running.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(f"{ollama_url}/api/tags")
            if resp.status_code != 200:
                return {"available": False, "error": f"Ollama returned {resp.status_code}"}
            data = resp.json()
            models = data.get("models", [])
            return {
                "available": True,
                "model_count": len(models),
                "models": [
                    {
                        "name": m.get("name", ""),
                        "size_gb": round(m.get("size", 0) / 1e9, 2),
                        "modified_at": m.get("modified_at", ""),
                        "family": m.get("details", {}).get("family", ""),
                        "parameter_size": m.get("details", {}).get("parameter_size", ""),
                        "quantization": m.get("details", {}).get("quantization_level", ""),
                    }
                    for m in models
                ],
            }
    except httpx.ConnectError:
        return {"available": False, "error": "Ollama not running at " + ollama_url}
    except Exception as e:
        return {"available": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Background polling loop
# ---------------------------------------------------------------------------

async def _poll_once(federation_manager: Any) -> None:
    """Check health of all servers and record results."""
    servers = federation_manager.list_servers()
    tasks = [federation_manager.check_server_health(s) for s in servers]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for server_cfg, result in zip(servers, results):
        sid = server_cfg["id"]
        if isinstance(result, Exception):
            entry = {
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(result),
                "response_time": None,
            }
        else:
            entry = {
                "timestamp": result.get("timestamp", datetime.now().isoformat()),
                "status": result.get("status", "unknown"),
                "response_time": result.get("response_time"),
                "error": result.get("error"),
            }
        _record(sid, entry)

        # Also try to refresh tool cache for healthy HTTP servers
        mcp_ep = server_cfg.get("mcp_endpoint")
        if entry["status"] == "healthy" and mcp_ep and mcp_ep.startswith("http"):
            asyncio.create_task(fetch_tools(sid, mcp_ep))


async def _monitor_loop(federation_manager: Any) -> None:
    logger.info("Health monitor started — polling every %ds", POLL_INTERVAL)
    while True:
        try:
            await _poll_once(federation_manager)
        except Exception as e:
            logger.error("Health monitor poll error: %s", e)
        await asyncio.sleep(POLL_INTERVAL)


def start_monitor(federation_manager: Any) -> None:
    """Launch the background polling task. Call once at app startup."""
    global _monitor_task
    if _monitor_task and not _monitor_task.done():
        return
    _monitor_task = asyncio.create_task(_monitor_loop(federation_manager))
    logger.info("Health monitor task created")
