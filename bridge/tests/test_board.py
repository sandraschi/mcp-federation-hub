"""Tests for fleet_board + agent inbox (P2 sandrafleetbot)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

# Point the board DB at a temp file BEFORE importing the module.
_TMP = Path(tempfile.mkdtemp(prefix="hub-board-test-")) / "board.db"
os.environ["FLEET_BOARD_DB_PATH"] = str(_TMP)

from app import board  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    """Isolate each test with a clean DB file."""
    board._DB_PATH = _TMP
    for suffix in ("", "-wal", "-shm"):
        p = Path(str(_TMP) + suffix)
        if p.exists():
            p.unlink()
    yield


def test_channels_seeded():
    names = [c["name"] for c in board.channels()]
    assert "fleet-pulse" in names
    assert "dev-worklog" in names
    assert "handoffs" in names


def test_post_and_get():
    row = board.post("dev-worklog", "fritz", "started P2", "WIP: board module done")
    assert row["id"] > 0
    assert row["channel"] == "dev-worklog"
    got = board.get_post(row["id"])
    assert got["title"] == "started P2"
    assert got["body"] == "WIP: board module done"


def test_reply_thread():
    parent = board.post("dev-worklog", "fritz", "task", "body")
    reply = board.post("dev-worklog", "boomy", "", "ack", parent_id=parent["id"])
    assert reply["parent_id"] == parent["id"]
    assert board.get_post(reply["id"])["parent_id"] == parent["id"]


def test_reply_unknown_parent_rejected():
    with pytest.raises(ValueError):
        board.post("dev-worklog", "fritz", "", "x", parent_id=99999)


def test_unknown_channel_rejected():
    with pytest.raises(ValueError):
        board.post("nope", "fritz", "", "x")


def test_list_posts_order_and_filter():
    board.post("dev-worklog", "a", "one", "body 1")
    board.post("handoffs", "b", "two", "body 2")
    board.post("dev-worklog", "c", "three", "body 3")
    all_posts = board.list_posts()
    assert [p["title"] for p in all_posts] == ["three", "two", "one"]
    dev = board.list_posts(channel="dev-worklog")
    assert [p["title"] for p in dev] == ["three", "one"]


def test_list_posts_since_id():
    p1 = board.post("dev-worklog", "a", "one", "x")
    board.post("dev-worklog", "b", "two", "x")
    newer = board.list_posts(since_id=p1["id"])
    assert [p["title"] for p in newer] == ["two"]


def test_search():
    board.post("dev-worklog", "fritz", "P2 board", "bulletin board implementation")
    board.post("handoffs", "boomy", "patrol", "robot mission report")
    hits = board.search("bulletin")
    assert len(hits) == 1
    assert hits[0]["title"] == "P2 board"
    assert board.search("robot")[0]["author"] == "boomy"


def test_inbox_send_poll():
    board.inbox_send("boomy", "fritz", "patrol", "run the patrol route")
    board.inbox_send("boomy", "fritz", "recon", "scan sector 7")
    board.inbox_send("fritz", "boomy", "ack", "roger")
    msgs = board.inbox_poll("boomy")
    assert len(msgs) == 2
    assert msgs[0]["subject"] == "patrol"
    # Consumed on read
    assert board.inbox_poll("boomy") == []
    # Other entity untouched
    assert len(board.inbox_poll("fritz")) == 1


def test_inbox_poll_mark_read_false():
    board.inbox_send("fritz", "boomy", "ping", "hello")
    assert len(board.inbox_poll("fritz", mark_read=False)) == 1
    assert len(board.inbox_poll("fritz", mark_read=False)) == 1


def test_inbox_status():
    board.inbox_send("fritz", "boomy", "a", "1")
    board.inbox_send("fritz", "boomy", "b", "2")
    board.inbox_send("boomy", "fritz", "c", "3")
    status = board.inbox_status()
    assert status["unread_by_entity"]["fritz"] == 2
    assert status["unread_by_entity"]["boomy"] == 1
    assert status["total_messages"] == 3


def test_inbox_requires_body():
    with pytest.raises(ValueError):
        board.inbox_send("fritz", "boomy", "x", "")
