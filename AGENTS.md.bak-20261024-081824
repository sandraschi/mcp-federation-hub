# MCP Federation Hub — Agent Operational Notes

## Bookmark
**`http://localhost:10856`** — Fleet dashboard (servers, health, categories, descriptions, port map, supervisor)

## Architecture

```
NSSM (Windows service) → service-wrapper.ps1 → uvicorn (10857)
  ├─ Health monitor — 30s poll across all fleet servers
  │   └─ 120s gather timeout (71 servers)
  │   └─ Shared httpx client (max_connections=20) — prevents port exhaustion
  ├─ Fleet Bootstrap — starts up to MAX_BOOTSTRAP_SERVERS supervised servers
  │   └─ Single pass sorted by (tier priority, core flag, server id)
  │   └─ MAX_BOOTSTRAP_SERVERS=20 (config.py — cap prevents host lockup)
  │   └─ Verifies via MCP tools/list POST after each start (BOOTSTRAP_VERIFY_TIMEOUT_S=30s)
  │   └─ CORE_SERVERS set in health_monitor.py
  ├─ Request-ID middleware — injects X-Request-ID header on every response
  ├─ Fleet token auth — FLEET_TOKEN env var gates management endpoints
  ├─ Circuit breaker — dead servers probed every 300s after 5 consecutive fails
  ├─ Tool call retry — 2 retries with exponential backoff (1s, 2s)
  ├─ Supervisor state persistence — bridge/supervisor_state.json survives restart
  └─ Config constants — all paths/ports/tuning knobs in bridge/app/config.py
  ├─ Fleet Supervisor — auto-restart with exponential backoff
  │   ├─ 120s startup grace period (avoids cold-start mass-launch)
  │   ├─ 3 consecutive failures → restart trigger
  │   ├─ Max 1 concurrent restart
  │   ├─ RAM gate (<90%), fleet proc gate (<60)
  │   ├─ CPU gate REMOVED — uv run startup spikes transiently to 100%
  │   ├─ Exponential backoff: 60s → 120s → 240s → 300s cap
  │   ├─ Already-healthy check via MCP tools/list before restart (avoids double-start)
  │   ├─ VIRTUAL_ENV env var cleaned before spawning children (prevents venv contamination)
  │   └─ Zombie kill on port before start
  ├─ Dashboard (10856) — Vite + React SPA
  │   └─ Servers page: supervisor controls (pause/resume + state per server)
  ├─ Port map — live audit from WEBAPP_PORTS.md (bridge/app/health_monitor.py)
  │   └─ _build_backend_port_map() — caches 5 min, used as health probe fallback
  └─ Health check chain:
      ├─ Supervisor pre-restart: MCP tools/list POST on /mcp (every FastMCP server supports it)
      └─ Dashboard health display: GET chain /health → /api/health → /api/status → /
```

## Running

```powershell
# NSSM — bridge + fleet MCP backends
# Hybrid NSSM — bridge required; per-MCP optional (see nssm-services.json)
D:\Dev\repos\mcp-federation-hub\bridge\install-service.ps1
D:\Dev\repos\mcp-federation-hub\bridge\install-mcp-services.ps1 -List
D:\Dev\repos\mcp-federation-hub\bridge\install-mcp-services.ps1 -Apply -ServerId fleet-agent-mcp

# Manual start:
D:\Dev\repos\mcp-federation-hub\webapp\start.ps1 -Headless

# Status / restart / stop (requires Admin):
nssm status mcp-federation-hub
nssm restart mcp-federation-hub
nssm stop mcp-federation-hub

# NSSM live status API: GET /api/v1/nssm/status?selected_only=true

# System tray icon (shows server count, right-click for dashboard):
D:\Dev\repos\mcp-federation-hub\fleet-tray.ahk
# Or: fleet-tray.bat
```

**Boot time**: ~45s (fastapi + uvicorn imports). Wait 60s after boot for health endpoint.

## Supervisor API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/supervisor/status` | Per-server state (failures, restarts, backoff, paused) |
| POST | `/api/v1/supervisor/{id}/pause` | Pause auto-restart for one server |
| POST | `/api/v1/supervisor/{id}/resume` | Resume with backoff reset |
| GET | `/api/v1/health/history` | 2h per-server health history |
| GET | `/api/v1/health/uptime` | Per-server uptime percentages |
| GET | `/api/v1/portmap` | Fleet port audit (open/closed) |

## Server config (`federation-config.json`)

```json
{
  "id": "example-mcp",
  "supervised": true,   // auto-restart (default: true)
  "headless": true,     // no console window (default: true)
  "web_interface": "http://localhost:107xx",
  "mcp_port": 107xx,    // optional, derived from web_interface if absent
  "tier": "gold"        // bootstrap priority: gold→showcase→core→premium→standard→utility
}
```

## Start script conventions

Fleet web launchers dot-source `mcp-central-docs/standards/FleetStartMode.ps1`:

- **Both** (default): `webapp/start.ps1`
- **Backend only**: `-BackendOnly` or `-Headless` (bootstrap passes **both**)
- **Frontend only**: `-FrontendOnly`

Root `start.ps1` is usually stdio MCP or delegates to the web launcher.

## Cursor MCP: HTTP vs stdio

| Mode | When |
|------|------|
| **stdio** (`command` + `uv run` in `mcp.json`) | Default for Cursor — Cursor spawns the process; no daemon required |
| **HTTP** (`url: http://127.0.0.1:PORT/mcp`) | Use when fleet bootstrap already has backends running; Tailscale/iOS; shared daemon |

HTTP in Cursor works **if** the backend is up and exposes streamable HTTP `/mcp`.
It is not a bad idea for fleet-managed servers, but **avoid duplicating** the same server
in both stdio and HTTP (two processes, port fights). Pick one per server:

- **Cursor daily dev**: stdio (current `mcp.json`)
- **Remote / multi-client / federation**: HTTP on bootstrap ports via bridge or direct URL

## Boot sequence (supervisor timeline)

| Time | Event |
|------|-------|
| 0s | Bridge starts, lifespan hook dispatches `_init_services_async()` to background (non-blocking) |
| 5s | First health poll runs (120s gather timeout, socket-based, no httpx) |
| 120s | Grace period expires |
| 135s | **Fleet bootstrap fires** — starts supervised servers by tier priority |
| ~135s | core (priority 0, 0.2s delay): yahboom-mcp |
| ~136s | gold (priority 1, 0.3s delay): advanced-memory, devices, virtualization |
| ~137s | showcase (priority 2, 0.5s delay): calibre, plex, home-assistant, myai, mywienerlinien, vienna-live, worldlabs |
| ~145s | creative + infrastructure (0.8-1s delay): ~28 servers |
| ~180s | utility (1.5s delay): ~35 servers (winrar, notion, etc.) |
| 210s+ | Supervisor takes over (3-failure threshold) |

## Fleet bootstrap

Defined in `bridge/app/config.py` (`BOOTSTRAP_SERVERS`) and `health_monitor.py:run_bootstrap_batch()`.

**20 curated servers** — not “first 20 supervised”. Includes git-github, filesystem, devices, advanced-memory, arxiv, calibre, plex, yahboom, tailscale, home-assistant, docker, virtualization, ring, **speech-mcp**, email, fastsearch, bookmarks, system-admin, local-llm, rustdesk (winrar removed — app wrapper, NSSM opt-in only).

**Hybrid NSSM** (`bridge/nssm-services.json`, mode `hybrid`): default `selected` is empty — fleet runs as bridge child processes. Optional NSSM candidates: `fleet-agent-mcp`, future `robofang-mcp`. When an MCP NSSM service is **installed**, bootstrap and supervisor **skip** it.

**Bootstrap** (20 curated, `BOOTSTRAP_SERVERS`): memops, speech, email, yahboom, plex, calibre, infra… — not separate Windows services.

**Memory API**: `GET /api/v1/fleet/memory` — per-server RSS + cumulative fleet MiB on Servers page.

Manual trigger (no 135s wait): `POST /api/v1/bootstrap/run` (requires `FLEET_TOKEN` when set).

Headless starts use **backend-only** commands parsed from `webapp/start.ps1` (not root `start.ps1`, which often launches stdio MCP).

## Tailscale / iOS remote access

**Yes, this can work** — use the federation **bridge** as the single entry point:

1. Reinstall service with remote bind: `.\install-service.ps1 -RemoteAccess` (binds `0.0.0.0:10857`)
2. Set `FLEET_TOKEN` on the service (NSSM `AppEnvironmentExtra`) — required when exposed beyond localhost
3. From iPhone/iPad on Tailscale: `http://<windows-tailscale-ip>:10857`
   - Dashboard tools: `GET /api/v1/servers/{id}/tools`
   - Invoke tools: `POST /api/v1/tools/call` with `server_id`, `tool_name`, `arguments`
4. MCP backends stay on `127.0.0.1`; the bridge proxies to them locally — no need to expose 20 ports on Tailscale

iOS MCP clients that speak streamable HTTP can also hit individual backends if those bind `0.0.0.0` (not default). Prefer the bridge proxy pattern.

## Config constants (`bridge/app/config.py`)

Single source of truth for all hardcoded paths, ports, and tuning knobs.
Override via env vars:
- `FLEET_REPOS_ROOT` — fleet repos directory (default `D:/Dev/repos`)
- `FLEET_TOKEN` — Bearer token for management endpoint auth (empty = no auth)
- `FLEET_REMOTE_ACCESS=1` — bind bridge to `0.0.0.0` (Tailscale/LAN)
- `FLEET_BIND_HOST` — override bridge listen address (default `127.0.0.1`, or `0.0.0.0` when remote access on)

## Auth

Set `FLEET_TOKEN` to require `Authorization: Bearer <token>` on:
- `POST /api/v1/servers/{id}/start|stop`
- `POST /api/v1/bootstrap/run`
- `POST /api/v1/supervisor/{id}/pause|resume`
- `POST /api/v1/config/save`

## Circuit breaker

Servers that fail health checks `CIRCUIT_BREAKER_FAILURE_COUNT` (5) times
consecutively are probed every `CIRCUIT_BREAKER_POLL_INTERVAL_S` (300s) instead
of every poll cycle. Supervisor still fires once per circuit-breaker poll.

## Tool call retry

`_call_tool_on_server` retries up to `TOOL_CALL_MAX_RETRIES` (2) times with
exponential backoff (`TOOL_CALL_RETRY_DELAY_S` → 2× → 4×). Timeout: `TOOL_CALL_TIMEOUT_S` (30s).

## Recent fixes (2026-05-25)

| Issue | Fix |
|-------|-----|
| Lifespan hook blocks bridge startup — `FastMCP()` creation at import-time hangs forever | `init_services()` moved to background thread pool with 30s timeout; server boots instantly |
| httpx timeouts ignored on Python 3.13/Windows — health probes hang 30-120s | Replaced with raw `asyncio.open_connection()` socket checks (2s timeout, respected) |
| Health probes hit frontend ports (Vite) instead of backend ports | `_build_backend_port_map()` resolves backend ports from `WEBAPP_PORTS.md` |
| No proactive server startup — supervisor only reacted to failures | `_bootstrap_fleet()` starts all supervised servers in tier priority order after grace period |
| NSSM service wrapper double-spawn orphans uvicorn process | Rewrote wrapper to run uvicorn directly with netstat zombie retry loop (5 attempts) |
| `$pid` variable shadows PowerShell automatic PID | Renamed all `$pid` → `$zp` in webapp/start.ps1, service-wrapper.ps1, fleet-agent/start.ps1 |
| Zombie kill fails cross-user (Get-NetTCPConnection vs netstat) | All scripts use `netstat -ano` + `taskkill /F` (works from SYSTEM context) |
| Windows PowerShell 5.1 parse error on LF-only files | CRLF line endings; removed em-dash U+2014 chars |
| fleet-agent-mcp start.ps1 crashes on Get-CimInstance (needs admin) | Replaced with `netstat` + `taskkill` + `Stop-Process` |
| 100+ zombie Python processes from timed-out shell commands lock uv | Kill all stale PIDs in wrapper before starting |
| Dashboard has no drilldown — cards not clickable | Stat cards navigate to /servers, /health; server rows clickable |
| No UI for selecting which servers auto-start | Bootstrap Config panel on Servers page: checkboxes, presets, Save |
| Tools page shows only one-line descriptions | Detail modal on click: full description, params w/types/required, return format, examples |
| No `core` tier in bootstrap priority map | Added `"core"` at priority 0 and `_TIER_DELAY` entry |
| 71-server health probes create 3550 TCP connections (71 clients × 50 max) — saturates ASGI server | Shared httpx client at `FederationManager._get_client()` with `max_connections=20`; all probes reuse single client |
| `_health_check()` used 4-endpoint HTTP GET chain + MCP fallback — slow, noisy with 404s | Simplified to MCP `tools/list` POST only; every FastMCP server supports `POST /mcp` natively |
| `_health_probe_urls()` briefly changed to `/mcp` URL — broke GET-based dashboard health display | Reverted; `_health_probe_urls` keeps 4-endpoint GET chain; `_health_check` (supervisor pre-restart) is the MCP POST probe |
| Service restart race: port 10857 still held by old process → bind fails (errno 10048) | `service-wrapper.ps1`: zombie kill retry loop (5×1s) + uvicorn retry loop (3×3s) |
| CPU gate blocking all fleet servers ("CPU 98% > 98%") — transient uv startup spikes trigger false positive | Removed CPU gate from `_resources_blocked()`; RAM gate (90%) and fleet proc gate (60) remain |
| VIRTUAL_ENV from bridge `.venv` leaks into child `uv run` — servers crash with `ModuleNotFoundError` | `start_server()` pops `VIRTUAL_ENV` from env before `subprocess.Popen` |
| No supervisor controls in webapp (pause/resume, state, supervised toggle) | `Servers.tsx`: Supervisor column with On/Paused/Off badge, failure count, pause/resume button; `api.ts`: 3 new methods |
| Speech-mcp and blender-mcp return 404 on fleet health probes | Added `/api/health`, `/api/status`, `/` endpoints to both repos |

## Recent fixes (2026-05-17)

| Issue | Fix |
|-------|-----|
| Double-bootstrap: every supervised server started twice | Removed duplicate second pass; single tier+core-sorted pass |
| 68+ servers locking up host on bootstrap | `MAX_BOOTSTRAP_SERVERS=20` cap with warning log |
| Dead httpx code block unreachable after TCP check refactor | Removed 68 lines of unreachable code in `check_server_health` |
| Duplicate `_pid_on_port()` function defined twice | Removed first definition, kept second |
| `true` instead of `True` in Python code (`scripts/setup_federation.py`) | Fixed Python bool literals |
| Test asserts `"version"` key that doesn't exist in `/health` | Changed to `"federation"` key |
| `print()` in ai_service.py and main.py | Replaced with `logger.warning()` / `logger.info()` |
| Live peer token committed to `peers.json` | Reset to `null` |
| `from . import health_monitor as hmon` unused in sampling.py | Removed |
| FastMCP 3.0 docstrings — missing Annotated/Field, Return Format, Examples | FastMCP 3.2+ SOTA: Context, Annotated[Field], version tags, READ_ONLY annotations |
| 47 `.bak` files cluttering repo | Deleted |
| `scripts/setup_federation.py`: unused imports + `true` → NameError | Fixed |
| 4 hardcoded `D:/Dev/repos/...` paths | Extracted to `bridge/app/config.py` with env-var overrides |
| Dead sync `init_services()` never called | Removed; async `_init_services_async()` handles init via lifespan |
| `__main__` fallback port 8000 (forbidden) | Changed to `DEFAULT_BRIDGE_PORT=10857`, `reload=True→False` |
| No auth on management endpoints | `FLEET_TOKEN` env var + `_require_fleet_token` dependency |
| `open-fleet-starts` accepts arbitrary URLs | Sanitized — only `localhost`/`127.0.0.1` allowed |
| Peer invoke sprays tools against first available server | `PeerInvokeRequest` now has optional `server_id` field |
| No tool call retry — single 30s timeout | 2 retries with exponential backoff (1s, 2s, 4s) |
| Health poll blasts dead servers every 30s forever | Circuit breaker: after 5 fails → probe every 300s |
| Bootstrap starts servers without verifying they came up | Waits up to 30s for `/health` response per server |
| Supervisor state lost on bridge restart | Persisted to `bridge/supervisor_state.json` on every mutation |
| `/api/v1/federation/metrics` returns hardcoded zeros | Live counters: requests, tool_calls, tool_errors, health_polls, uptime |
| Debug scripts in production dir | Moved `_verify.py`, `_t.py` → `bridge/tools/` |
| `docker-compose.yml` deprecated `version: '3.8'` | Removed |

## Recent fixes (2026-05-08)

| Issue | Fix |
|-------|-----|
| "Health monitor poll error:" (blank) — 71-server gather timed out | `asyncio.wait_for` timeout 30→120s in `_poll_once()` |
| httpx default connection pool (10) bottlenecked 71 parallel probes | `httpx.Limits(max_connections=50)` on all probe clients |
| Fire-and-forget resource snapshot could silently fail | try/except around `asyncio.create_task` |
| Empty error logs made diagnosis impossible | log `type(e).__name__` alongside message |

## Error handling

- Health poll has **120s hard timeout** — if gather hangs, it abandons and continues
- `asyncio.gather` with `return_exceptions=True` — individual check failures don't crash the poll
- Poll errors logged with exception type AND message: `"Health monitor poll error: TimeoutError — "`
- Supervisor continues even if individual restarts fail — logs the error, moves on
- Core server failures generate `logger.error` (visible in dashboard)
- **Every failure** includes the server ID and error message in the log

## Lint

```powershell
cd D:\Dev\repos\mcp-federation-hub
just lint    # ruff check
just fix     # ruff fix + format
```
