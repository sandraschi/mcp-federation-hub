# Changelog

All notable changes to the MCP Federation Hub will be documented in this file.

## [1.5.0] - 2026-05-19

### Added
- **Four new fleet servers registered**: `godot-mcp` (10992/10993), `freecad-mcp` (10944/10945), `qcad-mcp` (10966/10967), `yahboom-mcp` (10892/10893). New "engineering" category.
- **Fleet exchange depot**: `D:\Dev\repos\_exchange\` with subdirectories for cad/, models/, cfd/, avatars/, robots/. Documented convention for cross-server file handoff.
- **Total servers**: 74 → 78 registered. Categories: +1 (engineering).

### Changed
- `federation-config.json` server count 74 → 78. Creative category: +godot-mcp, +qcad-mcp. Robotics: +yahboom-mcp. Engineering: new with freecad-mcp.

## [1.4.0] - 2026-05-08

### Added
- **Fleet Supervisor**: Auto-restart supervised servers on 3 consecutive health failures with exponential backoff (60s → 120s → 240s → 300s cap). See `bridge/app/health_monitor.py` → `_supervisor_on_health()`.
- **Supervisor API**: `GET /api/v1/supervisor/status`, `POST /api/v1/supervisor/{id}/pause|resume`. Per-server state (failures, restart attempts, backoff timer, restart history, paused flag).
- **Resource gates**: RAM gate (<90%), fleet proc count gate (<60). CPU gate intentionally omitted (uv run startup spikes transiently to 100%). Max 1 concurrent restart.
- **Health check MCP fallback**: If standard health endpoints (`/health`, `/api/health`, `/api/status`, `/`) don't respond, probes the MCP `tools/list` JSON-RPC endpoint as a liveness signal.
- **Already-healthy guard**: Before restarting, the supervisor probes the server's health endpoint. If already healthy (port open + responding), the restart is skipped — no double-start or zombie kill.
- **Zombie port kill**: Before starting, `stop_server_by_port()` kills processes listening on the target port (async netstat, avoids blocking the event loop).
- **VIRTUAL_ENV isolation**: Child start.ps1 processes spawned by the supervisor run with `VIRTUAL_ENV` cleared, preventing uv environment mismatches ("does not match project environment path" warnings).
- **NSSM Windows service**: `bridge/install-service.ps1` registers `mcp-federation-hub` as an auto-start Windows service via NSSM. Survives reboots. Also creates `bridge/service-wrapper.ps1`.
- **Start script migration tool**: `bridge/migrate-stdio-to-http.ps1` converts IDE MCP configs from stdio `"command"` to HTTP `"url"` transport for fleet-supervised servers. Backs up originals with timestamps.
- **Start script patcher**: `bridge/patch-start-ps1.ps1` adds `$SkipFrontend = $Headless` + `if (-not $SkipFrontend) { return }` guard to 117 fleet start.ps1 files. Backs up each file. Ensures `start.ps1 -Headless` (supervisor mode) skips Vite frontend startup.
- **`-NoExit` fix**: arxiv-mcp and winrar-mcp start.ps1 files patched to add `-NoExit` to PowerShell `Start-Process` calls, keeping backend error windows open on crash instead of vanishing silently.
- Two new fleet servers registered: `speech-mcp` (10908/10909) and `onenote-mcp` (10906/10907).
- `bridge/AGENTS.md` with architecture diagram, supervisor timeline, API reference, and operational commands.

### Fixed
- **Circular import**: `main.py` → `sampling.py` → `main.py` resolved with lazy getter `_get_federation_manager()` in sampling.py.
- **Hanging imports**: `openai` (config sync), `httpx` (network probe), `fastmcp.sampling` all hang at module level. Moved to lazy imports — `sampling` and `ai_service` are now initialized in `init_services()` called from the lifespan hook, AFTER the health endpoint is serving.
- **Event loop blocking**: `stop_server_by_port()` used sync `subprocess.run(netstat)` blocking the uvicorn event loop. Rewritten to use `asyncio.create_subprocess_exec`.
- **First poll delay**: `_monitor_loop` now sleeps 5s before the first poll, giving the health endpoint time to start responding.
- **Port leak**: Bridge restarts can leave orphaned TCP connections in LISTEN state on Windows. This requires a reboot to fully clear.

### Changed
- `start_server()` now uses start.ps1 as primary launch mechanism (no more auto-detection of Python modules). The start.ps1 `-Headless` flag plus the `$SkipFrontend` patch ensures only the Python backend starts.
- Supervisor concurrency reduced from 5 to 1 (parallel `uv run` imports are CPU-heavy).
- Grace period: 120s after hub startup before failure counting begins.
- `federation-config.json`: added `supervised` (bool), `headless` (bool), `start_cmd` (string, optional) fields per server. Added entries for speech-mcp and onenote-mcp.
- `WEBAPP_PORTS.md`: added speech-mcp (10908/10909) and onenote-mcp (10906/10907) port registrations.

## [1.3.0] - 2026-03-14

### Added
- **Mesh (peers)**: Hub-to-hub connectivity. Add remote hubs by URL or invite link; tool calls can target a peer (forwarded over HTTPS with optional Bearer token). See [docs/PEERS_AND_MESH.md](docs/PEERS_AND_MESH.md).
- **Peers API**: `GET/POST/DELETE /api/v1/peers`, `GET /api/v1/peers/me`, `POST /api/v1/peers/invoke`. Persisted in `bridge/peers.json` (`my_token`, `public_url`, `remote_hubs`).
- **Peers page**: Invite link (copy), add remote hub (paste invite or URL + token), list peers with online/offline and encrypted badge. Sidebar entry under "Peers".
- **Security page (revamp)**: Live data from bridge: PEER_TOKEN status, hub encryption (HTTPS/HTTP), remote peers count and list with "Manage →" link to Peers. Invite link and peer token copy. Security posture notes (bridge port, dashboard exposure, peer invoke auth, config save, hub-to-hub HTTPS).
- **Docs**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API.md](docs/API.md), [docs/PEERS_AND_MESH.md](docs/PEERS_AND_MESH.md), [docs/README.md](docs/README.md). Full endpoint reference, peer module function reference, and concepts.
- **MCP Central entry**: [mcp-central-docs/projects/federation-mcp/](https://github.com/sandraschi/mcp-central-docs/tree/main/projects/federation-mcp) with README and projects index row.

### Changed
- **Start script**: `webapp/start.ps1` runs the bridge from `bridge/` with `app.main:app` (fixes `ModuleNotFoundError: mcp_federation_hub`). Backend started via `uv run python -m uvicorn app.main:app` from `bridge/` with `WorkingDirectory` set to bridge root.
- **Bridge**: FederationManager merges remote hub peers into server list (category `peers`). Tool calls to a peer use `POST {base_url}/api/v1/peers/invoke` with Bearer token. CORS extended for dashboard origin (10856).
- **Default API URL**: Webapp `VITE_API_URL` default set to `http://localhost:10857` (bridge port).
- **README**: Ports 10856/10857, Peers in architecture, documentation section with links to docs/, WEBAPP_OVERVIEW, and MCP Central entry.

## [1.2.0] - 2026-02-28

### Added
- **Phase 5 Cognitive Modules**: Integrated experimental "Nano Banana" FTL data bus and Mind Uploading categories.
- **Neural Audio Synthesis**: Implemented **Lyria 3** synaptic audio jingle using the procedural Web Audio API. 
- **Interactive Handshake**: Header component now supports real-time audio-visual synchronization of jingle staging.
- **SOTA Path Aliases**: Optimized `@/hooks` and `@/hooks/useNeuralJingle` resolution.

### Changed
- **Dashboard Phase Escalation**: Upgraded orchestration level to Phase 5.
- **Accessibility pass**: Added descriptive titles and ARIA roles to all interactive SOTA elements.

## [1.1.0] - 2026-02-28

### Added
- **Full-Spectrum SOTA Redesign**: Complete overhaul of all 10 standard pages with "Neon Slate" aesthetics.
- **Retractable Navigation**: Sidebar with icon-only mode and smooth width transitions via `framer-motion`.
- **Advanced Telemetry**: Integrated `recharts` for high-density tracking in Dashboard, Intelligence, and Health pages.
- **Tools Lab**: Schema-aware tool execution playground with real-time output viewer.
- **Enhanced Topbar**: Integrated live orchestration logger, help access, and user profile management.
- **Fluid Transitions**: Page-level entry/exit animations with `AnimatePresence`.

### Changed
- **Visual Identity**: Transitioned from basic glassmorphism to high-contrast SOTA-card architecture.
- **Typography Suite**: Standardized on `Outfit` (headings) and `JetBrains Mono` / `Inter` (UI/Data).

## [1.0.0] - 2026-02-28... (truncated)
