# MCP Federation Hub – Webapp and Bridge at a Glance

**One sentence:** Unified dashboard and API layer to discover, monitor, and call tools on many MCP servers (and remote hub peers) from one place.

For full architecture, every API endpoint, and all peer/mesh functions, see **[../docs/](docs/)** (especially [ARCHITECTURE.md](../docs/ARCHITECTURE.md), [API.md](../docs/API.md), [PEERS_AND_MESH.md](../docs/PEERS_AND_MESH.md)).

---

## Backend (Federation Bridge – FastAPI)

Runs from **`bridge/`**. Default port: **10857**.

| Area | What it does |
|------|-------------------------------|
| **Servers** | List federated MCP servers + remote hub peers, get config, check health per server and for the whole federation. |
| **Tool calls** | `POST /api/v1/tools/call` – route a tool call to a specific server or peer (or use AI to pick one with `server_id: "auto"`). |
| **Peers (mesh)** | Add/remove remote hubs, get “my invite link,” list peers with status. Hub-to-hub calls use HTTPS and optional Bearer token (encrypted links). See [PEERS_AND_MESH.md](../docs/PEERS_AND_MESH.md). |
| **AI** | Analyze server capabilities, suggest routing from natural language, optimize federation config. |
| **WorldLabs** | Proxy to WorldLabs MCP: generate world from text/image/video, status, download, formats, usage. |
| **Sampling** | FastMCP-style sampling: sample servers by capability or by tool name, health analysis, intelligent routing. |
| **Apps** | List registered webapps from a registry JSON; launch an app by ID (runs its `start.bat` or start command). |

**Bridge tools (FastMCP)**  
`sample_servers_for_capability`, `sample_servers_for_tool`, `intelligent_route_request`, `analyze_federation_health`, `optimize_federation_config`.

---

## Frontend (this webapp – Vite/React)

Default port: **10856**. Set `VITE_API_URL` to the bridge URL (e.g. `http://localhost:10857`) if the bridge runs elsewhere.

| Page | Purpose |
|------|---------|
| **Dashboard** | Telemetry and federation health. |
| **Servers** | Manage and monitor federated MCP nodes (and peers). |
| **Peers** | Your invite link (copy), add remote hub (paste invite link or URL + token), list peers with online/offline and “Encrypted” badge. Security: hub-to-hub links use HTTPS and optional Bearer tokens. |
| **Categories** | Browse servers by category (peers appear in “peers”). |
| **Health** | Node health and resource charts. |
| **Tools** | Tools Lab – call MCP tools with schema introspection and result view (can target a peer as server). |
| **Apps** | List and launch registered webapps (via bridge). |
| **Security** | Live peer/mesh security: PEER_TOKEN status, hub encryption (HTTPS/HTTP), remote peers list with online/encrypted badges, invite link and token copy, "Manage →" to Peers. Security posture notes (bridge port, dashboard exposure, peer invoke auth, config save, hub-to-hub HTTPS). |
| **Intelligence** | Hardware telemetry (e.g. GPU, LLM threads). |
| **Worlds** | WorldLabs-style environment management. |

---

## How to run

- **One-click:** Run **`start.bat`** in `webapp/`; it starts the bridge from `bridge/` and the Vite dev server from `webapp/`.
- **Manual:** From repo root: `cd bridge`, `uv sync`, `uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 10857`. In another terminal: `cd webapp`, `npm install`, `npm run dev` (dashboard on 10856).
