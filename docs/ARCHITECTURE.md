# MCP Federation Hub – Architecture and Concepts

This document explains the underlying concepts, components, and data flow of the MCP Federation Hub.

---

## 1. Core Concepts

### 1.1 Federation

A **federation** is a single logical layer that aggregates many **MCP (Model Context Protocol) servers** behind one API and one dashboard. Instead of each client (IDE, script, or app) connecting to each MCP server directly, the client talks to the **Federation Bridge**; the bridge routes requests to the right server(s).

- **Local servers**: Entries in `federation-config.json` (id, name, mcp_endpoint, health_endpoint, etc.). These are MCP servers running on the same machine or reachable LAN.
- **Remote hub peers**: Other instances of the Federation Hub, added via the Peers (mesh) feature. They appear as virtual “servers” with `type: "remote_hub"`; tool calls to them are forwarded over HTTPS to the peer’s `/api/v1/peers/invoke` endpoint.

### 1.2 Bridge vs Dashboard

- **Federation Bridge** (FastAPI, `bridge/`): The backend. It holds the list of servers and peers, performs health checks, routes tool calls (to local MCP or to remote hubs), and exposes the REST API. Port: **10857** (configurable via `federation.ports.bridge` or env).
- **Unified Dashboard** (React/Vite, `webapp/`): The frontend. It calls the bridge API to list servers, show health, run tools (Tools Lab), manage peers, launch apps, etc. Port: **10856** (configurable).

The bridge is the single source of truth for “what servers exist” and “how to call them”; the dashboard is a consumer of the bridge API.

### 1.3 Server and Peer Identity

- **Server**: Identified by `id` (e.g. `advanced-memory-mcp`). Comes from `federation-config.json` or, for peers, from a derived id (e.g. host:port normalized). Has at least one of: `mcp_endpoint` (for local MCP) or `invoke_endpoint` + `peer_token` (for remote hubs).
- **Peer**: A remote hub. Stored in `bridge/peers.json` under `remote_hubs`. Each peer has `id`, `name`, `base_url`, `peer_token`. The bridge merges peers into the server list so they appear in `GET /api/v1/servers` and can be targeted by `POST /api/v1/tools/call`.

---

## 2. Components

### 2.1 FederationManager (`bridge/app/main.py`)

- **Role**: Loads federation config, merges in remote hub entries, answers “what servers exist?” and “what is the config for server X?”.
- **Config source**: `federation-config.json` at repo root (path derived from `bridge/app` → parent.parent.parent).
- **Key methods**:
  - `_load_config()`: Reads JSON, sets `self.servers` and `self.categories`.
  - `_remote_hub_entries()`: Builds virtual server dicts from `peers.list_remote_hubs()` (invoke_endpoint, health_endpoint, type=remote_hub).
  - `get_server_config(server_id)`: Returns config for a local server or a remote hub.
  - `list_servers()`: Returns local servers + remote hub entries.
  - `list_servers_by_category(category)`: Filters by `categories` in config; peers are in category `"peers"`.
  - `check_server_health(server_config)`: GETs `health_endpoint` (with optional TLS verify). Used for both local servers and peers.

### 2.2 Peers Module (`bridge/app/peers.py`)

- **Role**: Persist and resolve “this hub’s” identity and the list of remote hubs. No HTTP here; only file I/O and in-memory structure.
- **File**: `bridge/peers.json`. Schema: `{ "my_token": "...", "public_url": "...", "remote_hubs": [ { "id", "name", "base_url", "peer_token", "type": "remote_hub" } ] }`.
- **Concepts**:
  - **my_token**: Secret for this hub. Used when another hub calls our `/api/v1/peers/invoke`; they must send it as `Authorization: Bearer <my_token>`. Generated once and stored.
  - **public_url**: Base URL of this hub (for building “invite link”). Can be set via `FEDERATION_PUBLIC_URL` or stored in `peers.json`.
  - **remote_hubs**: List of peers we can call. Each has `base_url` (HTTPS required except localhost), optional `peer_token` (their token for us to send when we call them).
- **Functions** (see also [PEERS_AND_MESH.md](PEERS_AND_MESH.md)):
  - `load_peers()` / `save_peers(data)`: Read/write `peers.json`; `load_peers()` ensures `my_token` exists (generates if missing).
  - `get_public_url()`: This hub’s base URL for invite link.
  - `add_remote_hub(peer_id, name, base_url, peer_token)`: Append or update one peer; enforces HTTPS for non-localhost.
  - `remove_remote_hub(peer_id)`: Remove by id.
  - `list_remote_hubs()` / `get_remote_hub(peer_id)`: Read-only access to current peers.

### 2.3 Tool Routing and _call_tool_on_server

- **Flow**: Client calls `POST /api/v1/tools/call` with `server_id`, `tool_name`, `arguments`. Bridge resolves `server_id` to a server config (local or peer).
- **If `server_id == "auto"`**: Optional AI routing (if AIService is enabled) picks a `primary_server` from `list_servers()`; otherwise the implementation may fall back to first available.
- **_call_tool_on_server(server_config, tool_name, arguments)**:
  - **Remote hub** (`type == "remote_hub"`): POST to `invoke_endpoint` (`base_url + "/api/v1/peers/invoke"`) with JSON `{ "tool_name", "arguments" }` and header `Authorization: Bearer <peer_token>`. Uses HTTPS verify when URL is https.
  - **Local server**: POST to `mcp_endpoint` with JSON-RPC `{ "method": "tools/call", "params": { "name", "arguments" } }` (standard MCP).
- **Result**: Returned to the client as the bridge received it (from MCP server or from peer’s invoke response).

### 2.4 Peer Invoke Endpoint (Mesh Entry Point)

- **Route**: `POST /api/v1/peers/invoke`. Body: `{ "tool_name": "...", "arguments": { ... } }`. Header: `Authorization: Bearer <token>` (required if this hub has a token set).
- **Purpose**: Allows another hub to run a tool *on this hub* without knowing our internal server ids. This hub decides how to route (AI or first local server).
- **Auth**: `_require_peer_token(authorization)`: If `PEER_TOKEN` or `peers.load_peers()["my_token"]` is set, the request must carry `Bearer <that token>`; otherwise 401/403.

### 2.5 AI Service (`bridge/app/ai_service.py`)

- **Role**: Optional. Uses OpenAI (if `OPENAI_API_KEY`) or Ollama (if available) to:
  - **analyze_server_capabilities(server_config)**: Returns structured analysis of a server’s capabilities/tools.
  - **suggest_routing_strategy(servers, user_request)**: Returns `{ "strategy", "primary_server", "fallback_servers", "confidence" }` for a given natural-language request.
  - **optimize_federation_config(config)**: Suggests config changes.
- **Used by**: `/api/v1/ai/*` endpoints and, when `server_id == "auto"`, by tool-call routing and by `peers_invoke` to pick a local server.

### 2.6 Sampling (`bridge/app/sampling.py`)

- **Role**: FastMCP 3.0–style sampling for “which servers can do X?”. Caches per-server capability and health, scores by health and response time.
- **FederationSampler**:
  - `get_server_capabilities(server_id)`: Cached capability + health score.
  - `sample_servers_by_capability(capability, count)`: Returns server ids that have the capability, sorted by fitness.
  - `sample_servers_by_tool(tool_name, count)`: Same idea for tool name.
  - `intelligent_routing(request_type, parameters)`: High-level routing (e.g. by tool_name) returning primary + fallbacks.
- **Exposed as**: REST wrappers under `/api/v1/sampling/*` and as FastMCP tools (e.g. `sample_servers_for_capability`, `analyze_federation_health`).

### 2.7 Apps Registry and Launch

- **Concept**: A JSON registry (path configurable; default points to a path under `mcp-central-docs`) lists webapps by id, repo_path, start_command (e.g. `start.bat` or `npm run dev`). The bridge can list them and “launch” by running that command in the repo (e.g. `Start-Process` on Windows).
- **Endpoints**: `GET /api/v1/apps`, `POST /api/v1/apps/{app_id}/launch`. Used by the dashboard Apps Hub.

### 2.8 WorldLabs Proxy

- **Concept**: The bridge can act as a proxy to a WorldLabs MCP server registered in the federation. It forwards generate/status/download/formats/usage to that server’s MCP/HTTP interface.
- **Endpoints**: Under `/api/v1/worldlabs/*`. Request bodies and responses are defined in the API spec.

---

## 3. Data Flow Summary

1. **Startup**: Bridge loads `federation-config.json` (FederationManager) and `peers.json` (peers module). Remote hubs are merged into the effective server list.
2. **List servers**: `GET /api/v1/servers` → FederationManager.list_servers() → local servers + _remote_hub_entries().
3. **Tool call (local)**: Client → POST /api/v1/tools/call (server_id=X) → get_server_config(X) → _call_tool_on_server → POST to X’s mcp_endpoint (JSON-RPC).
4. **Tool call (peer)**: Client → POST /api/v1/tools/call (server_id=peer-id) → get_server_config(peer-id) returns remote_hub → _call_tool_on_server → POST to peer’s /api/v1/peers/invoke with Bearer token.
5. **Peer invoke (incoming)**: Other hub → POST /api/v1/peers/invoke + Bearer → _require_peer_token → route locally (auto) → _call_tool_on_server(local_server_config) → response back to caller.
6. **Health**: Federation health and per-server health both use GET to each server’s health_endpoint (including peers’ /health).

---

## 4. Configuration Files

| File | Location | Purpose |
|------|----------|--------|
| `federation-config.json` | Repo root | Federation metadata (name, version, ports), `servers` (local MCP), `categories`. Not used for peers. |
| `peers.json` | `bridge/` | `my_token`, `public_url`, `remote_hubs`. Persisted by peers module. |
| `.env` | `bridge/` (optional) | e.g. `OPENAI_API_KEY`, `PEER_TOKEN`, `FEDERATION_PUBLIC_URL`. |

---

## 5. Ports and URLs

- **Dashboard**: 10856 (or from `federation.ports.dashboard`). Set `VITE_API_URL` in webapp to the bridge URL (e.g. `http://localhost:10857`) so the UI calls the correct API.
- **Bridge**: 10857 (or from `federation.ports.bridge`). Redoc: `http://localhost:10857/redoc`.
- **Public URL for mesh**: Set `FEDERATION_PUBLIC_URL` (or `public_url` in peers.json) to the HTTPS URL others use to reach this bridge (e.g. `https://my-pc.tail1234.ts.net:10857`) so the invite link is correct and encrypted.
