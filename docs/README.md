# MCP Federation Hub – Documentation Index

Thorough reference for architecture, API, and mesh (peers).

---

## Documents

| Document | Contents |
|----------|----------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Core concepts (federation, bridge vs dashboard, server vs peer). Components: FederationManager, peers module, tool routing, peer invoke, AI service, sampling, apps registry, WorldLabs proxy. Data flow and config files. |
| **[API.md](API.md)** | Full API reference: every endpoint (health, servers, tools, peers, AI, sampling, WorldLabs, apps). Request/response shapes and error behavior. Federation config schema. |
| **[PEERS_AND_MESH.md](PEERS_AND_MESH.md)** | Mesh (hub-to-hub) feature: concepts (peer, invite link, encrypted links). All functions in `bridge/app/peers.py` with behavior and side effects. Bridge API behavior for peers, security, env vars, and step-by-step workflow to connect two hubs. |

---

## Quick pointers

- **Run everything**: From repo root, run `webapp/start.bat` (starts bridge from `bridge/` and Vite from `webapp/`). Bridge: 10857, Dashboard: 10856.
- **Add a remote hub**: Dashboard → Peers → paste the other hub’s invite link (or URL + token). Use HTTPS for encrypted links.
- **Security page**: Shows live PEER_TOKEN status, hub encryption, remote peers; invite link and token copy; security posture notes. Link to Peers to manage hubs.
- **API base**: `http://localhost:10857`. Interactive docs: `http://localhost:10857/redoc`.
