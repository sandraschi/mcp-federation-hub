"""
Peer (mesh) support: remote hubs, invite links, encrypted hub-to-hub calls.
"""
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PEERS_FILENAME = "peers.json"
DEFAULT_PEERS: Dict[str, Any] = {
    "my_token": None,
    "public_url": "",
    "remote_hubs": [],
}


def _peers_path() -> Path:
    """Path to peers.json (bridge directory)."""
    return Path(__file__).parent.parent / PEERS_FILENAME


def _ensure_my_token(data: Dict[str, Any]) -> str:
    """Ensure my_token exists; generate and persist if missing."""
    token = data.get("my_token") or os.environ.get("PEER_TOKEN")
    if not token:
        token = secrets.token_urlsafe(32)
        data["my_token"] = token
        try:
            with open(_peers_path(), "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not persist peer token: {e}")
    return token


def load_peers() -> Dict[str, Any]:
    """Load peers.json; create with defaults if missing."""
    path = _peers_path()
    try:
        if path.exists():
            with open(path, "r") as f:
                data = json.load(f)
        else:
            data = dict(DEFAULT_PEERS)
    except Exception as e:
        logger.warning(f"Could not load peers: {e}")
        data = dict(DEFAULT_PEERS)
    data.setdefault("remote_hubs", [])
    data["my_token"] = _ensure_my_token(data)
    return data


def save_peers(data: Dict[str, Any]) -> None:
    """Persist peers.json (keeps my_token, overwrites remote_hubs)."""
    path = _peers_path()
    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Could not save peers: {e}")
        raise


def get_public_url() -> str:
    """Base URL for this hub (for invite link). Prefer env FEDERATION_PUBLIC_URL."""
    data = load_peers()
    url = (
        os.environ.get("FEDERATION_PUBLIC_URL")
        or data.get("public_url")
        or "http://localhost:10857"
    )
    return url.rstrip("/")


def add_remote_hub(peer_id: str, name: str, base_url: str, peer_token: Optional[str] = None) -> Dict[str, Any]:
    """Add a remote hub. base_url must be HTTPS (except localhost). Returns new peer."""
    base_url = base_url.rstrip("/")
    if not base_url.startswith("https://") and "localhost" not in base_url and "127.0.0.1" not in base_url:
        raise ValueError("Remote hub URL must use HTTPS for encrypted links (or localhost for dev)")
    data = load_peers()
    hubs = data.get("remote_hubs", [])
    for h in hubs:
        if h.get("id") == peer_id:
            h["name"] = name
            h["base_url"] = base_url
            if peer_token is not None:
                h["peer_token"] = peer_token
            save_peers(data)
            return h
    peer = {
        "id": peer_id,
        "name": name,
        "base_url": base_url,
        "peer_token": peer_token or "",
        "type": "remote_hub",
    }
    hubs.append(peer)
    data["remote_hubs"] = hubs
    save_peers(data)
    return peer


def remove_remote_hub(peer_id: str) -> bool:
    """Remove a remote hub. Returns True if removed."""
    data = load_peers()
    hubs = [h for h in data.get("remote_hubs", []) if h.get("id") != peer_id]
    if len(hubs) == len(data.get("remote_hubs", [])):
        return False
    data["remote_hubs"] = hubs
    save_peers(data)
    return True


def list_remote_hubs() -> List[Dict[str, Any]]:
    """List remote hub configs (with type=remote_hub for API)."""
    data = load_peers()
    hubs = data.get("remote_hubs", [])
    for h in hubs:
        h.setdefault("type", "remote_hub")
    return hubs


def get_remote_hub(peer_id: str) -> Optional[Dict[str, Any]]:
    """Get one remote hub by id."""
    for h in list_remote_hubs():
        if h.get("id") == peer_id:
            return h
    return None
