# Changelog

All notable changes to the MCP Federation Hub will be documented in this file.

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
