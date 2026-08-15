"""fleet_board - private bulletin board storage for the federation hub.

Channels, posts, threads (parent_id) and full history in SQLite
(`bridge/board.db`, WAL mode). REST surface in main.py; the FastMCP
`fleet_board` tool lives in fleet-agent-mcp and talks to these routes.

Board stays private: every endpoint is gated by FLEET_TOKEN when set, and
the bridge binds 127.0.0.1 unless FLEET_REMOTE_ACCESS=1 (Tailscale).

Schema is created idempotently on first use.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

#: Shared DB file next to the bridge app (same dir as supervisor_state.json).
#: Overridable via FLEET_BOARD_DB_PATH (tests).
_DB_PATH = (
    Path(os.environ.get("FLEET_BOARD_DB_PATH", ""))
    if os.environ.get("FLEET_BOARD_DB_PATH")
    else Path(__file__).resolve().parent.parent / "board.db"
)

_lock = threading.Lock()

_DEFAULT_CHANNELS = [
    ("fleet-pulse", "Periodic fleet health, pulse reports, cross-server summaries"),
    ("dev-worklog", "Task boundaries + deliverables: 'started X', 'X done - PR #n'"),
    (
        "handoffs",
        "Addressed handoff records between agents (inbox is delivery, this is the archive)",
    ),
]

_SCHEMA = """
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id),
    parent_id INTEGER REFERENCES posts(id),
    author TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_id);
"""

_INBOX_SCHEMA = """
CREATE TABLE IF NOT EXISTS inbox_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_entity TEXT NOT NULL,
    from_entity TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_inbox_to ON inbox_messages(to_entity, id);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _init(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    conn.executescript(_INBOX_SCHEMA)
    for name, description in _DEFAULT_CHANNELS:
        conn.execute(
            "INSERT OR IGNORE INTO channels(name, description, created_at) VALUES (?,?,?)",
            (name, description, _now()),
        )
    conn.commit()


def _ensure_init() -> sqlite3.Connection:
    with _lock:
        conn = _connect()
        try:
            _init(conn)
        except Exception:
            conn.close()
            raise
        return conn


# ---------------------------------------------------------------------------
# Board
# ---------------------------------------------------------------------------


def channels() -> list[dict[str, Any]]:
    conn = _ensure_init()
    try:
        rows = conn.execute(
            "SELECT id, name, description, created_at FROM channels ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _channel_id(conn: sqlite3.Connection, name: str) -> int | None:
    row = conn.execute("SELECT id FROM channels WHERE name=?", (name,)).fetchone()
    return int(row["id"]) if row else None


def post(
    channel: str, author: str, title: str, body: str, parent_id: int | None = None
) -> dict[str, Any]:
    """Create a post (or thread reply when parent_id given). Returns the row."""
    if not body.strip():
        raise ValueError("body is required")
    conn = _ensure_init()
    try:
        cid = _channel_id(conn, channel)
        if cid is None:
            raise ValueError(f"unknown channel: {channel}")
        if parent_id is not None:
            parent = conn.execute(
                "SELECT id FROM posts WHERE id=?", (parent_id,)
            ).fetchone()
            if parent is None:
                raise ValueError(f"unknown parent post: {parent_id}")
        now = _now()
        cur = conn.execute(
            "INSERT INTO posts(channel_id, parent_id, author, title, body, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (cid, parent_id, author, title, body, now, now),
        )
        conn.commit()
        pid = int(cur.lastrowid)
        return get_post(pid)  # type: ignore[return-value]
    finally:
        conn.close()


def get_post(post_id: int) -> dict[str, Any] | None:
    conn = _ensure_init()
    try:
        row = conn.execute(
            "SELECT p.*, c.name AS channel FROM posts p JOIN channels c ON c.id=p.channel_id"
            " WHERE p.id=?",
            (post_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_posts(
    channel: str | None = None, limit: int = 50, since_id: int | None = None
) -> list[dict[str, Any]]:
    """Recent posts, newest first. channel filters by name; since_id returns
    posts with id > since_id (for subscribe-style polling)."""
    conn = _ensure_init()
    try:
        sql = "SELECT p.*, c.name AS channel FROM posts p JOIN channels c ON c.id=p.channel_id"
        where: list[str] = []
        params: list[Any] = []
        if channel:
            cid = _channel_id(conn, channel)
            if cid is None:
                return []
            where.append("p.channel_id=?")
            params.append(cid)
        if since_id is not None:
            where.append("p.id>?")
            params.append(since_id)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY p.id DESC LIMIT ?"
        params.append(max(1, min(int(limit), 500)))
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def search(query: str, limit: int = 25) -> list[dict[str, Any]]:
    conn = _ensure_init()
    try:
        like = f"%{query}%"
        rows = conn.execute(
            "SELECT p.*, c.name AS channel FROM posts p JOIN channels c ON c.id=p.channel_id"
            " WHERE p.title LIKE ? OR p.body LIKE ? OR p.author LIKE ?"
            " ORDER BY p.id DESC LIMIT ?",
            (like, like, like, max(1, min(int(limit), 100))),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Inbox (addressed delivery - no browsable history by design)
# ---------------------------------------------------------------------------


def inbox_send(
    to_entity: str, from_entity: str, subject: str, body: str
) -> dict[str, Any]:
    if not to_entity.strip() or not body.strip():
        raise ValueError("to_entity and body are required")
    conn = _ensure_init()
    try:
        now = _now()
        cur = conn.execute(
            "INSERT INTO inbox_messages(to_entity, from_entity, subject, body, created_at)"
            " VALUES (?,?,?,?,?)",
            (to_entity.strip(), from_entity.strip(), subject, body, now),
        )
        conn.commit()
        mid = int(cur.lastrowid)
        return {
            "id": mid,
            "to_entity": to_entity,
            "from_entity": from_entity,
            "subject": subject,
            "body": body,
            "created_at": now,
            "read_at": None,
        }
    finally:
        conn.close()


def inbox_poll(entity: str, mark_read: bool = True) -> list[dict[str, Any]]:
    """Return unread messages for entity. When mark_read, sets read_at on fetch."""
    conn = _ensure_init()
    try:
        if mark_read:
            rows = conn.execute(
                "SELECT * FROM inbox_messages WHERE to_entity=? AND read_at IS NULL"
                " ORDER BY id ASC",
                (entity,),
            ).fetchall()
            for r in rows:
                conn.execute(
                    "UPDATE inbox_messages SET read_at=? WHERE id=?",
                    (_now(), int(r["id"])),
                )
            conn.commit()
        else:
            rows = conn.execute(
                "SELECT * FROM inbox_messages WHERE to_entity=? AND read_at IS NULL"
                " ORDER BY id ASC",
                (entity,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def inbox_status() -> dict[str, Any]:
    """Per-entity unread counts + totals (no bodies - the inbox has no history)."""
    conn = _ensure_init()
    try:
        rows = conn.execute(
            "SELECT to_entity, COUNT(*) AS unread FROM inbox_messages"
            " WHERE read_at IS NULL GROUP BY to_entity"
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) AS n FROM inbox_messages").fetchone()["n"]
        return {
            "unread_by_entity": {r["to_entity"]: int(r["unread"]) for r in rows},
            "total_messages": int(total),
        }
    finally:
        conn.close()
