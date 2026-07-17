"""Auth — pure ASGI middleware + helper functions for endpoints."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import Optional

from fastapi import HTTPException
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

log = logging.getLogger("email-monitor.auth")

APP_SECRET: str = os.environ.get("SECRET_KEY", os.environ.get("PASSWORD", "changeme"))
AUTH_PASSWORD: str = os.environ.get("PASSWORD", os.environ.get("SECRET_KEY", "changeme"))

COOKIE_NAME = "inbox_auth"
SESSION_TTL = 86400 * 7

PUBLIC_PATHS = {
    "/login",
    "/health",
    "/api/login",
    "/api/logout",
    "/api/auth-status",
    "/favicon.ico",
    "/robots.txt",
}


def _hmac_sign(data: str) -> str:
    return hmac.new(APP_SECRET.encode(), data.encode(), hashlib.sha256).hexdigest()


def create_session_token() -> str:
    ts = str(int(time.time()))
    rand = secrets.token_hex(8)
    return f"{ts}:{rand}:{_hmac_sign(f'{ts}:{rand}')}"


def verify_session_token(token: str) -> bool:
    try:
        ts_str, rand, sig = token.split(":")
        if time.time() - int(ts_str) > SESSION_TTL:
            return False
        return hmac.compare_digest(_hmac_sign(f"{ts_str}:{rand}"), sig)
    except Exception:
        return False


def _parse_cookies(scope: Scope) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for h in scope.get("headers", []):
        if h[0] == b"cookie":
            for c in h[1].decode(errors="ignore").split("; "):
                if "=" in c:
                    k, v = c.split("=", 1)
                    cookies[k.strip()] = v.strip()
    return cookies


def get_session_from_request(request) -> Optional[str]:
    """FastAPI Request wrapper for cookie extraction."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    return token


def is_authenticated(request) -> bool:
    """Check if a FastAPI Request is authenticated."""
    token = get_session_from_request(request)
    if not token:
        return False
    return verify_session_token(token)


def require_auth(request):
    """Raise 401 if request is not authenticated."""
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Authentication required")


class AuthMiddleware:
    """Pure ASGI middleware — passes WebSocket & lifespan through, only checks HTTP."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # ── WebSocket → pass through (handler checks auth itself) ──
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        # ── Public paths → allow ──
        if path in PUBLIC_PATHS or path.startswith("/assets/"):
            await self.app(scope, receive, send)
            return

        # ── Auth check ──
        cookies = _parse_cookies(scope)
        token = cookies.get(COOKIE_NAME)
        if token and verify_session_token(token):
            await self.app(scope, receive, send)
            return

        # ── Not authenticated ──
        if path.startswith("/api/") or path == "/ws":
            resp = Response(
                content='{"error":"auth required"}',
                status_code=401,
                media_type="application/json",
            )
        else:
            resp = Response(status_code=302, headers={"Location": "/login"})

        await resp(scope, receive, send)
