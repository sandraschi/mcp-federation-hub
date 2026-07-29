"""NSSM fleet service selection and live status for MCP backends."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import (
    BOOTSTRAP_SERVER_IDS,
    NSSM_APP_WRAPPER_IDS,
    NSSM_BRIDGE_SERVICE,
    NSSM_FUTURE_CANDIDATES,
    NSSM_HEAVY_MEMORY_IDS,
    NSSM_OPTIONAL_CANDIDATES,
    NSSM_SERVICE_PREFIX,
    NSSM_SERVICES_FILENAME,
)
from . import health_monitor as hmon

logger = logging.getLogger(__name__)

_NSSM_CONFIG_PATH = Path(__file__).parent.parent / NSSM_SERVICES_FILENAME


def _nssm_exe() -> Optional[str]:
    found = shutil.which("nssm")
    if found:
        return found
    winget_link = Path.home() / "AppData/Local/Microsoft/WinGet/Links/nssm.exe"
    if winget_link.is_file():
        return str(winget_link)
    return None


def service_name(server_id: str) -> str:
    """Windows service name for a fleet MCP server."""
    sid = server_id.strip().lower()
    if sid == "mcp-federation-hub":
        return NSSM_BRIDGE_SERVICE
    return f"{NSSM_SERVICE_PREFIX}{sid}"


def load_config() -> Dict[str, Any]:
    """Load nssm-services.json; seed defaults if missing."""
    if _NSSM_CONFIG_PATH.is_file():
        try:
            with open(_NSSM_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return _normalize_config(data)
        except Exception as e:
            logger.warning("nssm config load failed: %s", e)

    return _normalize_config(
        {
            "version": 1,
            "service_prefix": NSSM_SERVICE_PREFIX,
            "bridge_service": NSSM_BRIDGE_SERVICE,
            "app_wrappers": sorted(NSSM_APP_WRAPPER_IDS),
            "default_selected": sorted(BOOTSTRAP_SERVER_IDS),
            "selected": sorted(BOOTSTRAP_SERVER_IDS),
        }
    )


def _normalize_config(data: Dict[str, Any]) -> Dict[str, Any]:
    selected = set(data.get("selected") or [])
    wrappers = set(data.get("app_wrappers") or NSSM_APP_WRAPPER_IDS)
    candidates = set(data.get("nssm_optional_candidates") or NSSM_OPTIONAL_CANDIDATES)
    future = set(data.get("nssm_future_candidates") or NSSM_FUTURE_CANDIDATES)
    data["selected"] = sorted(selected)
    data["app_wrappers"] = sorted(wrappers)
    data["nssm_optional_candidates"] = sorted(candidates)
    data["nssm_future_candidates"] = sorted(future)
    data.setdefault("service_prefix", NSSM_SERVICE_PREFIX)
    data.setdefault("bridge_service", NSSM_BRIDGE_SERVICE)
    data.setdefault("mode", "hybrid")
    data.setdefault("version", 2)
    return data


def nssm_installed_server_ids() -> frozenset[str]:
    """Server IDs with an installed Windows service (excludes bridge)."""
    installed: set[str] = set()
    for sid in load_config().get("selected") or []:
        svc = service_name(sid)
        if _windows_service_exists(svc):
            installed.add(sid)
    return frozenset(installed)


def deployment_model(server_id: str) -> str:
    """How this server is meant to run in hybrid mode."""
    if server_id in nssm_installed_server_ids():
        return "windows_service"
    if server_id in BOOTSTRAP_SERVER_IDS:
        return "bridge_bootstrap"
    return "bridge_supervised"


def save_config(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and persist nssm-services.json."""
    normalized = _normalize_config(dict(data))
    if "selected" not in normalized or not isinstance(normalized["selected"], list):
        raise ValueError("nssm config must include 'selected' list")

    _NSSM_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_NSSM_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(normalized, f, indent=2)
        f.write("\n")
    return normalized


def _nssm_status_sync(svc: str) -> str:
    """Return NSSM status string or 'NOT_INSTALLED'."""
    exe = _nssm_exe()
    if not exe:
        return "NSSM_UNAVAILABLE"
    try:
        proc = subprocess.run(
            [exe, "status", svc],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        out = (proc.stdout or proc.stderr or "").strip()
        if not out:
            return "UNKNOWN"
        first = out.splitlines()[0].strip().upper()
        if "SERVICE_" in first:
            return first
        return first or "UNKNOWN"
    except FileNotFoundError:
        return "NSSM_UNAVAILABLE"
    except Exception as e:
        logger.debug("nssm status %s: %s", svc, e)
        return "ERROR"


def _windows_service_exists(svc: str) -> bool:
    try:
        proc = subprocess.run(
            ["sc.exe", "query", svc],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        text = (proc.stdout or "") + (proc.stderr or "")
        return "1060" not in text and proc.returncode == 0
    except Exception:
        return False


def _port_listening(port: int) -> bool:
    import socket

    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.8):
            return True
    except OSError:
        return False


async def status_for_server(
    server_id: str,
    server_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """NSSM + runtime status for one MCP server."""
    cfg = dict(server_config or {})
    cfg.setdefault("id", server_id)
    svc = service_name(server_id)
    port = hmon._bootstrap_port(cfg)
    nssm_state = _nssm_status_sync(svc)
    installed = _windows_service_exists(svc)
    if nssm_state == "UNKNOWN" and not installed:
        nssm_state = "NOT_INSTALLED"

    port_open = False
    if port:
        port_open = await hmon._health_check(int(port), host="127.0.0.1")

    pid = hmon._pid_on_port(port) if port and port_open else None
    rss_mb = hmon._process_tree_rss_mb(pid) if pid else None

    running = nssm_state == "SERVICE_RUNNING" or (
        port_open and nssm_state in ("NOT_INSTALLED", "UNKNOWN", "NSSM_UNAVAILABLE")
    )

    return {
        "server_id": server_id,
        "service_name": svc,
        "nssm_status": nssm_state,
        "installed": installed,
        "port": port,
        "port_listening": port_open,
        "pid": pid,
        "rss_mb": rss_mb,
        "heavy_memory": server_id in NSSM_HEAVY_MEMORY_IDS,
        "running": running,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


async def status_all(
    federation_servers: List[Dict[str, Any]],
    include_unselected: bool = True,
) -> Dict[str, Any]:
    """Status for bridge + selected fleet servers (+ optional full fleet)."""
    nssm_cfg = load_config()
    selected = set(nssm_cfg.get("selected") or [])
    by_id = {s["id"]: s for s in federation_servers if s.get("id")}

    targets: List[str] = [NSSM_BRIDGE_SERVICE]
    if include_unselected:
        targets.extend(sorted(by_id.keys()))
    else:
        targets.extend(sorted(selected))

    # Bridge uses federation hub id in config — map service to hub entry
    seen = set()
    entries: List[Dict[str, Any]] = []

    async def add_entry(sid: str, conf: Optional[Dict[str, Any]] = None):
        if sid in seen:
            return
        seen.add(sid)
        if sid == NSSM_BRIDGE_SERVICE:
            entries.append(
                {
                    "server_id": "mcp-federation-hub",
                    "service_name": NSSM_BRIDGE_SERVICE,
                    "nssm_status": _nssm_status_sync(NSSM_BRIDGE_SERVICE),
                    "installed": _windows_service_exists(NSSM_BRIDGE_SERVICE),
                    "port": 10857,
                    "port_listening": _port_listening(10857),
                    "pid": hmon._pid_on_port(10857) if _port_listening(10857) else None,
                    "running": _nssm_status_sync(NSSM_BRIDGE_SERVICE)
                    == "SERVICE_RUNNING"
                    or _port_listening(10857),
                    "selected": True,
                    "is_bridge": True,
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            return
        conf = conf or by_id.get(sid, {"id": sid})
        st = await status_for_server(sid, conf)
        st["selected"] = sid in selected
        st["is_app_wrapper"] = sid in set(nssm_cfg.get("app_wrappers") or [])
        st["deployment_model"] = deployment_model(sid)
        entries.append(st)

    await add_entry(NSSM_BRIDGE_SERVICE)

    for sid in sorted(by_id.keys()):
        if sid == "mcp-federation-hub":
            continue
        if not include_unselected and sid not in selected:
            continue
        await add_entry(sid, by_id[sid])

    installed_count = sum(1 for e in entries if e.get("installed"))
    running_count = sum(1 for e in entries if e.get("running"))
    selected_running = sum(1 for e in entries if e.get("selected") and e.get("running"))
    fleet_rss = round(sum(e.get("rss_mb") or 0 for e in entries if e.get("rss_mb")), 1)

    return {
        "nssm_available": _nssm_exe() is not None,
        "nssm_exe": _nssm_exe(),
        "config": nssm_cfg,
        "servers": entries,
        "summary": {
            "selected_count": len(selected),
            "installed_count": installed_count,
            "running_count": running_count,
            "selected_running": selected_running,
            "fleet_rss_mb": fleet_rss,
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def catalog_for_ui(federation_servers: List[Dict[str, Any]]) -> Dict[str, Any]:
    """NSSM advanced panel + bootstrap hints for hybrid fleet."""
    cfg = load_config()
    selected = set(cfg.get("selected") or [])
    candidates = set(cfg.get("nssm_optional_candidates") or NSSM_OPTIONAL_CANDIDATES)
    future = set(cfg.get("nssm_future_candidates") or NSSM_FUTURE_CANDIDATES)
    wrappers = set(cfg.get("app_wrappers") or NSSM_APP_WRAPPER_IDS)
    installed = nssm_installed_server_ids()

    nssm_rows = []
    for s in federation_servers:
        sid = s.get("id")
        if not sid or sid == "mcp-federation-hub":
            continue
        in_bootstrap = sid in BOOTSTRAP_SERVER_IDS
        is_candidate = sid in candidates or sid in future
        if not (selected or installed or is_candidate):
            continue
        nssm_rows.append(
            {
                "id": sid,
                "name": s.get("name", sid),
                "category": s.get("category", ""),
                "tier": s.get("tier", ""),
                "selected": sid in selected,
                "nssm_installed": sid in installed,
                "nssm_candidate": sid in candidates,
                "nssm_future": sid in future,
                "is_app_wrapper": sid in wrappers,
                "heavy_memory": sid in NSSM_HEAVY_MEMORY_IDS,
                "bootstrap_member": in_bootstrap,
                "deployment_model": deployment_model(sid),
                "recommended_nssm": sid in candidates,
            }
        )

    return {
        "mode": cfg.get("mode", "hybrid"),
        "config": cfg,
        "catalog": sorted(
            nssm_rows,
            key=lambda x: (
                not x["nssm_installed"],
                not x["selected"],
                not x["nssm_candidate"],
                x["name"],
            ),
        ),
        "bootstrap_ids": sorted(BOOTSTRAP_SERVER_IDS),
        "presets": {
            "candidates": sorted(candidates),
            "none": [],
        },
    }
