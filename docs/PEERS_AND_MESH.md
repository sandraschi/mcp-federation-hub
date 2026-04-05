# Peers and Mesh – Concepts and Implementation

This document explains the **mesh** (hub-to-hub) feature: concepts, security, and every function involved.

---

## 1. Concepts

### 1.1 What is a “peer” or “remote hub”?

A **peer** is another instance of the MCP Federation Hub running elsewhere (e.g. on a friend’s PC or another machine you control). Instead of only calling MCP servers that are registered locally in your `federation-config.json`, you can **add** a peer by its base URL. After that, that peer appears in your server list (category `peers`) and you can run tools on it: your bridge forwards the call to the peer’s **invoke** endpoint, and the peer runs the tool on its own local servers.

- **One-way link**: You add Steve’s hub → you can call tools on Steve’s hub. For Steve to call tools on yours, Steve must add your hub as a peer (using your invite link).
- **No automatic discovery**: There is no broadcast or registry that finds hubs. You add peers manually (or by pasting an invite link).

### 1.2 Invite link

An **invite link** is a URL that encodes both “where is this hub” and “what token to use when calling it”. Format:

`<public_url>?peer=1&token=<my_token>`

- **public_url**: The base URL of the hub (e.g. `https://steve-pc.tail1234.ts.net:10857`). Must be reachable by the person adding the peer.
- **token**: The hub’s secret (`my_token` in `peers.json`). When you add Steve as a peer, you store his URL and his token; when your bridge calls his `/api/v1/peers/invoke`, it sends `Authorization: Bearer <Steve’s token>` so his bridge accepts the request.

Sharing the invite link is the standard way to “connect” two hubs: one side copies “Your invite link” from the Peers page, the other pastes it into “Add remote hub” (the UI parses URL and token from the link).

### 1.3 Encrypted links

- **HTTPS**: For any peer that is not `localhost` or `127.0.0.1`, the bridge requires the peer’s `base_url` to use `https://`. Adding a peer with `http://` (non-local) returns an error. This ensures hub-to-hub traffic is TLS-encrypted when used in real setups.
- **Token**: The optional Bearer token restricts who may call `POST /api/v1/peers/invoke`. Only clients that have the token (typically another hub that added you via invite link) can invoke tools. So “encrypted” in the UI means: (1) HTTPS and (2) token-based auth.

### 1.4 Data stored for peers

- **This hub**: `bridge/peers.json` holds:
  - `my_token`: Secret for this hub; sent to others via invite link so they can call us.
  - `public_url`: Optional; used to build the invite link. Overridden by env `FEDERATION_PUBLIC_URL`.
  - `remote_hubs`: Array of `{ id, name, base_url, peer_token, type: "remote_hub" }`. No server list is synced; we only know “this base_url is a peer and we use this token when calling it.”

- **Not stored**: The list of tools or servers on the remote hub. When you call a tool on a peer, you send `tool_name` and `arguments`; the peer’s bridge decides internally which of its servers runs it (e.g. via AI routing or first available).

---

## 2. Module: `bridge/app/peers.py`

All peer persistence is in this module. No HTTP; only file I/O and in-memory structures.

### 2.1 File and defaults

- **File**: `bridge/peers.json` (path: `Path(__file__).parent.parent / "peers.json"`).
- **Default structure** (if file missing or empty):
  - `my_token`: `None` (then generated on first load).
  - `public_url`: `""`.
  - `remote_hubs`: `[]`.

### 2.2 Functions

#### `_peers_path() -> Path`

Returns the absolute path to `peers.json` (bridge directory). Used by load/save and by `_ensure_my_token` when persisting.

---

#### `_ensure_my_token(data: Dict[str, Any]) -> str`

- **Input**: The current peers dict (after load or default).
- **Behavior**: If `data["my_token"]` or env `PEER_TOKEN` is set, return it. Otherwise generate a new token with `secrets.token_urlsafe(32)`, set `data["my_token"]`, write `data` to `peers.json`, and return the token.
- **Purpose**: Every hub has a stable secret for invite links and for validating incoming invoke calls.

---

#### `load_peers() -> Dict[str, Any]`

- **Behavior**: Read `peers.json` if it exists; else start from `DEFAULT_PEERS`. Ensure `remote_hubs` exists, then call `_ensure_my_token(data)` so `data["my_token"]` is set. Return the dict (with `my_token` possibly updated and persisted).
- **Side effect**: May create or update `peers.json` to store a generated token.
- **Return**: `{ "my_token", "public_url", "remote_hubs" }`.

---

#### `save_peers(data: Dict[str, Any]) -> None`

- **Behavior**: Write `data` to `peers.json` (overwrite). Used after adding/removing/updating a remote hub or after ensuring token.
- **Raises**: On I/O error (caller may log or surface to API).

---

#### `get_public_url() -> str`

- **Behavior**: Return the base URL for this hub, in order of preference: env `FEDERATION_PUBLIC_URL`, then `peers.json` `public_url`, then `"http://localhost:10857"`. Trailing slash is stripped.
- **Purpose**: Used by `GET /api/v1/peers/me` to build the invite link. For production/Tailscale, set env or `public_url` to e.g. `https://my-pc.tail1234.ts.net:10857`.

---

#### `add_remote_hub(peer_id: str, name: str, base_url: str, peer_token: Optional[str] = None) -> Dict[str, Any]`

- **Input**:
  - `peer_id`: Unique id for the peer (e.g. derived from host:port in the API layer).
  - `name`: Display name.
  - `base_url`: Full base URL (e.g. `https://steve:10857`). Must be HTTPS unless `localhost` or `127.0.0.1` is in the URL.
  - `peer_token`: Optional; the other hub’s token (from their invite link). Stored and sent as Bearer when we call their invoke endpoint.
- **Behavior**:
  - Normalize `base_url` (strip trailing slash).
  - Enforce HTTPS for non-local URLs; raise `ValueError` otherwise.
  - If a hub with this `peer_id` already exists, update its `name`, `base_url`, and optionally `peer_token`; then save and return that hub.
  - Else append a new entry `{ id, name, base_url, peer_token (or ""), type: "remote_hub" }`, save, and return it.
- **Return**: The added or updated peer dict.

---

#### `remove_remote_hub(peer_id: str) -> bool`

- **Behavior**: Remove from `remote_hubs` any entry with `id == peer_id`. Save. Return `True` if something was removed, `False` if not found.

---

#### `list_remote_hubs() -> List[Dict[str, Any]]`

- **Behavior**: Load peers, return `remote_hubs` with each item having `type: "remote_hub"` set if missing. Does not modify the file.
- **Return**: List of peer dicts (id, name, base_url, peer_token, type).

---

#### `get_remote_hub(peer_id: str) -> Optional[Dict[str, Any]]`

- **Behavior**: Return the first entry in `list_remote_hubs()` whose `id` equals `peer_id`, or `None`.

---

## 3. Bridge API behavior for peers

### 3.1 Merging peers into the server list

- **FederationManager** (in `main.py`) calls `peers_mod.list_remote_hubs()` and builds **virtual server entries** for each:
  - `id`, `name`, `description` (e.g. “Remote hub peer: … (encrypted link)”), `category: "peers"`, `tier: "peer"`, `type: "remote_hub"`.
  - `base_url`, `peer_token`, `health_endpoint` = `base_url + "/health"`, `invoke_endpoint` = `base_url + "/api/v1/peers/invoke"`.
- `get_server_config(server_id)` returns either a local server from config or one of these virtual entries.
- `list_servers()` returns local servers plus these virtual entries. So peers appear in `GET /api/v1/servers` and in the Tools Lab server dropdown.

### 3.2 Calling a tool on a peer

- When `POST /api/v1/tools/call` has a `server_id` that resolves to a server with `type == "remote_hub"`, the bridge uses `_call_tool_on_server` with that config.
- `_call_tool_on_server` for a remote_hub: POST to `invoke_endpoint` with body `{ "tool_name", "arguments" }` and header `Authorization: Bearer <peer_token>` if `peer_token` is set. HTTPS verify is enabled when the URL is https.

### 3.3 Receiving an invoke (this hub is the peer)

- `POST /api/v1/peers/invoke`: Body `{ "tool_name", "arguments" }`. Optional header `Authorization: Bearer <token>`.
- **Auth**: `_require_peer_token(authorization)`: If this hub has a token (env `PEER_TOKEN` or `peers.load_peers()["my_token"]`), the request must include `Authorization: Bearer <that token>`; otherwise 401 (missing) or 403 (wrong).
- **Routing**: This hub does not receive a `server_id`; it chooses internally (AI routing if enabled, else first non–remote-hub server). Then it calls `_call_tool_on_server(server_config, tool_name, arguments)` and returns the result.

### 3.4 Peer status in GET /api/v1/peers

- For each entry in `list_remote_hubs()`, the bridge GETs `base_url + "/health"` with a short timeout. It sets `status`: `"online"` if 200, `"unhealthy"` for other HTTP, `"offline"` on exception. It also sets `encrypted: base_url.startswith("https://")`. So the Peers page can show live status and “Encrypted” badge.

---

## 4. Security summary

| Aspect | Implementation |
|--------|----------------|
| **Transport** | HTTPS required for non-local peer URLs. TLS verification on when URL is https. |
| **Auth for invoke** | Optional Bearer token (this hub’s `my_token` or `PEER_TOKEN`). If set, incoming `/api/v1/peers/invoke` must send it. |
| **Storing tokens** | `my_token` and each peer’s `peer_token` are stored in `peers.json` on disk. Restrict file permissions in production. |
| **Invite link** | Contains the token. Share only over a trusted channel (e.g. paste in chat with the other operator). |

---

## 5. Environment variables

| Variable | Purpose |
|----------|--------|
| `FEDERATION_PUBLIC_URL` | Base URL for this hub (invite link). Example: `https://my-pc.tail1234.ts.net:10857`. |
| `PEER_TOKEN` | Override for this hub’s token (invoke auth). If not set, `my_token` from `peers.json` is used. |

---

## 6. Workflow: connecting two hubs

1. **Hub A** (you): Run bridge + dashboard. Open Peers → copy “Your invite link” (includes A’s public URL and token).
2. **Hub B** (Steve): Run bridge + dashboard. Open Peers → “Add remote hub” → paste A’s invite link (or enter A’s URL and token). Submit.
3. B’s bridge stores A as a peer (base_url + token). A appears in B’s server list (category peers).
4. **B calls a tool on A**: B’s UI or API sends `POST /api/v1/tools/call` with `server_id` = A’s peer id. B’s bridge POSTs to A’s `/api/v1/peers/invoke` with Bearer A’s token. A’s bridge routes the tool locally and returns the result.
5. For **A to call B**: A must add B as a peer using B’s invite link. Then A can target B’s peer id in tool calls.

No automatic mesh discovery; each link is explicit (add by URL + optional token or by pasting invite link).
