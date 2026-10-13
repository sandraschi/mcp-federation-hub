"""Federation bridge configuration constants — single source of truth.

All hardcoded paths, port defaults, and tuning knobs live here so
changing a Windows user or repo layout only requires editing one file.
"""

import os
from pathlib import Path
from typing import Any

# ── Fleet paths ──────────────────────────────────────────────────────
REPOS_ROOT = Path(os.environ.get("FLEET_REPOS_ROOT", "D:/Dev/repos"))
CENTRAL_DOCS = REPOS_ROOT / "mcp-central-docs"
WEBAPP_PORTS_MD = CENTRAL_DOCS / "operations" / "WEBAPP_PORTS.md"
WEBAPP_REGISTRY_JSON = CENTRAL_DOCS / "operations" / "webapp-registry.json"
STARTS_UI_BAT = CENTRAL_DOCS / "starts-ui-start.bat"
FLEET_STARTS_URL_DEFAULT = "http://127.0.0.1:10796/"

# ── Bridge ports ─────────────────────────────────────────────────────
DEFAULT_BRIDGE_PORT = 10857
DEFAULT_DASHBOARD_PORT = 10856

# ── Federation config ────────────────────────────────────────────────
FEDERATION_CONFIG_FILENAME = "federation-config.json"

# ── Auth ─────────────────────────────────────────────────────────────
# Set FLEET_TOKEN env var to require Bearer auth on management endpoints.
# Empty = no auth (localhost dev). Required when FLEET_REMOTE_ACCESS=1.
FLEET_TOKEN = os.environ.get("FLEET_TOKEN", "")

# ── Network bind (Tailscale / iOS remote access) ─────────────────────
# FLEET_REMOTE_ACCESS=1 binds the bridge to all interfaces (0.0.0.0).
# Backends stay on 127.0.0.1; iOS clients call the bridge at http://<tailscale-ip>:10857.
FLEET_REMOTE_ACCESS = os.environ.get("FLEET_REMOTE_ACCESS", "").lower() in (
    "1",
    "true",
    "yes",
)
_default_bind = "0.0.0.0" if FLEET_REMOTE_ACCESS else "127.0.0.1"  # noqa: S104 - explicit opt-in
FLEET_BIND_HOST = os.environ.get("FLEET_BIND_HOST", _default_bind)
FLEET_MCP_BIND_HOST = os.environ.get("FLEET_MCP_BIND_HOST", "127.0.0.1")

# ── Supervisor / bootstrap tuning ────────────────────────────────────
MAX_BOOTSTRAP_SERVERS = 20
BOOTSTRAP_VERIFY_TIMEOUT_S = 90  # max wait per server for port open after start

# Explicit bootstrap fleet — 20 important servers (not "first 20 supervised").
# mcp_port = backend MCP/HTTP port (from WEBAPP_PORTS.md).
BOOTSTRAP_SERVERS: dict[str, dict[str, Any]] = {
    "git-github-mcp": {"mcp_port": 10702, "start_cmd": "uv run git-github-mcp"},
    "filesystem-mcp": {"mcp_port": 10742},
    "devices-mcp": {"mcp_port": 10717},
    "advanced-memory-mcp": {"mcp_port": 10705},
    "arxiv-mcp": {"mcp_port": 10770},
    "calibre-mcp": {"mcp_port": 10720},
    "plex-mcp": {"mcp_port": 10740},
    "yahboom-mcp": {"mcp_port": 10892},
    "tailscale-mcp": {"mcp_port": 10821},
    "home-assistant-mcp": {"mcp_port": 10835},
    "docker-mcp": {"mcp_port": 10807},
    "virtualization-mcp": {"mcp_port": 10700},
    "ring-mcp": {"mcp_port": 10728},
    "speech-mcp": {"mcp_port": 10909},
    "email-mcp": {"mcp_port": 10813},
    "fastsearch-mcp": {"mcp_port": 10845},
    "bookmarks-mcp": {"mcp_port": 10803},
    "system-admin-mcp": {"mcp_port": 10861},
    "local-llm-mcp": {"mcp_port": 10833},
    "rustdesk-mcp": {"mcp_port": 10805},
}
BOOTSTRAP_SERVER_IDS = frozenset(BOOTSTRAP_SERVERS.keys())

# ── NSSM hybrid (bridge service + optional per-MCP Windows services) ─
NSSM_SERVICES_FILENAME = "nssm-services.json"
NSSM_SERVICE_PREFIX = "mcp-"
NSSM_BRIDGE_SERVICE = "mcp-federation-hub"

# Optional per-MCP NSSM — not started by bridge when installed as Windows service.
NSSM_OPTIONAL_CANDIDATES: frozenset[str] = frozenset({"fleet-agent-mcp"})
NSSM_FUTURE_CANDIDATES: frozenset[str] = frozenset({"robofang-mcp"})

# LanceDB / RAG backends — flagged in UI (bootstrap RAM hint).
NSSM_HEAVY_MEMORY_IDS: frozenset[str] = frozenset(
    {
        "advanced-memory-mcp",
        "calibre-mcp",
        "plex-mcp",
    }
)

# Never auto-select in NSSM presets (little desktop-app wrappers).
NSSM_APP_WRAPPER_IDS: frozenset[str] = frozenset(
    {
        "beyondcompare-mcp",
        "winrar-mcp",
        "notepadpp-mcp",
        "handbrake-mcp",
        "davinci-resolve-mcp",
        "blender-mcp",
        "gimp-mcp",
        "inkscape-mcp",
        "dark-app-factory",
        "reaper-mcp",
        "virtualdj-mcp",
        "obs-mcp",
    }
)

# ── Health probe ─────────────────────────────────────────────────────
HEALTH_PROBE_TIMEOUT_S = 2.5
HEALTH_POLL_INTERVAL_S = 30

# ── Circuit breaker (decayed probe for long-dead servers) ────────────
CIRCUIT_BREAKER_FAILURE_COUNT = 5  # after N consecutive failures, slow polling
CIRCUIT_BREAKER_POLL_INTERVAL_S = 300  # poll dead servers every 5 min

# ── Tool call ────────────────────────────────────────────────────────
TOOL_CALL_TIMEOUT_S = 30.0
TOOL_CALL_MAX_RETRIES = 2
TOOL_CALL_RETRY_DELAY_S = 1.0

# ── Log tail ─────────────────────────────────────────────────────────
# The NSSM service sets APPDATA to the interactive user's profile.
CLAUDE_LOG_DIR = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "Claude" / "logs"
