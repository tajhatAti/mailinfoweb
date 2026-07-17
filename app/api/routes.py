"""REST endpoints — health, accounts, email body, block/delete, auth."""
from __future__ import annotations

import email as email_parser
import html as html_mod
import logging
import re
from email.utils import parseaddr, parsedate_to_datetime

from aioimaplib import aioimaplib
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..config import ImapAccount
from ..services.db import db
from ..auth import (
    AUTH_PASSWORD,
    COOKIE_NAME,
    SESSION_TTL,
    create_session_token,
    is_authenticated,
    require_auth,
)

router = APIRouter()
log = logging.getLogger("email-monitor.api")


# ── Login Page ────────────────────────────────────────────────────

LOGIN_HTML = """<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inbox Pulse — Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1a2e;font-family:system-ui,-apple-system,sans-serif;
background-image:radial-gradient(circle at 15% 10%,rgba(100,120,255,.15),transparent 55%),radial-gradient(circle at 85% 90%,rgba(0,200,180,.1),transparent 50%)}
.card{background:rgba(30,30,55,.7);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:40px 32px;width:100%;max-width:380px;backdrop-filter:blur(20px);box-shadow:0 20px 60px rgba(0,0,0,.4)}
h1{font-size:22px;font-weight:700;color:#e0e0ff;text-align:center;margin-bottom:4px}
.sub{font-size:12px;color:#8888aa;text-align:center;margin-bottom:24px}
.err{background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.25);border-radius:10px;padding:10px 14px;font-size:12px;color:#ff6b6b;margin-bottom:16px;display:none}
.err.show{display:block}
label{font-size:11px;font-weight:600;color:#aaaacc;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em}
input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.25);color:#e0e0ff;font-size:14px;outline:none;transition:border .2s}
input:focus{border-color:#7c8aff;box-shadow:0 0 0 3px rgba(124,138,255,.15)}
.btn{width:100%;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#7c6aff,#5bc8c0);color:#fff;font-size:14px;font-weight:700;cursor:pointer;margin-top:20px;transition:opacity .2s,transform .1s}
.btn:hover{opacity:.9}.btn:active{transform:scale(.98)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.hint{text-align:center;margin-top:16px;font-size:10px;color:#666688}
</style>
</head>
<body>
<div class="card">
<h1>🔐 Inbox Pulse</h1><p class="sub">Enter password to continue</p>
<div class="err" id="err">Wrong password</div>
<label for="pw">Password</label>
<input id="pw" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()" autofocus>
<button class="btn" id="btn" onclick="doLogin()">Log In</button>
<p class="hint">Only you can access monitored emails</p>
</div>
<script>
async function doLogin() {
  const btn=document.getElementById('btn'),err=document.getElementById('err'),pw=document.getElementById('pw');
  btn.disabled=true;btn.textContent='Logging in…';err.classList.remove('show');
  try {
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw.value})});
    if(r.ok){window.location='/'}else{err.classList.add('show')}
  }catch(e){err.textContent='Network error';err.classList.add('show')}
  btn.disabled=false;btn.textContent='Log In';
}
</script>
</body>
</html>"""


@router.get("/login", include_in_schema=False)
async def login_page():
    """Serve the login page."""
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=LOGIN_HTML)


# ── Health & Accounts ────────────────────────────────────────────

@router.get("/health")
async def health(request: Request) -> dict:
    pool = getattr(request.app.state, "pool", None)
    return {
        "status": "ok",
        "accounts": len(pool.accounts) if pool else 0,
        "workers_alive": pool.alive_count() if pool else 0,
    }


@router.get("/accounts")
async def list_accounts(request: Request) -> dict:
    pool = getattr(request.app.state, "pool", None)
    return {"accounts": [a.email for a in (pool.accounts if pool else [])]}


# ── Auth ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


@router.post("/api/login")
async def login(body: LoginRequest, response: Response):
    """Validate password and set session cookie."""
    if body.password != AUTH_PASSWORD:
        raise HTTPException(status_code=401, detail="Wrong password")

    token = create_session_token()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL,
        httponly=True,
        secure=False,  # Render terminates TLS, FastAPI sees HTTP
        samesite="lax",
        path="/",
    )
    return {"ok": True, "message": "Logged in"}


@router.post("/api/logout")
async def logout(response: Response):
    """Clear session cookie."""
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/api/auth-status")
async def auth_status(request: Request):
    """Check if current request is authenticated."""
    return {"authenticated": is_authenticated(request)}


# ── Emails (from DB) ─────────────────────────────────────────────

@router.get("/api/emails")
async def list_emails(limit: int = Query(200, le=500), request: Request = None):
    """Return emails from DB."""
    require_auth(request)
    return {"emails": db.get_emails(limit)}


# ── Email Body ───────────────────────────────────────────────────

def _flatten_response(data: list) -> bytes:
    parts: list[bytes] = []
    for item in data:
        if isinstance(item, (bytes, bytearray)):
            parts.append(bytes(item))
        elif isinstance(item, tuple):
            for sub in item:
                if isinstance(sub, (bytes, bytearray)):
                    parts.append(bytes(sub))
    return b"".join(parts)


def _strip_imap_artifacts(text: str) -> str:
    text = re.sub(r"^\*?\d+\s+FETCH\s+.*?\{.*?\}\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"RFC822\s*\{[^}]*\}\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\)\s*Success\s*$", "", text, flags=re.IGNORECASE)
    return text.strip()


def _extract_html_body(msg) -> str:
    """Walk MIME tree, return best HTML representation."""
    html_part = None
    plain_part = None
    for part in msg.walk():
        ct = part.get_content_type()
        if ct == "text/html" and html_part is None:
            html_part = part
        elif ct == "text/plain" and plain_part is None:
            plain_part = part

    if html_part:
        return _decode_part(html_part)
    if plain_part:
        text = _decode_part(plain_part)
        text = html_mod.escape(text)
        text = re.sub(r"(https?://[^\s<>\"']+)",
                      r'<a href="\1" target="_blank" rel="noopener" class="text-primary underline break-all">\1</a>',
                      text)
        return f'<div class="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">{text}</div>'
    return ""


def _decode_part(part) -> str:
    try:
        payload = part.get_payload(decode=True)
        if payload is None:
            return ""
        if isinstance(payload, str):
            return payload
        charset = part.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace")
    except Exception:
        return str(part.get_payload())


@router.get("/api/email-body")
async def fetch_email_body(
    account: str = Query(...),
    uid: str = Query(...),
    request: Request = None,
):
    pool = getattr(request.app.state, "pool", None)
    if not pool or not pool.accounts:
        raise HTTPException(status_code=503, detail="No accounts configured")

    acc: ImapAccount | None = None
    for a in pool.accounts:
        if a.email == account:
            acc = a
            break
    if acc is None:
        raise HTTPException(status_code=404, detail=f"Account {account} not found")

    client: aioimaplib.IMAP4_SSL | None = None
    try:
        client = aioimaplib.IMAP4_SSL(host=acc.host, port=acc.port, timeout=20)
        await client.wait_hello_from_server()
        await client.login(acc.email, acc.password)
        await client.select("INBOX")

        # Fetch full RFC822 — proper MIME parsing, no noise
        typ, rfc_data = await client.uid("fetch", uid, "(RFC822)")
        if typ != "OK" or not rfc_data:
            raise HTTPException(status_code=404, detail="Message not found")

        raw = _flatten_response(rfc_data)
        raw_text = raw.decode("utf-8", errors="replace")
        cleaned = _strip_imap_artifacts(raw_text)

        msg = email_parser.message_from_string(cleaned)
        from_name, from_addr = parseaddr(msg.get("From", ""))
        sender = from_name or from_addr or "Unknown"
        sender_email = from_addr or None
        subject = msg.get("Subject", "(no subject)")
        ts = msg.get("Date", "")
        try:
            ts_iso = parsedate_to_datetime(ts).isoformat() if ts else None
        except Exception:
            ts_iso = None

        body_html = _extract_html_body(msg)

        # Sanitise HTML
        body_html = re.sub(r"<script[^>]*>.*?</script>", "", body_html, flags=re.IGNORECASE | re.DOTALL)
        body_html = re.sub(r"<style[^>]*>.*?</style>", "", body_html, flags=re.IGNORECASE | re.DOTALL)
        body_html = re.sub(r'(<a\s[^>]*href=")([^"]+)"',
                           r'\1\2" target="_blank" rel="noopener noreferrer"', body_html)
        body_html = re.sub(r"(<img\s)", r'\1style="max-width:100%;height:auto;border-radius:8px;" ', body_html)

        css = "<style>.email-body{font-family:system-ui,-apple-system,sans-serif;color:inherit;max-width:100%;overflow-x:hidden}.email-body a{color:#7c8aff;word-break:break-all}.email-body img{max-width:100%!important;height:auto!important;border-radius:8px}.email-body table{max-width:100%!important}.email-body blockquote{border-left:3px solid rgba(124,138,255,.3);margin:8px 0;padding:4px 12px;color:inherit;opacity:.85}.email-body .code-box,.email-body .otp-box{background:rgba(124,138,255,.1);border:2px dashed rgba(124,138,255,.4);border-radius:12px;padding:14px 20px;text-align:center;margin:12px 0;font-size:26px;font-weight:800;letter-spacing:.25em;font-family:monospace;color:#7c8aff;word-break:break-all}</style>"

        if len(body_html) > 20000:
            body_html = body_html[:20000] + "<p class='text-muted-foreground text-center py-4 text-xs'>... [truncated]</p>"

        return {
            "id": f"{account}:{uid}",
            "uid": uid,
            "account": account,
            "subject": subject,
            "sender": sender,
            "senderEmail": sender_email,
            "timestamp": ts_iso,
            "body": css + '<div class="email-body">' + body_html + "</div>",
            "isHtml": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        log.warning("email-body error [%s:%s]: %s", account, uid, e)
        raise HTTPException(status_code=502, detail=f"IMAP error: {e}")
    finally:
        if client is not None:
            try:
                await client.logout()
            except Exception:
                pass


# ── Block / Unblock ──────────────────────────────────────────────

class BlockRequest(BaseModel):
    senderEmail: str


@router.post("/api/block-sender")
async def block_sender(body: BlockRequest, request: Request):
    require_auth(request)
    ok = db.block_sender(body.senderEmail)
    return {"ok": ok, "blocked": body.senderEmail}


@router.post("/api/unblock-sender")
async def unblock_sender(body: BlockRequest, request: Request):
    require_auth(request)
    ok = db.unblock_sender(body.senderEmail)
    return {"ok": ok, "unblocked": body.senderEmail}


@router.get("/api/blocked-senders")
async def blocked_senders():
    return {"blocked": db.get_blocked_list()}


# ── Delete Email ─────────────────────────────────────────────────

class DeleteRequest(BaseModel):
    id: str
    uid: str = ""
    account: str = ""


@router.post("/api/delete-email")
async def delete_email(body: DeleteRequest, request: Request = None):
    if request:
        require_auth(request)
    """Delete email from IMAP server (set Deleted flag + expunge) AND from local DB."""
    deleted_from_imap = False

    # 1. Delete from IMAP if uid + account provided
    if body.uid and body.account:
        pool = getattr(request.app.state, "pool", None) if request else None
        if pool:
            acc = next((a for a in pool.accounts if a.email == body.account), None)
            if acc:
                client = None
                try:
                    client = aioimaplib.IMAP4_SSL(host=acc.host, port=acc.port, timeout=20)
                    await client.wait_hello_from_server()
                    await client.login(acc.email, acc.password)
                    await client.select("INBOX")
                    # Set deleted flag
                    await client.uid("store", body.uid, "+FLAGS", "(\Deleted)")
                    await client.expunge()
                    await client.logout()
                    deleted_from_imap = True
                    log.info("Deleted from IMAP: %s", body.id)
                except Exception as e:
                    log.warning("IMAP delete failed for %s: %s", body.id, e)

    # 2. Delete from local DB
    db.delete_email(body.id)

    return {"ok": True, "deletedFromImap": deleted_from_imap}
