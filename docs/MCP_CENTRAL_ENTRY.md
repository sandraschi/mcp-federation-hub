# MCP Central Docs – Federation MCP project entry

Copy or merge this content into your **mcp-central-docs** project registry (e.g. under `projects/` or `operations/`) as the **federation-mcp** (or **mcp-federation-hub**) entry.

---

## Project: MCP Federation Hub (federation-mcp)

| Field | Value |
|-------|--------|
| **Name** | MCP Federation Hub |
| **Slug / ID** | federation-mcp (or mcp-federation-hub) |
| **Repository** | https://github.com/sandraschi/mcp-federation-hub |
| **License** | MIT |
| **Language / stack** | Python 3.13+ (bridge), Node 20+ (dashboard); FastAPI, FastMCP 3.x, React, Vite |
| **Purpose** | Unified orchestration layer for MCP server ecosystems: one API and dashboard to discover, monitor, and call tools on many MCP servers, plus hub-to-hub mesh (peers) with encrypted links. |

### Short description

Unified SOTA orchestration layer for MCP (Model Context Protocol) server ecosystems. The Federation Hub provides a central bridge (FastAPI) and dashboard (React/Vite) to:

- Aggregate many MCP servers behind one API (federation).
- List servers and peers, check health, and route tool calls (local MCP or remote hub).
- **Mesh (peers):** Connect to other Federation Hub instances via invite links; hub-to-hub calls use HTTPS and optional Bearer tokens (encrypted links).
- Optional AI routing (OpenAI/Ollama), FastMCP sampling, WorldLabs proxy, and webapp registry/launcher.

### Access points (default ports)

- **Dashboard:** http://localhost:10856  
- **Bridge API:** http://localhost:10857  
- **Redoc:** http://localhost:10857/redoc  

### Run (quick)

```powershell
# Clone
git clone https://github.com/sandraschi/mcp-federation-hub.git
cd mcp-federation-hub

# Backend
cd bridge
uv sync
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 10857

# Dashboard (separate terminal)
cd webapp
npm install
npm run dev
```

Or from `webapp/`: run **start.bat** (starts bridge + Vite).

### Documentation (in-repo)

- **Full docs:** [docs/](https://github.com/sandraschi/mcp-federation-hub/tree/main/docs)  
  - [ARCHITECTURE.md](https://github.com/sandraschi/mcp-federation-hub/blob/main/docs/ARCHITECTURE.md) – Concepts, components, data flow  
  - [API.md](https://github.com/sandraschi/mcp-federation-hub/blob/main/docs/API.md) – Every endpoint, request/response, config schema  
  - [PEERS_AND_MESH.md](https://github.com/sandraschi/mcp-federation-hub/blob/main/docs/PEERS_AND_MESH.md) – Hub-to-hub mesh, invite links, encryption, all peer functions  

### Key concepts

- **Federation:** One bridge aggregates many MCP servers (and remote hub peers) behind one API.
- **Bridge:** FastAPI app in `bridge/`; loads `federation-config.json` and `bridge/peers.json`; exposes REST API and merges peers into the server list.
- **Peer / remote hub:** Another Federation Hub instance; added by URL (HTTPS required for encryption) and optional token; appears as a virtual server; tool calls are forwarded to the peer’s `/api/v1/peers/invoke`.
- **Invite link:** URL + token for this hub; share so others can add you as a peer (Dashboard → Peers → “Your invite link”).

### Config and persistence

- **federation-config.json** (repo root): Federation metadata, local `servers`, `categories`.  
- **bridge/peers.json**: This hub’s `my_token`, `public_url`, and list of `remote_hubs` (id, name, base_url, peer_token).  

### Categories (for MCP Central taxonomy)

Orchestration, federation, dashboard, FastMCP, mesh, security (encrypted hub-to-hub links).

---

*This entry is generated for inclusion in mcp-central-docs (e.g. projects/federation-mcp.md or a central registry JSON).*
