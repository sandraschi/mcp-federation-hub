# MCP Federation Hub – API Reference

Base URL: `http://localhost:10857` (bridge). All responses are JSON unless noted. All responses carry `X-Request-ID` header for log correlation.

**Authentication**: Management endpoints (`/api/v1/servers/*/start|stop`, `/api/v1/supervisor/*/pause|resume`, `/api/v1/config/save`) require `Authorization: Bearer <token>` when `FLEET_TOKEN` env var is set. Peer invoke uses `PEER_TOKEN` / `my_token` (see Peers section).

---

## Health and discovery

### GET /health

Basic liveness.

**Response**
```json
{
  "status": "healthy",
  "service": "MCP Federation Bridge",
  "timestamp": "ISO8601",
  "federation": { "servers": N, "categories": N }
}
```

---

### GET /api/v1/servers

List all servers (local from `federation-config.json` + remote hub peers).

**Response**
```json
{
  "servers": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "category": "string",
      "tier": "string",
      "web_interface": "string | null",
      "status": "string",
      "mcp_endpoint": "string | null",
      "health_endpoint": "string | null",
      "type": "remote_hub | undefined",
      "base_url": "string (if type=remote_hub)",
      "invoke_endpoint": "string (if type=remote_hub)"
    }
  ],
  "total": N
}
```

---

### GET /api/v1/servers/{server_id}

Get one server’s config. 404 if not found.

**Response**: Single server object (same shape as in `servers[]` above).

---

### GET /api/v1/servers/{server_id}/health

Health check for one server (GETs its `health_endpoint`).

**Response**
```json
{
  "server_id": "string",
  "status": "healthy | unhealthy | unreachable | unknown",
  "response_time": number (ms) | null,
  "timestamp": "ISO8601",
  "error": "string | null",
  "details": object | null
}
```

---

### GET /api/v1/categories/{category}/servers

List servers in a category (from `federation-config.json` categories; peers are in category `"peers"`).

**Response**
```json
{
  "category": "string",
  "servers": [ /* server objects */ ],
  "total": N
}
```

---

### GET /api/v1/federation/health

Health for all servers (local + peers). Calls each server’s health endpoint.

**Response**
```json
{
  "federation_status": "healthy | degraded",
  "total_servers": N,
  "healthy_servers": N,
  "unhealthy_servers": N,
  "server_health": [ /* per-server health objects */ ],
  "timestamp": "ISO8601"
}
```

---

### GET /api/v1/federation/metrics

Live aggregate metrics (counters since bridge start).

**Response**
```json
{
  "uptime_h": number,
  "total_requests": number,
  "tool_calls": number,
  "tool_errors": number,
  "health_polls": number,
  "restarts": number,
  "ai_enabled": boolean,
  "sampling_enabled": boolean
}
```

---

## Tool execution


### GET /api/v1/servers/{server_id}/tools

Get tools list from a server's MCP tools/list endpoint. Cached 5 min; pass `?refresh=true` to force.

### GET /api/v1/tools/all

Return all cached tool lists across all servers.

### GET /api/v1/portmap

Live port map audit — parses `WEBAPP_PORTS.md` and socket-checks every port.
Returns `{ "ports": [...], "total": N, "open": N, "closed": N }`.

### GET /api/v1/gpu/stats

Real-time GPU stats via `nvidia-smi`. Returns `{ "available": false, "error": "..." }` if no CUDA GPU.

### GET /api/v1/ollama/models

List locally available Ollama models (`GET /api/tags`).

### GET /api/v1/ollama/running

List models currently loaded in Ollama (`GET /api/ps`).

### GET /api/v1/logs/recent

Tail last N lines from each Claude MCP server log file. `?lines=200`.

### GET /api/v1/logs/stream

SSE stream of MCP log file tails. Emits a batch every 5s. Connect with `EventSource`.

---

### POST /api/v1/tools/call

Run a tool on a specific server or let the bridge choose (`server_id: "auto"`).

**Request**
```json
{
  "server_id": "string | 'auto'",
  "tool_name": "string",
  "arguments": {}
}
```

**Response**: Opaque (whatever the MCP server or remote hub returns). On failure: 404 (server not found), 500 (no endpoint), 503 (connect error), 504 (timeout). Tool calls retry up to 2 times with exponential backoff on timeout/connect errors.

**Behavior**
- If `server_id` is a local server: bridge POSTs JSON-RPC `tools/call` to that server's `mcp_endpoint`. Retries on failure.
- If `server_id` is a remote hub: bridge POSTs to that peer's `/api/v1/peers/invoke` with Bearer token.
- If `server_id === "auto"`: AI routing (if enabled) picks a server; otherwise first available local server is used.

---

---

## Supervisor & fleet operations

**Requires `Authorization: Bearer <token>`** when `FLEET_TOKEN` env var is set.

### POST /api/v1/servers/{server_id}/start

Launch a server's backend via `start.ps1 -Headless`. Optional query: `?repo_path=...`.

**Response** `{ "ok": true, "pid": N, "command": [...], "headless": true }`

### POST /api/v1/servers/{server_id}/stop

Kill processes listening on the server's port via `netstat` + `taskkill`.

### GET /api/v1/supervisor/status

Per-server supervisor state. `?server_id=X` to filter.

**Response**
```json
{
  "supervisor": "active",
  "servers": {
    "server_id": {
      "supervised": boolean, "headless": boolean,
      "consecutive_failures": N, "restart_attempts": N,
      "backoff_until": "ISO8601|null", "paused": boolean
    }
  },
  "core_servers": [...],
  "resources": { "cpu_pct": N, "ram_pct": N, "fleet_procs": N },
  "gates": { "ram_pct": N, "max_fleet_procs": N, "max_concurrent_restarts": N }
}
```

### POST /api/v1/supervisor/{server_id}/pause

Pause automatic restart supervision. **State persists to `bridge/supervisor_state.json`.**

### POST /api/v1/supervisor/{server_id}/resume

Resume supervision with backoff reset. **State persists to disk.**

### POST /api/v1/config/save

Write `federation-config.json`. Body: `{ "config": {...}, "backup": true }`. Creates timestamped `.bak`, reloads FederationManager.

### GET /api/v1/health/history

Stored health check history (last 2h). `?server_id=X` to filter.

### GET /api/v1/health/uptime

Per-server uptime percentages: `{ "server_id": { "uptime_pct": N, "total_checks": N, "last_status": "..." } }`.

### POST /api/v1/system/open-fleet-starts

Open Fleet Starts Launcher in default browser. **Only `localhost`/`127.0.0.1` URLs allowed.** Body: `{ "url": "http://127.0.0.1:10796/", "start_if_down": true, "wait_seconds": 30 }`.

---

## Peers (mesh / remote hubs)

### GET /api/v1/peers/me

This hub’s public URL and invite link (for sharing with other hubs).

**Response**
```json
{
  "public_url": "string",
  "invite_link": "string (public_url?peer=1&token=...)",
  "encrypted": boolean,
  "message": "string"
}
```

---

### POST /api/v1/peers/invoke

**Invoke a tool on this hub** (called by another hub). Body is the tool call with optional `server_id`; auth is optional but recommended.

**Request**
- Headers: `Authorization: Bearer <token>` (required if this hub has `PEER_TOKEN` or `my_token` in peers.json).
- Body:
```json
{
  "tool_name": "string",
  "arguments": {},
  "server_id": "string (optional — target specific server on this hub)"
}
```

**Response**: Same as the internal tool call. 401/403 if token missing or invalid; 404 if server_id specified but not found; 503 if no local server available; 504/500 on timeout or error.

**Behavior**: If `server_id` is provided, targets that specific server. Otherwise routes with AI or first local server, then runs the tool and returns the result.

---

### GET /api/v1/peers

List remote hub peers with live status (GET each peer’s `/health`).

**Response**
```json
{
  "peers": [
    {
      "id": "string",
      "name": "string",
      "base_url": "string",
      "encrypted": boolean,
      "status": "online | offline | unhealthy | unknown"
    }
  ],
  "total": N
}
```

---

### POST /api/v1/peers

Add a remote hub peer.

**Request**
```json
{
  "base_url": "string (HTTPS required except localhost)",
  "name": "string",
  "peer_token": "string | null"
}
```

**Response**
```json
{
  "ok": true,
  "peer": { "id", "name", "base_url", "peer_token", "type": "remote_hub" }
}
```

**Errors**: 400 if `base_url` is HTTP and not localhost (encryption requirement).

---

### DELETE /api/v1/peers/{peer_id}

Remove a remote hub peer. 404 if not found.

**Response**
```json
{ "ok": true, "removed": "peer_id" }
```

---

## AI (optional)

Requires OpenAI key and/or Ollama. Used for routing and analysis.

### GET /api/v1/ai/providers

List available AI providers (e.g. openai, ollama).

**Response**: Array or object of provider names/status.

---

### POST /api/v1/ai/analyze-server

Analyze one server’s capabilities (AI-generated summary). Body: `{ "server_id": "string" }` (or query param). 404 if server not found.

**Response**: AI analysis object (content, provider, model, etc.).

---

### POST /api/v1/ai/suggest-routing

Suggest which server(s) to use for a natural-language request. Body: `{ "user_intent": "string" }`.

**Response**
```json
{
  "strategy": "string",
  "primary_server": "string | null",
  "fallback_servers": [],
  "confidence": number
}
```

---

### GET /api/v1/ai/optimize-config

Suggest federation config optimizations (AI). Returns suggestions based on current config.

---

## Sampling (FastMCP-style)

### GET /api/v1/sampling/health-analysis

Sampling-based health analysis of the federation.

---

### GET /api/v1/sampling/optimize-config

Sampling-based config optimization suggestions.

---

### POST /api/v1/sampling/sample-servers

Sample servers by capability. Query/body: `capability=string`, `count=number` (default 3).

**Response**
```json
{
  "capability": "string",
  "sampled_servers": [ "server_id", ... ],
  "count": N
}
```

---

### POST /api/v1/sampling/intelligent-routing

Intelligent routing by request type and parameters. Body: `request_type=string`, `parameters=object`.

**Response**: Routing result (primary + fallbacks, etc.).

---

## WorldLabs proxy

Forwards to the WorldLabs MCP server configured in the federation (e.g. `worldlabs-mcp`). All under `/api/v1/worldlabs/*`.

### POST /api/v1/worldlabs/generate

Body: `{ "prompt"?, "image_url"?, "video_url"?, "wait_for_completion"? }`. Proxies to WorldLabs generate tool.

### GET /api/v1/worldlabs/status/{world_id}

Proxies status check.

### POST /api/v1/worldlabs/download

Body: `{ "world_id", "format", "output_path"? }`. Proxies download.

### GET /api/v1/worldlabs/formats

Proxies formats list.

### GET /api/v1/worldlabs/usage

Proxies usage.

---

## Apps (webapp registry)

Registry path is hardcoded (e.g. `mcp-central-docs/operations/webapp-registry.json`). Each entry: `id`, `repo_path`, optional `start_command`.

### GET /api/v1/apps

List registered webapps.

**Response**
```json
{
  "webapps": [
    { "id": "string", "repo_path": "string", "start_command"?: "string", ... }
  ]
}
```

---

### POST /api/v1/apps/{app_id}/launch

Launch a webapp (run `start.bat` or `start.ps1` or `start_command` in `repo_path`). Starts process in background.

**Response**
```json
{
  "status": "launching",
  "app_id": "string",
  "pid": number,
  "command": [ "string", ... ]
}
```

**Errors**: 404 (app not in registry), 500 (path missing, launch failed).

---

## Federation config schema (reference)

`federation-config.json` at repo root:

```json
{
  "federation": {
    "name": "string",
    "version": "string",
    "description": "string",
    "ports": { "dashboard": number, "bridge": number }
  },
  "servers": {
    "<server_id>": {
      "id": "string",
      "name": "string",
      "description": "string",
      "category": "string",
      "tier": "string",
      "web_interface": "string",
      "status": "string",
      "mcp_endpoint": "string (optional, for tool calls)",
      "health_endpoint": "string (optional)",
      "supervised": "boolean (default true — auto-restart)",
      "headless": "boolean (default true — no console window)",
      "bootstrap_priority": "number (optional — override tier ordering)",
      "capabilities": ["string"],
      "tools": ["string"]
    }
  },
  "categories": {
    "<category_name>": [ "server_id", ... ]
  }
}
```

Remote hub entries are **not** stored here; they are in `bridge/peers.json` and merged at runtime.
