# MCP Federation Hub

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.13+-blue.svg)](https://www.python.org/)
[![FastMCP](https://img.shields.io/badge/FastMCP-3.0+-blue.svg)](https://github.com/PrefectHQ/fastmcp)

A local orchestration layer for managing multiple MCP servers. Provides a unified dashboard, health monitoring, tool execution, and hub-to-hub mesh peering.

## Architecture

```
mcp-federation-hub/
 bridge/          FastAPI + FastMCP 3.0  port 10857
    server registry (federation-config.json)
    health polling for all registered servers
    tool call routing (local MCP + remote hub peers)
    peer mesh (HTTPS + Bearer token, invite-link based)
    webapp launcher (start.bat / start.ps1)

 webapp/          React + Vite dashboard  port 10856
     Dashboard    federation overview, quick links
     Servers      MCP server list and status
     Peers        hub-to-hub mesh management
     Health       per-server health polling
     Tools        MCP tool playground (call tools directly)
     Apps         webapp registry and launcher
     Config       federation-config.json viewer/editor
     Categories   server groupings
     Local AI     GPU telemetry + Ollama/LM Studio model list
     Security     peer token status, session log, intrusion log
     Logs         bridge process log viewer
```

## Quick Start

### Prerequisites
- Python 3.13+ with [uv](https://github.com/astral-sh/uv)
- Node.js 20+

### Run

Clone the repo first, then from the **repository root**:

```powershell
git clone https://github.com/sandraschi/mcp-federation-hub.git
Set-Location mcp-federation-hub
```

```powershell
# Bridge (port 10857)
cd bridge
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 10857 --reload

# Dashboard (port 10856)
cd webapp
npm install
npm run dev
```

Or use the included `start.ps1` / `start.bat` in each folder.

### Access
- Dashboard: http://localhost:10856
- Bridge API: http://localhost:10857
- API docs: http://localhost:10857/redoc

## Configuration

Edit `federation-config.json` in the repo root to register MCP servers:

```json
{
  "federation": {
    "name": "My Hub",
    "ports": { "bridge": 10857, "dashboard": 10856 }
  },
  "servers": {
    "my-server": {
      "id": "my-server",
      "name": "My MCP Server",
      "category": "tools",
      "tier": "local",
      "mcp_endpoint": "http://localhost:8100/mcp",
      "health_endpoint": "http://localhost:8100/health"
    }
  },
  "categories": {
    "tools": ["my-server"]
  }
}
```

The bridge reloads this on restart. The dashboard Config page shows the live server list from the bridge.

## Peer Mesh

Hub-to-hub peering lets you connect multiple federation hub instances:

```
GET  /api/v1/peers/me           get this hub's invite link
POST /api/v1/peers              add a remote hub by URL + token
GET  /api/v1/peers              list peers with live status
DELETE /api/v1/peers/{id}       remove a peer
POST /api/v1/peers/invoke       invoke a tool on this hub (requires Bearer token)
```

Use HTTPS for encrypted hub-to-hub links. Set `PEER_TOKEN` env var to require authentication for incoming peer invocations.

## API Reference

See [docs/API.md](docs/API.md) or http://localhost:10857/redoc for full endpoint docs.

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Bridge health |
| GET | `/api/v1/servers` | All registered servers |
| GET | `/api/v1/servers/{id}/health` | Health of one server |
| GET | `/api/v1/federation/health` | Health of all servers |
| POST | `/api/v1/tools/call` | Route a tool call |
| GET | `/api/v1/apps` | Registered webapps |
| POST | `/api/v1/apps/{id}/launch` | Launch a webapp |
| GET | `/api/v1/ai/providers` | Available AI providers |

## Project Structure

```
bridge/
  app/
    main.py        FastAPI app, routes, FederationManager
    peers.py       peer mesh logic
    ai_service.py  AI-powered routing (optional)
    sampling.py    FastMCP sampling integration

webapp/
  src/
    pages/         one file per page
    components/    layout (Header, Sidebar)
    services/      api.ts (bridge client)

mcpb/              MCPB packaging metadata
docs/              Architecture, API, Peers reference
federation-config.json   server registry (edit this)
```

## Development

```powershell
# Backend lint
cd bridge; uv run ruff check .

# Frontend build
cd webapp; npm run build
```

## License
MIT
