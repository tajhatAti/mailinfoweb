# Email Monitor Service — FastAPI + aioimaplib

Async IMAP IDLE monitor for 30+ mailboxes, streaming new-message events to the
dashboard over WebSockets. Designed for Hugging Face Spaces (Docker SDK).

## Structure

backend/
├── Dockerfile
├── requirements.txt
├── README.md
└── app/
    ├── main.py                 # FastAPI app + lifespan
    ├── config.py               # Loads accounts from ACCOUNTS_JSON env var
    ├── api/
    │   └── routes.py           # REST endpoints (health, accounts)
    ├── websocket/
    │   └── handlers.py         # /ws stream + connection manager
    └── services/
        ├── imap_pool.py        # Pool manager for N IMAP IDLE workers
        └── imap_worker.py      # Single-account IDLE loop with auto-recovery


## Deploy on Hugging Face Spaces

1. Create a Space, SDK = Docker.
2. Push these files (repo root should contain the Dockerfile).
3. In Settings → Variables and secrets, add a secret named
   ACCOUNTS_JSON with a JSON array:

      [
     {"email":"ops01@company.io","password":"app-pass","host":"imap.gmail.com","port":993},
     {"email":"ops02@company.io","password":"app-pass","host":"imap.gmail.com","port":993}
   ]
   

4. Optional secret ALLOWED_ORIGINS (comma-separated) for CORS.
5. The Space exposes port 7860 (HF default). The dashboard should point
   VITE_EMAIL_WS_URL at wss://<your-space>.hf.space/ws.

## Reliability

- Each account runs in its own asyncio.Task, isolated from the others.
- On IMAP4.abort, socket error, or IDLE timeout, the worker logs and retries
  with exponential backoff (2s → 60s cap). One dead account never blocks the pool.
- A supervisor task re-spawns any worker that exits unexpectedly.
- FastAPI's lifespan hook starts/stops the pool cleanly on SIGTERM.