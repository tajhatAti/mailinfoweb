"""FastAPI application entry point — Render Free Plan optimised."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .api.routes import router as api_router
from .auth import APP_SECRET, AuthMiddleware
from .config import allowed_origins, load_accounts
from .services.db import db
from .services.imap_pool import ImapPool
from .websocket.handlers import ConnectionManager, register_ws_routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("email-monitor")

# ── static frontend dir ──────────────────────────────────────────────
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    accounts = load_accounts()
    db.setup()  # init SQLite tables
    manager = ConnectionManager()
    pool = ImapPool(accounts=accounts, on_event=manager.broadcast)
    app.state.manager = manager
    app.state.pool = pool
    log.info("Starting IMAP pool for %d accounts", len(accounts))
    await pool.start()
    try:
        yield
    finally:
        log.info("Stopping IMAP pool")
        await pool.stop()


app = FastAPI(title="Email Monitor Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
register_ws_routes(app)

# ── Auth middleware (protects everything except /login, /health, /assets) ──
app.add_middleware(AuthMiddleware)
log.info("Auth enabled — password from PASSWORD env var")

# ── security warning if default password ──────────────────────────────
if APP_SECRET == "changeme":
    log.warning(
        "⚠️  Using default PASSWORD! Set PASSWORD env var on Render for security."
    )

# ── serve built frontend SPA ─────────────────────────────────────────
if DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str = ""):
        """Fallback to index.html for React SPA routing."""
        index = DIST_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        return {"error": "Frontend not built. Run `npm run build`."}
else:
    @app.get("/")
    async def root_no_frontend():
        return {
            "message": "Email Monitor API is running",
            "health": "/health",
            "accounts": "/accounts",
        }


# ── Render uses $PORT ────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "7860"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
