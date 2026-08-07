# MCP Federation Hub – Documentation Index

Thorough reference for architecture, API, and mesh (peers). **Version 1.5.0**.

---

## Documents

| Document | Contents |
|----------|----------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Core concepts (federation, bridge vs dashboard, server vs peer). **New**: Fleet auth, circuit breaker, tool call retry, bootstrap health verification, supervisor persistence, config constants module, request-ID middleware. Full operational characteristics table. |
| **[API.md](API.md)** | Full API reference: every endpoint (health, servers, tools, peers, AI, sampling, WorldLabs, apps, **supervisor/fleet ops**). Request/response shapes and error behavior. Federation config schema with new fields (`supervised`, `headless`, `bootstrap_priority`). |
| **[PEERS_AND_MESH.md](PEERS_AND_MESH.md)** | Mesh (hub-to-hub) feature: concepts (peer, invite link, encrypted links). **Updated**: `server_id` field in `PeerInvokeRequest`. All functions in `bridge/app/peers.py` with behavior and side effects. Bridge API behavior for peers, security, env vars, and step-by-step workflow to connect two hubs. |

---

## Quick pointers

- **Run everything**: From repo root, run `webapp/start.bat` (starts bridge from `bridge/` and Vite from `webapp/`). Bridge: 10857, Dashboard: 10856.
- **Add a remote hub**: Dashboard -> Peers -> paste the other hub's invite link (or URL + token). Use HTTPS for encrypted links.
- **Enable fleet auth**: Set `FLEET_TOKEN` env var to require Bearer auth on management endpoints.
- **Security page**: Shows live PEER_TOKEN status, hub encryption, remote peers; invite link and token copy; security posture notes. Link to Peers to manage hubs.
- **API base**: `http://localhost:10857`. Interactive docs: `http://localhost:10857/redoc`.
- **Config**: All paths, ports, and tuning knobs live in `bridge/app/config.py` (env-var overridable).
