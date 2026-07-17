"""WebSocket route + broadcast manager + persistent DB store.

- Stores all emails in SQLite (survives sleep, accessible from any device).
- New clients receive last 200 emails from DB on connect.
- Filters out blocked senders before broadcasting.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from ..services.db import db

log = logging.getLogger("email-monitor.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, event: dict) -> None:
        """Save to DB, then send to all clients. Skip if sender is blocked."""
        sender_email = (event.get("senderEmail") or "").lower().strip()
        if sender_email:
            blocked = db.get_blocked()
            if sender_email in blocked:
                log.info("🚫 blocked sender skipped: %s", sender_email)
                return

        # Persist to DB
        db.insert_email(event)

        # Broadcast to connected clients
        payload = json.dumps(event, default=str)
        dead: list[WebSocket] = []
        async with self._lock:
            targets = list(self._clients)
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)

    async def replay_to(self, ws: WebSocket) -> None:
        """Send all emails from DB to a freshly connected client (filtered by blocks)."""
        emails = db.get_emails(200)
        for event in reversed(emails):  # oldest first, newest last
            try:
                await ws.send_text(json.dumps(event, default=str))
            except Exception:
                break

    @property
    def client_count(self) -> int:
        return len(self._clients)


def register_ws_routes(app: FastAPI) -> None:
    @app.websocket("/ws")
    async def stream(ws: WebSocket) -> None:
        # Auth check from cookie
        from ..auth import get_session_from_request, verify_session_token

        token = ws.cookies.get("inbox_auth")
        if not token or not verify_session_token(token):
            await ws.close(code=4001, reason="Unauthorized")
            log.warning("ws rejected: no valid auth cookie")
            return

        manager: ConnectionManager = ws.app.state.manager
        await manager.connect(ws)
        log.info("ws client connected (total=%d)", manager.client_count)

        # Replay DB emails so client is always up-to-date
        await manager.replay_to(ws)

        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception as e:
            log.warning("ws error: %s", e)
        finally:
            await manager.disconnect(ws)
            log.info("ws client disconnected (total=%d)", manager.client_count)
