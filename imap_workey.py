"""Per-account IMAP IDLE worker.

Runs an infinite loop that:
  1. Opens an aioimaplib connection and logs in.
  2. Selects INBOX and issues IDLE.
  3. Emits an event whenever the server pushes EXISTS.
  4. Recovers from any failure with exponential backoff.
"""
from future import annotations

import asyncio
import email
import logging
from email.utils import parseaddr, parsedate_to_datetime
from typing import Awaitable, Callable

from aioimaplib import aioimaplib

from ..config import ImapAccount

log = logging.getLogger("email-monitor.imap")

# aioimaplib's IDLE returns after this many seconds even without activity,
# which lets us keep the connection healthy (most servers cap IDLE at 29 min).
IDLE_TIMEOUT = 25 * 60


async def _fetch_latest(client: aioimaplib.IMAP4_SSL, account_email: str) -> dict | None:
    """Fetch metadata for the newest message in the mailbox."""
    typ, data = await client.uid("search", "ALL")
    if typ != "OK" or not data or not data[0]:
        return None
    uids = data[0].split()
    if not uids:
        return None
    latest_uid = uids[-1].decode()
    typ, msg_data = await client.uid("fetch", latest_uid, "(BODY.PEEK[HEADER])")
    if typ != "OK":
        return None
    # msg_data structure varies; find the bytes payload
    raw = next((p for p in msg_data if isinstance(p, (bytes, bytearray)) and len(p) > 40), None)
    if not raw:
        return None
    msg = email.message_from_bytes(bytes(raw))
    from_name, from_addr = parseaddr(msg.get("From", ""))
    ts = msg.get("Date", "")
    try:
        ts_iso = parsedate_to_datetime(ts).isoformat() if ts else None
    except Exception:
        ts_iso = None
    return {
        "id": f"{account_email}:{latest_uid}",
        "account": account_email,
        "sender": from_name or from_addr or "Unknown",
        "senderEmail": from_addr or None,
        "subject": msg.get("Subject", "(no subject)"),
        "timestamp": ts_iso,
    }


async def run_worker(
    account: ImapAccount,
    on_event: Callable[[dict], Awaitable[None]],
    stop_event: asyncio.Event,
) -> None:
    backoff = 2.0
    while not stop_event.is_set():
        client: aioimaplib.IMAP4_SSL | None = None
        try:
            client = aioimaplib.IMAP4_SSL(host=account.host, port=account.port, timeout=30)
            await client.wait_hello_from_server()
            await client.login(account.email, account.password)
            await client.select("INBOX")
            log.info("[%s] connected", account.email)
            backoff = 2.0  # reset on success

            # Emit the latest existing message once so the UI has context.
            latest = await _fetch_latest(client, account.email)
            if latest:
                await on_event(latest)

            while not stop_event.is_set():
                idle_task = await client.idle_start(timeout=IDLE_TIMEOUT)
                # Wait for a push OR for the caller to request shutdown.
                stop_wait = asyncio.create_task(stop_event.wait())
                done, _ = await asyncio.wait(
                    {idle_task, stop_wait},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                client.idle_done()
                try:
                    await asyncio.wait_for(idle_task, timeout=5)
                except asyncio.TimeoutError:
                    pass
                stop_wait.cancel()

                if stop_event.is_set():
                    break

                # Something happened — refetch the newest header.
                latest = await _fetch_latest(client, account.email)
                if latest:
                    await on_event(latest)

        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("[%s] worker error: %s (retry in %.0fs)", account.email, e, backoff)
            try:
                if client is not None:
                    await client.logout()
            except Exception:
                pass
            try: