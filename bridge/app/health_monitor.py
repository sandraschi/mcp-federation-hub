"""
Background health monitor with persistent history and supervisor.
Polls all registered servers every POLL_INTERVAL seconds.
Stores up to HISTORY_HOURS of per-server check results in memory.
Supervised servers are auto-restarted on failure with exponential backoff.
"""

import asyncio
import json
import logging
import os
import re
import shlex
import shutil
import socket
import subprocess
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from . import nssm_manager as nssm_mod
from .config import (
    BOOTSTRAP_SERVER_IDS,
    BOOTSTRAP_SERVERS,
    BOOTSTRAP_VERIFY_TIMEOUT_S,
    CIRCUIT_BREAKER_FAILURE_COUNT,
    CIRCUIT_BREAKER_POLL_INTERVAL_S,
    CLAUDE_LOG_DIR,
    DEFAULT_BRIDGE_PORT,
    FLEET_MCP_BIND_HOST,
    NSSM_HEAVY_MEMORY_IDS,
    HEALTH_POLL_INTERVAL_S,
    MAX_BOOTSTRAP_SERVERS,
    REPOS_ROOT,
    WEBAPP_PORTS_MD,
)

logger = logging.getLogger(__name__)

POLL_INTERVAL = HEALTH_POLL_INTERVAL_S  # seconds between full fleet polls
HISTORY_HOURS = 2  # hours of history to keep in memory
MAX_HISTORY = int(HISTORY_HOURS * 3600 / POLL_INTERVAL)  # ~240 samples

# Supervisor constants
SUPERVISOR_FAILURE_THRESHOLD = 3  # consecutive failures before restart
SUPERVISOR_BACKOFF_BASE_S = 60  # base backoff after first restart
SUPERVISOR_BACKOFF_CAP_S = 300  # max backoff (5 min)
SUPERVISOR_MAX_RESTART_HISTORY = 20  # keep last N restart events
SUPERVISOR_STARTUP_GRACE_S = 120  # no restarts for N seconds after hub start
SUPERVISOR_MAX_CONCURRENT = 1  # max simultaneous restarts (cpu-sensitive)
SUPERVISOR_POLL_TIMEOUT_S = 25  # health poll must complete within this or be abandoned

# Core servers — started first within the bootstrap set
CORE_SERVERS = frozenset(
    {
        "plex-mcp",
        "calibre-mcp",
        "yahboom-mcp",
        "arxiv-mcp",
        "mcp-federation-hub",
        "devices-mcp",
        "advanced-memory-mcp",
        "filesystem-mcp",
        "git-github-mcp",
        "tailscale-mcp",
    }
)

# Federation id → repo folder when they differ
REPO_ALIASES: Dict[str, str] = {
    "beyondcompare-mcp": "compareops",
    "database-operations-mcp": "dbops",
    "email-mcp": "emailops",
    "windows-operations-mcp": "winops",
}

# Resource gate — prevent the supervisor from melting the host
GATE_RAM_PCT = 90  # pause restarts if RAM usage > this %
GATE_MAX_FLEET_PROCS = 60  # cap on total fleet server processes started by supervisor
# CPU gate intentionally omitted — startup spikes (uv run, Python import) transiently
# hit 100%, which blocks everything. The concurrent restart cap is sufficient.

# Global stores — populated by start_monitor()
_history: Dict[str, Deque[Dict[str, Any]]] = {}  # server_id -> deque of checks
_tool_cache: Dict[str, List[Dict[str, Any]]] = {}  # server_id -> tools list
_tool_cache_ts: Dict[str, datetime] = {}  # server_id -> when cached
TOOL_CACHE_TTL = 300  # seconds

# Supervisor state — per-server restart tracking
_supervisor_state: Dict[str, Dict[str, Any]] = {}
_supervisor_started_at: Optional[datetime] = None
_restarts_in_flight: int = 0
_resource_cache: Dict[str, Any] = {}

_monitor_task: Optional[asyncio.Task] = None

# Circuit breaker — consecutive failure tracking per server
# After CIRCUIT_BREAKER_FAILURE_COUNT failures, only probe every 300s.
_circuit_state: Dict[str, Dict[str, Any]] = {}

# ── Supervisor persistence ───────────────────────────────────────────
_SUPERVISOR_STATE_FILE: Optional[Path] = None


def _supervisor_state_path() -> Path:
    """Return path for supervisor persistence file."""
    global _SUPERVISOR_STATE_FILE
    if _SUPERVISOR_STATE_FILE is None:
        _SUPERVISOR_STATE_FILE = Path(__file__).parent.parent / "supervisor_state.json"
    return _SUPERVISOR_STATE_FILE


def _load_supervisor_state() -> Dict[str, Dict[str, Any]]:
    """Load persisted supervisor state from disk."""
    path = _supervisor_state_path()
    try:
        if path.exists():
            with open(path, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.warning("Could not load supervisor state: %s", e)
    return {}


def _save_supervisor_state(state: Dict[str, Any]) -> None:
    """Persist supervisor state to disk (non-blocking, fire-and-forget)."""
    path = _supervisor_state_path()
    try:
        path.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")
    except Exception as e:
        logger.warning("Could not persist supervisor state: %s", e)


def _merge_persisted_supervisor() -> None:
    """Restore persisted supervisor state into the in-memory dict."""
    global _supervisor_state
    persisted = _load_supervisor_state()
    for sid, pstate in persisted.items():
        ms = _supervisor_state.get(sid, {})
        # Restore counters and flags; timestamps may be stale
        ms.setdefault("restart_attempts", pstate.get("restart_attempts", 0))
        ms.setdefault("restart_history", pstate.get("restart_history", []))
        ms.setdefault("paused", pstate.get("paused", False))
        ms["_restored_from_disk"] = True
        _supervisor_state[sid] = ms
    if persisted:
        logger.info("Supervisor state restored for %d servers", len(persisted))


async def _verify_health_after_start(
    port: int, timeout_s: int = BOOTSTRAP_VERIFY_TIMEOUT_S
) -> bool:
    """Wait up to timeout_s for a server's port to become healthy."""
    deadline = datetime.now() + timedelta(seconds=timeout_s)
    while datetime.now() < deadline:
        if await _health_check(port):
            return True
        await asyncio.sleep(1)
    return False


# Port map cache — built from WEBAPP_PORTS.md on first access
_backend_port_cache: Optional[Dict[str, int]] = None
_backend_port_cache_ts: Optional[datetime] = None
_BACKEND_PORT_CACHE_TTL = 300  # seconds


# ---------------------------------------------------------------------------
# Port map — parsed from WEBAPP_PORTS.md
# ---------------------------------------------------------------------------

PORTS_MD = WEBAPP_PORTS_MD


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


def _build_backend_port_map() -> Dict[str, int]:
    """Build {server_id: backend_port} map from port registry.

    For repos with a dedicated backend or MCP entry, that port is used.
    For repos with only a frontend entry, that port is used as fallback.
    Result is cached for _BACKEND_PORT_CACHE_TTL seconds.
    """
    global _backend_port_cache, _backend_port_cache_ts
    now = datetime.now()
    if _backend_port_cache and _backend_port_cache_ts:
        if (now - _backend_port_cache_ts).total_seconds() < _BACKEND_PORT_CACHE_TTL:
            return _backend_port_cache

    rows = load_port_map()
    # Group by repo
    repo_entries: Dict[str, list] = {}
    for r in rows:
        repo_entries.setdefault(r["repo"], []).append(r)

    result: Dict[str, int] = {}
    for repo, entries in repo_entries.items():
        backend_port = None
        frontend_port = None
        for e in entries:
            svc = (e.get("service") or "").lower()
            port = int(e["port"])
            is_backend = any(
                w in svc for w in ["backend", "mcp", "sse", "api", "bridge"]
            )
            is_frontend = any(w in svc for w in ["frontend", "dashboard"])
            if is_backend:
                backend_port = port
            elif is_frontend:
                frontend_port = port
            else:
                if not frontend_port and not backend_port:
                    frontend_port = port
        result[repo] = backend_port or frontend_port or 0

    _backend_port_cache = {k: v for k, v in result.items() if v}
    _backend_port_cache_ts = now
    return _backend_port_cache


def check_port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    """Return True if something is listening on host:port."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, ConnectionRefusedError, TimeoutError):
        return False


async def _health_check(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a server is alive by raw TCP connect (no httpx — hangs on this platform).

    Returns True if the port is open (TCP handshake succeeds).
    """
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=2.0,
        )
        writer.close()
        await writer.wait_closed()
        return True
    except (OSError, ConnectionRefusedError, asyncio.TimeoutError):
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
    base = REPOS_ROOT
    alias = REPO_ALIASES.get(server_id, server_id)
    for name in (alias, server_id):
        candidate = base / name
        if candidate.is_dir():
            return candidate
    # Try stripping trailing -mcp, -mcp-server etc.
    for suffix in ["-mcp", "-server", "-backend"]:
        stripped = base / server_id.removesuffix(suffix)
        if stripped.is_dir():
            return stripped
    return None


def resolve_mcp_endpoint(server_config: Dict[str, Any]) -> Optional[str]:
    """Derive MCP HTTP URL from explicit field or backend port."""
    explicit = server_config.get("mcp_endpoint")
    if explicit:
        return str(explicit)
    port = _extract_port(server_config)
    if not port:
        meta = BOOTSTRAP_SERVERS.get(server_config.get("id", ""), {})
        port = meta.get("mcp_port")
    if not port:
        return None
    path = server_config.get("mcp_path", "/mcp")
    if not str(path).startswith("/"):
        path = f"/{path}"
    return f"http://127.0.0.1:{int(port)}{path}"


def _bootstrap_port(server_config: Dict[str, Any]) -> Optional[int]:
    """Backend port for bootstrap/supervisor — explicit bootstrap registry wins."""
    sid = server_config.get("id", "")
    explicit = server_config.get("mcp_port")
    if explicit:
        return int(explicit)
    meta = BOOTSTRAP_SERVERS.get(sid, {})
    mp = meta.get("mcp_port")
    if mp:
        return int(mp)
    return _extract_port(server_config)


def _is_stdio_root_launcher(repo: Path, cwd: Path) -> bool:
    """True when repo-root start.ps1 is stdio-only (not HTTP backend)."""
    try:
        if cwd.resolve() != repo.resolve():
            return False
    except OSError:
        return False
    ps1 = cwd / "start.ps1"
    if not ps1.is_file():
        return False
    text = ps1.read_text(encoding="utf-8", errors="replace").lower()
    return (
        "uvicorn" not in text and "--http" not in text and "mcp_transport" not in text
    )


def _apply_bind_host(argv: List[str], bind_host: str) -> List[str]:
    """Replace or append --host in a uvicorn/python backend argv."""
    out = list(argv)
    for i, arg in enumerate(out):
        if arg == "--host" and i + 1 < len(out):
            out[i + 1] = bind_host
            return out
    joined = " ".join(out).lower()
    if "uvicorn" in joined or "python -m" in joined:
        out.extend(["--host", bind_host])
    return out


def _extract_port(server_config: Dict[str, Any]) -> Optional[int]:
    """Extract the MCP backend port from a server config.

    Priority:
    1. ``mcp_port`` (explicit backend port)
    2. ``health_endpoint`` (explicit health URL)
    3. Port registry (WEBAPP_PORTS.md) — resolves backend port separately
       from the frontend ``web_interface`` port
    4. ``web_interface`` URL (fallback — often the frontend port)
    """
    explicit = server_config.get("mcp_port")
    if explicit:
        return int(explicit)
    he = server_config.get("health_endpoint", "")
    if he:
        try:
            parsed = urlparse(he)
            if parsed.port:
                return parsed.port
        except Exception:
            pass
    # Port registry: use backend port even when web_interface is set
    sid = server_config.get("id", "")
    bp_map = _build_backend_port_map()
    if sid in bp_map:
        registry_port = bp_map[sid]
        # If registry has a backend port, use it (may differ from web_interface)
        wi_port = None
        wi = server_config.get("web_interface", "")
        if wi:
            try:
                parsed = urlparse(wi)
                wi_port = parsed.port
            except Exception:
                pass
        # Only use registry if it differs from the frontend port (means it's a real backend)
        if wi_port is None or registry_port != wi_port:
            return registry_port
    # Fallback to web_interface
    wi = server_config.get("web_interface", "")
    if wi:
        try:
            parsed = urlparse(wi)
            if parsed.port:
                return parsed.port
        except Exception:
            pass
    return None


def _locate_start_launcher(
    repo: Path,
    headless: bool = False,
) -> Tuple[Optional[List[str]], Optional[Path], str]:
    """Find start.bat or start.ps1 in repo root or fleet-standard subfolders.

    When headless, prefer webapp/web_sota over root start.ps1 (root scripts
    often launch stdio-only MCP modules instead of HTTP backends).

    Returns (argv, cwd, error). On success error is ''.
    """
    if headless:
        rel_parts: tuple[tuple[str, ...], ...] = (
            ("webapp",),
            ("web_sota",),
            ("web-sota",),
            ("web",),
            ("scripts",),
            (),
        )
    else:
        rel_parts = (
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


@dataclass
class _BackendCommand:
    argv: List[str]
    cwd: str


def _extract_backend_from_ps1(ps1_path: Path, port: int) -> Optional[_BackendCommand]:
    """Parse a start.ps1 and extract the backend Python command only.

    Looks for ``uvicorn`` or ``uv run python -m`` in ``$backendCmd`` or
    inline, strips PowerShell preamble, returns a clean executable command.
    """
    try:
        text = ps1_path.read_text(encoding="utf-8")
    except Exception:
        return None

    cwd = str(ps1_path.parent)

    # Find any line containing a uvicorn or python -m command
    command_str: str | None = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#") or line.startswith("@"):
            continue
        if "uvicorn " in line or "uv run python -m" in line or "python -m " in line:
            command_str = line
            break

    if not command_str:
        return None

    # Find uvicorn or python -m marker within the line
    uv_run = "uv run " if "uv run " in command_str else ""
    marker = "uvicorn " if "uvicorn " in command_str else "python -m "
    idx = command_str.find(marker)
    if idx < 0:
        return None

    # Extract from marker to end of first PowerShell statement (;)
    sub = command_str[idx:]
    semi = sub.find(";")
    if semi >= 0:
        sub = sub[:semi]

    # Replace PowerShell variable refs with port
    sub = re.sub(r"\$BackendPort\b", str(port), sub)
    sub = re.sub(r"\$\w+", "", sub)
    sub = sub.strip().strip('"').strip("'")

    # Prefix with uv run if the original had it
    if uv_run and "uv run" not in sub:
        sub = uv_run + sub

    try:
        parts = shlex.split(sub, posix=False)
    except Exception:
        return None

    if not parts:
        return None

    return _BackendCommand(argv=parts, cwd=cwd)


def _get_backend_command(
    server_id: str,
    repo: Path,
    port: int,
    mcp_path: str = "/mcp",
) -> Optional[_BackendCommand]:
    """Get a backend-only start command for an MCP server.

    Priority:
    1. ``start_cmd`` in server config (hand-written, most reliable)
    2. Parsed $backendCmd from start.ps1
    3. Auto-detected Python module with ``--http``
    """
    # Priority 1 already handled by caller (server_config.get("start_cmd"))
    # Priority 2: parse start.ps1 for backend command (web folders before root)
    for parts in (
        ("webapp",),
        ("web_sota",),
        ("web-sota",),
        ("web",),
        ("scripts",),
        (),
    ):
        d = repo.joinpath(*parts) if parts else repo
        if not d.is_dir():
            continue
        ps1 = d / "start.ps1"
        if ps1.is_file():
            cmd = _extract_backend_from_ps1(ps1, port)
            if cmd:
                return cmd

    # Priority 3: auto-detect module from repo files
    # Look for __main__.py or server.py in src/ or root
    src_repo = repo / "src"
    for base in (repo, src_repo):
        if not base.is_dir():
            continue
        for pkg_dir in base.iterdir():
            if not pkg_dir.is_dir() or pkg_dir.name.startswith("_"):
                continue
            for module in ("__main__", "server", "main"):
                if (pkg_dir / f"{module}.py").is_file():
                    # Skip ASGI-only server.py (bare docstring = not CLI)
                    if module == "server":
                        content = (pkg_dir / "server.py").read_text(
                            encoding="utf-8", errors="replace"
                        )
                        if (
                            "if __name__" not in content
                            and "main()" not in content
                            and "def " not in content
                        ):
                            continue
                    return _BackendCommand(
                        argv=[
                            "uv",
                            "run",
                            "--directory",
                            str(repo),
                            "python",
                            "-m",
                            f"{pkg_dir.name}.{module}",
                            "--http",
                            "--port",
                            str(port),
                            "--path",
                            mcp_path,
                        ],
                        cwd=str(repo),
                    )

    return None


async def start_server(
    server_id: str,
    repo_path: Optional[str] = None,
    headless: bool = True,
    port: Optional[int] = None,
    mcp_path: str = "/mcp",
    server_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Launch a fleet MCP server.

    Headless mode prefers a backend-only command (parsed from webapp/start.ps1
    or auto-detected ``python -m … --http``) instead of root start.ps1, which
    often runs stdio-only entrypoints.
    """
    cfg = dict(server_config or {})
    meta = BOOTSTRAP_SERVERS.get(server_id, {})
    if not cfg.get("start_cmd") and meta.get("start_cmd"):
        cfg["start_cmd"] = meta["start_cmd"]
    path = Path(repo_path).expanduser() if repo_path else _find_repo_path(server_id)
    if not path or not path.is_dir():
        return {
            "ok": False,
            "error": f"Repo path not found for {server_id} (expected under D:/Dev/repos/ or set repo_path)",
        }

    if port is None:
        port = _bootstrap_port(cfg) if cfg else None

    # Skip if server is already healthy
    if headless and port and await _health_check(port, host="127.0.0.1"):
        pid = _pid_on_port(port)
        logger.info(
            "start_server: %s already healthy on :%d (PID %s) — skipping",
            server_id,
            port,
            pid or "?",
        )
        return {
            "ok": True,
            "already_running": True,
            "pid": pid,
            "port": port,
        }

    # Kill zombies on the port (like start.ps1 does)
    if port:
        await stop_server_by_port(port)
        await asyncio.sleep(0.5)

    bind_host = FLEET_MCP_BIND_HOST
    clean_env = dict(os.environ)
    clean_env.pop("VIRTUAL_ENV", None)
    clean_env.setdefault("MCP_TRANSPORT", "http")
    clean_env.setdefault("FASTMCP_HOST", bind_host)

    creationflags = 0 if headless else getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

    # Headless: prefer webapp/start.ps1 -Headless, then backend-only command
    if headless and port:
        start_cmd = cfg.get("start_cmd") or meta.get("start_cmd")
        if start_cmd:
            cmd = _apply_bind_host(shlex.split(str(start_cmd), posix=False), bind_host)
            try:
                proc = subprocess.Popen(
                    cmd,
                    cwd=str(path),
                    env=clean_env,
                    creationflags=creationflags,
                )
                return {
                    "ok": True,
                    "pid": proc.pid,
                    "command": cmd,
                    "cwd": str(path),
                    "repo": str(path),
                    "headless": headless,
                    "mode": "start_cmd",
                }
            except Exception as e:
                logger.warning(
                    "start_server: start_cmd failed for %s (%s)",
                    server_id,
                    e,
                )

        script_cmd, script_cwd, loc_err = _locate_start_launcher(path, headless=True)
        if script_cmd and script_cwd and not _is_stdio_root_launcher(path, script_cwd):
            if "powershell" in " ".join(script_cmd).lower():
                script_cmd = list(script_cmd) + ["-Headless", "-BackendOnly"]
            try:
                proc = subprocess.Popen(
                    script_cmd,
                    cwd=str(script_cwd),
                    env=clean_env,
                    creationflags=creationflags,
                )
                return {
                    "ok": True,
                    "pid": proc.pid,
                    "command": script_cmd,
                    "cwd": str(script_cwd),
                    "repo": str(path),
                    "headless": headless,
                    "mode": "start_script",
                }
            except Exception as e:
                logger.warning(
                    "start_server: start.ps1 failed for %s (%s) — trying backend parse",
                    server_id,
                    e,
                )

        backend = _get_backend_command(server_id, path, port, mcp_path)
        if backend:
            cmd = _apply_bind_host(backend.argv, bind_host)
            try:
                proc = subprocess.Popen(
                    cmd,
                    cwd=backend.cwd,
                    env=clean_env,
                    creationflags=creationflags,
                )
                return {
                    "ok": True,
                    "pid": proc.pid,
                    "command": cmd,
                    "cwd": backend.cwd,
                    "repo": str(path),
                    "headless": headless,
                    "mode": "backend",
                }
            except Exception as e:
                logger.warning(
                    "start_server: backend launch failed for %s (%s) — falling back to start.ps1",
                    server_id,
                    e,
                )

    # Interactive or last-resort fallback
    cmd, cwd, loc_err = _locate_start_launcher(path, headless=headless)
    if not cmd or not cwd:
        return {"ok": False, "error": loc_err}

    if headless and "powershell" in " ".join(cmd).lower():
        cmd = list(cmd) + ["-Headless", "-BackendOnly"]

    try:
        proc = subprocess.Popen(
            cmd, cwd=str(cwd), env=clean_env, creationflags=creationflags
        )
        return {
            "ok": True,
            "pid": proc.pid,
            "command": cmd,
            "cwd": str(cwd),
            "repo": str(path),
            "headless": headless,
            "mode": "start_script",
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def stop_server_by_port(port: int) -> Dict[str, Any]:
    """Kill whatever process is listening on port (Windows netstat approach)."""
    import subprocess

    try:
        proc = await asyncio.create_subprocess_exec(
            "netstat",
            "-ano",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=8)
        output = stdout.decode(errors="replace")
        pids: set[str] = set()
        for line in output.splitlines():
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


def _process_tree_rss_mb(pid: int) -> Optional[float]:
    """RSS in MiB for process and descendants (uvicorn/python workers)."""
    try:
        import psutil

        proc = psutil.Process(pid)
        total = proc.memory_info().rss
        for child in proc.children(recursive=True):
            try:
                total += child.memory_info().rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return round(total / (1024 * 1024), 1)
    except Exception:
        return None


def fleet_memory_usage(
    server_configs: List[Dict[str, Any]],
    *,
    running_only: bool = False,
) -> Dict[str, Any]:
    """Per-server and cumulative RSS for fleet backends listening on MCP ports."""
    per_server: List[Dict[str, Any]] = []
    fleet_rss_mb = 0.0
    fleet_count = 0
    seen_pids: set[int] = set()

    def _add_entry(
        server_id: str,
        port: Optional[int],
        pid: Optional[int],
        name: Optional[str] = None,
    ) -> None:
        nonlocal fleet_rss_mb, fleet_count
        rss_mb = _process_tree_rss_mb(pid) if pid else None
        listening = bool(port and _pid_on_port(port))
        if running_only and not listening and not rss_mb:
            return
        if pid and pid in seen_pids:
            dup = True
        else:
            dup = False
            if pid:
                seen_pids.add(pid)
        if rss_mb and not dup:
            fleet_rss_mb += rss_mb
            fleet_count += 1
        per_server.append(
            {
                "server_id": server_id,
                "name": name or server_id,
                "port": port,
                "pid": pid,
                "port_listening": listening,
                "rss_mb": rss_mb,
                "heavy_memory": server_id in NSSM_HEAVY_MEMORY_IDS,
            }
        )

    bridge_pid = _pid_on_port(DEFAULT_BRIDGE_PORT)
    _add_entry(
        "mcp-federation-hub", DEFAULT_BRIDGE_PORT, bridge_pid, "Federation Bridge"
    )

    for cfg in server_configs:
        sid = cfg.get("id")
        if not sid or sid == "mcp-federation-hub":
            continue
        port = _bootstrap_port(cfg)
        pid = _pid_on_port(port) if port else None
        _add_entry(sid, port, pid, cfg.get("name"))

    per_server.sort(
        key=lambda x: (-(x.get("rss_mb") or 0), x.get("server_id", "")),
    )

    snap = _resource_snapshot()
    return {
        "servers": per_server,
        "fleet_rss_mb": round(fleet_rss_mb, 1),
        "fleet_process_count": fleet_count,
        "system_ram_pct": snap.get("ram_pct"),
        "system_ram_avail_gb": snap.get("ram_avail_gb"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def _pid_on_port(port: int) -> Optional[int]:
    """Return the PID of the process listening on ``port``, or None."""
    # Use sync subprocess (called from sync context like start_server before async fix)
    try:
        result = subprocess.run(
            ["netstat", "-ano"], capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    try:
                        return int(parts[-1])
                    except ValueError:
                        pass
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Resource gate helpers
# ---------------------------------------------------------------------------


def _fleet_process_count() -> int:
    """Count fleet server processes currently listening on known fleet ports."""
    count = 0
    rows = load_port_map()
    for row in rows:
        try:
            port = int(row.get("port", 0))
            if 10700 <= port <= 11000 and check_port_open(port):
                count += 1
        except (ValueError, OSError):
            pass
    return count


def _resources_blocked() -> str | None:
    """Return a reason string if the host is too loaded to start more servers.

    Uses cached snapshot updated by the poll loop — non-blocking.
    CPU is intentionally excluded (uv run startup spikes transiently to 100%).
    Returns None if resources are within bounds.
    """
    if not _resource_cache:
        return None

    ram = _resource_cache.get("ram_pct", 0)
    if ram > GATE_RAM_PCT:
        return f"RAM {ram:.0f}% > {GATE_RAM_PCT}%"

    fleet = _resource_cache.get("fleet_procs", 0)
    if fleet >= GATE_MAX_FLEET_PROCS:
        return f"fleet procs {fleet} >= {GATE_MAX_FLEET_PROCS}"

    return None


def _resource_snapshot() -> Dict[str, Any]:
    """Current resource telemetry (cached, updated by poll loop)."""
    return dict(_resource_cache)


def _refresh_resource_snapshot() -> None:
    """Update the global resource cache (called from poll loop, non-async-safe for perf)."""
    global _resource_cache
    snap: Dict[str, Any] = {"fleet_procs": _fleet_process_count()}
    try:
        import psutil

        cpu = psutil.cpu_percent(interval=0.3)
        mem = psutil.virtual_memory()
        snap.update(
            {
                "cpu_pct": cpu,
                "ram_pct": mem.percent,
                "ram_avail_gb": round(mem.available / 1e9, 1),
                "gates": {
                    "ram_ok": mem.percent <= GATE_RAM_PCT,
                    "fleet_ok": snap["fleet_procs"] < GATE_MAX_FLEET_PROCS,
                },
            }
        )
    except ImportError:
        pass
    _resource_cache = snap


# ---------------------------------------------------------------------------
# Fleet Supervisor — auto-restart supervised servers
# ---------------------------------------------------------------------------


def _supervisor_init(sid: str) -> Dict[str, Any]:
    """Ensure supervisor state exists for a server id."""
    if sid not in _supervisor_state:
        _supervisor_state[sid] = {
            "consecutive_failures": 0,
            "restart_attempts": 0,
            "backoff_until": None,
            "restart_history": [],
            "paused": False,
            "last_restart_at": None,
        }
    return _supervisor_state[sid]


async def _supervisor_on_health(
    sid: str,
    status: str,
    server_config: Dict[str, Any],
    federation_manager: Any,
) -> None:
    """Called after each health poll. Auto-restarts supervised servers on failure."""
    if sid in nssm_mod.nssm_installed_server_ids():
        return
    supervised = server_config.get("supervised", True)
    if not supervised:
        return

    # Remote hub peers are not local processes — never auto-restart them
    if server_config.get("type") == "remote_hub":
        return

    now = datetime.now(timezone.utc)

    # Startup grace period — don't restart things that were down before the hub
    global _supervisor_started_at, _restarts_in_flight
    if (
        _supervisor_started_at
        and (now - _supervisor_started_at).total_seconds() < SUPERVISOR_STARTUP_GRACE_S
    ):
        return

    state = _supervisor_init(sid)

    if status == "healthy":
        state["consecutive_failures"] = 0
        if state["restart_attempts"] > 0:
            state["restart_attempts"] = 0
            state["backoff_until"] = None
            logger.info("supervisor: %s recovered — backoff reset", sid)
        return

    # Server is not healthy
    if state["paused"]:
        return

    # During backoff grace period, skip failure counting
    if state["backoff_until"] and now < state["backoff_until"]:
        return

    state["consecutive_failures"] += 1
    failures = state["consecutive_failures"]

    if failures < SUPERVISOR_FAILURE_THRESHOLD:
        return

    # Concurrent restart throttle — spread the load
    if _restarts_in_flight >= SUPERVISOR_MAX_CONCURRENT:
        return

    # Resource gate — don't melt the host
    block_reason = _resources_blocked()
    if block_reason:
        logger.info("supervisor: %s blocked — %s", sid, block_reason)
        return

    state["restart_attempts"] += 1
    attempt = state["restart_attempts"]
    headless = server_config.get("headless", True)
    repo_path = server_config.get("repo_path")

    logger.warning(
        "supervisor: %s down after %d consecutive failures — restarting (attempt %d, headless=%s)",
        sid,
        failures,
        attempt,
        headless,
    )

    _restarts_in_flight += 1
    mcp_port = _bootstrap_port(server_config)
    try:
        result = await start_server(
            sid,
            repo_path=repo_path,
            headless=headless,
            port=mcp_port,
            mcp_path="/mcp",
            server_config=server_config,
        )
    finally:
        _restarts_in_flight -= 1

    state["consecutive_failures"] = 0
    state["last_restart_at"] = now.isoformat()

    backoff_s = min(
        SUPERVISOR_BACKOFF_CAP_S,
        int(SUPERVISOR_BACKOFF_BASE_S * (2 ** max(0, attempt - 1))),
    )
    state["backoff_until"] = now + timedelta(seconds=backoff_s)

    history = state.setdefault("restart_history", [])
    history.append(
        {
            "timestamp": now.isoformat(),
            "attempt": attempt,
            "result": "ok"
            if result.get("ok")
            else "error: " + result.get("error", "?"),
            "backoff_s": backoff_s,
            "headless": headless,
            "pid": result.get("pid"),
        }
    )
    if len(history) > SUPERVISOR_MAX_RESTART_HISTORY:
        history.pop(0)

    logger.info(
        "supervisor: %s restart %s — backoff %ds",
        sid,
        "ok" if result.get("ok") else "FAILED",
        backoff_s,
    )
    _save_supervisor_state(_supervisor_state)


def get_supervisor_status(server_id: Optional[str] = None) -> Dict[str, Any]:
    """Return supervisor state for one or all servers."""
    if server_id:
        return {server_id: _supervisor_state.get(server_id, {})}
    return dict(_supervisor_state)


def pause_supervision(server_id: str) -> Dict[str, Any]:
    """Pause automatic restart for a server."""
    state = _supervisor_init(server_id)
    state["paused"] = True
    _save_supervisor_state(_supervisor_state)
    logger.info("supervisor: %s paused", server_id)
    return {"server_id": server_id, "paused": True, "state": state}


def resume_supervision(server_id: str) -> Dict[str, Any]:
    """Resume automatic restart for a server."""
    state = _supervisor_init(server_id)
    state["paused"] = False
    state["consecutive_failures"] = 0
    state["restart_attempts"] = 0
    state["backoff_until"] = None
    _save_supervisor_state(_supervisor_state)
    logger.info("supervisor: %s resumed", server_id)
    return {"server_id": server_id, "paused": False, "state": state}


# ---------------------------------------------------------------------------
# Log tail
# ---------------------------------------------------------------------------


def tail_mcp_logs(n_lines: int = 200) -> List[Dict[str, Any]]:
    """Read the last N lines from each Claude MCP server log file."""
    log_dir = CLAUDE_LOG_DIR
    entries: List[Dict[str, Any]] = []
    if not log_dir.exists():
        return entries

    for log_file in sorted(
        log_dir.glob("mcp-server-*.log"), key=lambda f: f.stat().st_mtime, reverse=True
    )[:20]:
        server_name = log_file.stem.removeprefix("mcp-server-")
        try:
            lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
            for line in lines[-n_lines:]:
                line = line.strip()
                if not line:
                    continue
                level = "INFO"
                if any(
                    w in line.lower()
                    for w in ["error", "exception", "traceback", "failed"]
                ):
                    level = "ERROR"
                elif any(w in line.lower() for w in ["warn", "warning"]):
                    level = "WARNING"
                elif any(w in line.lower() for w in ["debug"]):
                    level = "DEBUG"
                entries.append(
                    {
                        "server": server_name,
                        "msg": line,
                        "level": level,
                        "source_file": log_file.name,
                    }
                )
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
            return {
                "available": False,
                "error": stderr.decode(errors="replace").strip(),
            }

        lines = [
            ln.strip()
            for ln in stdout.decode(errors="replace").splitlines()
            if ln.strip()
        ]
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
        return {
            "available": False,
            "error": "nvidia-smi not found — not a CUDA system?",
        }
    except asyncio.TimeoutError:
        return {"available": False, "error": "nvidia-smi timed out"}
    except Exception as e:
        return {"available": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Ollama model list
# ---------------------------------------------------------------------------


async def get_ollama_models(
    ollama_url: str = "http://localhost:11434",
) -> Dict[str, Any]:
    """
    Fetch the list of locally available Ollama models.
    Returns {"available": False, "error": ...} if Ollama not running.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(f"{ollama_url}/api/tags")
            if resp.status_code != 200:
                return {
                    "available": False,
                    "error": f"Ollama returned {resp.status_code}",
                }
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
                        "parameter_size": m.get("details", {}).get(
                            "parameter_size", ""
                        ),
                        "quantization": m.get("details", {}).get(
                            "quantization_level", ""
                        ),
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
    """Check health of all servers, record results, and run supervisor."""
    # Refresh resource snapshot in thread (psutil blocks)
    try:
        asyncio.create_task(asyncio.to_thread(_refresh_resource_snapshot))
    except Exception as e:
        logger.warning("Resource snapshot task failed: %s — %s", type(e).__name__, e)

    servers = federation_manager.list_servers()
    tasks = [federation_manager.check_server_health(s) for s in servers]
    results = await asyncio.wait_for(
        asyncio.gather(*tasks, return_exceptions=True),
        timeout=120,
    )

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

        # Circuit breaker: track consecutive failures; skip frequent probes
        # for servers that have been dead a long time.
        cstate = _circuit_state.setdefault(
            sid, {"consecutive_failures": 0, "skip_until": None}
        )
        if entry["status"] == "healthy":
            cstate["consecutive_failures"] = 0
            cstate["skip_until"] = None
        else:
            cstate["consecutive_failures"] += 1
            if cstate["consecutive_failures"] >= CIRCUIT_BREAKER_FAILURE_COUNT:
                cstate["skip_until"] = datetime.now() + timedelta(
                    seconds=CIRCUIT_BREAKER_POLL_INTERVAL_S
                )
                # Still run supervisor once per circuit-breaker poll
        # If in circuit-breaker cooldown and not first trip, skip probe
        if cstate.get("skip_until") and datetime.now() < cstate["skip_until"]:
            continue

        # Supervisor: auto-restart supervised servers on failure
        if entry["status"] != "healthy":
            await _supervisor_on_health(
                sid,
                entry["status"],
                server_cfg,
                federation_manager,
            )
        else:
            await _supervisor_on_health(
                sid,
                "healthy",
                server_cfg,
                federation_manager,
            )

        # Also try to refresh tool cache for healthy HTTP servers
        mcp_ep = server_cfg.get("mcp_endpoint")
        if entry["status"] == "healthy" and mcp_ep and mcp_ep.startswith("http"):
            asyncio.create_task(fetch_tools(sid, mcp_ep))


async def _monitor_loop(federation_manager: Any) -> None:
    logger.info("Health monitor started — polling every %ds", POLL_INTERVAL)
    # Let the event loop handle initial HTTP requests before first poll
    await asyncio.sleep(5)
    while True:
        try:
            await _poll_once(federation_manager)
        except Exception as e:
            logger.error("Health monitor poll error: %s — %s", type(e).__name__, e)
        await asyncio.sleep(POLL_INTERVAL)


def start_monitor(federation_manager: Any) -> None:
    """Launch the background polling task. Call once at app startup."""
    global _monitor_task, _supervisor_started_at
    if _monitor_task and not _monitor_task.done():
        return
    _merge_persisted_supervisor()
    _supervisor_started_at = datetime.now(timezone.utc)
    _monitor_task = asyncio.create_task(_monitor_loop(federation_manager))
    # Also schedule fleet bootstrap after the grace period
    asyncio.create_task(_bootstrap_fleet(federation_manager))
    logger.info(
        "Health monitor task created — supervisor grace period: %ds",
        SUPERVISOR_STARTUP_GRACE_S,
    )


# ---------------------------------------------------------------------------
# Fleet bootstrap — start all supervised servers at hub boot
# ---------------------------------------------------------------------------

# Bootstrap priority derived from the existing ``tier`` field.
# Lower number = starts faster with smaller inter-launch delay.
_TIER_PRIORITY = {
    "core": 0,
    "gold": 1,
    "showcase": 2,
    "creative": 3,
    "infrastructure": 4,
    "utility": 5,
}

_TIER_DELAY = {
    0: 0.2,  # core tier
    1: 0.3,  # gold
    2: 0.5,  # showcase
    3: 0.8,  # creative
    4: 1.0,  # infrastructure
    5: 1.5,  # utility
}


def _bootstrap_priority(server_cfg: Dict[str, Any]) -> int:
    """Return a numeric priority for a server (lower = start earlier)."""
    explicit = server_cfg.get("bootstrap_priority")
    if explicit is not None:
        return int(explicit)
    return _TIER_PRIORITY.get(server_cfg.get("tier", ""), 9)


async def run_bootstrap_batch(federation_manager: Any) -> Dict[str, Any]:
    """Start the curated 20-server bootstrap fleet immediately."""
    servers = federation_manager.list_servers()
    by_id = {s["id"]: s for s in servers if s.get("id")}
    nssm_owned = nssm_mod.nssm_installed_server_ids()
    to_start = [
        by_id[sid]
        for sid in BOOTSTRAP_SERVER_IDS
        if sid in by_id
        and sid not in nssm_owned
        and by_id[sid].get("type") != "remote_hub"
        and by_id[sid].get("status") != "disabled"
    ]
    if nssm_owned:
        logger.info(
            "Fleet bootstrap: skipping NSSM-managed servers: %s",
            ", ".join(sorted(nssm_owned)),
        )
    missing = sorted(BOOTSTRAP_SERVER_IDS - set(by_id.keys()))
    if missing:
        logger.warning(
            "Fleet bootstrap: %d configured ids missing from federation-config: %s",
            len(missing),
            ", ".join(missing),
        )

    to_start.sort(
        key=lambda s: (
            _bootstrap_priority(s),
            0 if s["id"] in CORE_SERVERS else 1,
            s["id"],
        )
    )

    capped = to_start[:MAX_BOOTSTRAP_SERVERS]
    logger.info(
        "Fleet bootstrap: launching %d curated servers (ids=%s)",
        len(capped),
        ", ".join(s["id"] for s in capped),
    )

    started = 0
    skipped_alive = 0
    skipped_no_repo = 0
    skipped_errored = 0
    core_ok = 0
    core_failed = 0
    details: List[Dict[str, Any]] = []

    for server_cfg in capped:
        sid = server_cfg["id"]
        port = _bootstrap_port(server_cfg)
        repo_path = server_cfg.get("repo_path")
        priority = _bootstrap_priority(server_cfg)

        if port and await _health_check(port, host="127.0.0.1"):
            skipped_alive += 1
            if sid in CORE_SERVERS:
                core_ok += 1
            details.append({"id": sid, "status": "already_running", "port": port})
            continue

        result = await start_server(
            sid,
            repo_path=repo_path,
            headless=True,
            port=port,
            mcp_path="/mcp",
            server_config=server_cfg,
        )

        if result.get("ok"):
            started += 1
            if sid in CORE_SERVERS:
                core_ok += 1
            if port:
                healthy = await _verify_health_after_start(port)
                status_icon = "ok" if healthy else "TIMEOUT"
            else:
                healthy = False
                status_icon = "started"
            logger.info(
                "Fleet bootstrap: [p%d] %s started (PID %s) %s",
                priority,
                sid,
                result.get("pid"),
                status_icon,
            )
            details.append(
                {
                    "id": sid,
                    "status": status_icon,
                    "port": port,
                    "pid": result.get("pid"),
                    "mode": result.get("mode"),
                }
            )
        elif result.get("already_running"):
            skipped_alive += 1
            if sid in CORE_SERVERS:
                core_ok += 1
            details.append({"id": sid, "status": "already_running", "port": port})
        else:
            error = result.get("error", "?")
            if "Repo path not found" in error:
                skipped_no_repo += 1
            else:
                skipped_errored += 1
            if sid in CORE_SERVERS:
                core_failed += 1
            logger.warning(
                "Fleet bootstrap: [p%d] %s failed — %s", priority, sid, error
            )
            details.append({"id": sid, "status": "error", "error": error})

        delay = _TIER_DELAY.get(priority, 3.0)
        await asyncio.sleep(delay)

    summary = {
        "started": started,
        "already_running": skipped_alive,
        "no_repo": skipped_no_repo,
        "errors": skipped_errored,
        "core_ok": core_ok,
        "core_failed": core_failed,
        "missing_config_ids": missing,
        "servers": details,
    }
    logger.info(
        "Fleet bootstrap complete: started=%d alive=%d no_repo=%d errors=%d"
        " | core: %d ok %d failed",
        started,
        skipped_alive,
        skipped_no_repo,
        skipped_errored,
        core_ok,
        core_failed,
    )
    if core_failed > 0:
        logger.error(
            "Fleet bootstrap: %d CORE servers failed to start — check start scripts",
            core_failed,
        )
    return summary


async def _bootstrap_fleet(federation_manager: Any) -> None:
    """Start the curated bootstrap fleet after the grace period expires."""
    await asyncio.sleep(SUPERVISOR_STARTUP_GRACE_S + 15)
    await run_bootstrap_batch(federation_manager)
