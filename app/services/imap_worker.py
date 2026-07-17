"""Per-account IMAP poller — simple, reliable.

  1. Connect, login, select INBOX.
  2. Poll every 8s → count change → fetch newest (RFC822 full parse).
  3. NOOP every 40s to keep connection alive.
  4. Auto-reconnect on any failure.
"""
from __future__ import annotations

import asyncio
import email
import logging
import re
from email.utils import parseaddr, parsedate_to_datetime
from typing import Awaitable, Callable

from aioimaplib import aioimaplib

from ..config import ImapAccount

log = logging.getLogger("email-monitor.imap")
POLL_SECONDS = 8
NOOP_EVERY = 5


def _flatten_response(data: list) -> bytes:
    """Collect all bytes from a nested IMAP response list into a single bytes object."""
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
    """Remove IMAP FETCH protocol noise."""
    text = re.sub(r"^\*?\d+\s+FETCH\s+.*?\{.*?\}\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"BODY\[[^\]]*\]\s*\{[^}]*\}\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\)\s*Success\s*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bUID\s+\d+\b", "", text, flags=re.IGNORECASE)
    return text.strip()


def _extract_text(msg) -> str:
    """Walk a MIME message tree and return the best text representation."""
    if msg.is_multipart():
        # prefer HTML, fallback to plain
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
            return _decode_part(plain_part)
        # fallback: return first text part
        for part in msg.walk():
            if part.get_content_maintype() == "text":
                return _decode_part(part)
        return ""
    else:
        return _decode_part(msg)


def _decode_part(part) -> str:
    """Decode a MIME part to string, handling different charsets."""
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


def _clean_preview(raw: str) -> str:
    """Strip HTML/entities, collapse whitespace, trim."""
    txt = re.sub(r"<[^>]+>", " ", raw)
    txt = re.sub(r"&[a-z]+;", " ", txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt[:300]


def _parse_msg_from_response(data: list) -> email.message.Message | None:
    """Parse an RFC822 message from IMAP FETCH response data."""
    raw = _flatten_response(data)
    raw_text = raw.decode("utf-8", errors="replace")
    cleaned = _strip_imap_artifacts(raw_text)
    try:
        return email.message_from_string(cleaned)
    except Exception:
        return None


async def _fetch_newest(
    client: aioimaplib.IMAP4_SSL,
    account_email: str,
) -> dict | None:
    """Fetch RFC822 + UID, parse properly with Python email lib. No MIME noise."""
    typ, data = await client.search("ALL")
    if typ != "OK" or not data or not data[0]:
        return None

    ids_raw = data[0]
    if isinstance(ids_raw, (bytes, bytearray)):
        ids_raw = ids_raw.decode()
    ids = ids_raw.strip().split()
    if not ids:
        return None

    latest_seq = ids[-1]

    # Fetch full RFC822 + UID — proper MIME parsing
    typ, rfc_data = await client.fetch(latest_seq, "(RFC822 UID)")
    if typ != "OK":
        return None

    msg = _parse_msg_from_response(rfc_data)
    if msg is None:
        return None

    # Extract UID
    msg_uid = latest_seq
    for item in rfc_data:
        txt = item.decode(errors="ignore") if isinstance(item, (bytes, bytearray)) else str(item)
        m = re.search(r"UID\s+(\d+)", txt, re.IGNORECASE)
        if m:
            msg_uid = m.group(1)
            break

    # Headers
    from_name, from_addr = parseaddr(msg.get("From", ""))
    subject = msg.get("Subject", "(no subject)")
    ts = msg.get("Date", "")
    try:
        ts_iso = parsedate_to_datetime(ts).isoformat() if ts else None
    except Exception:
        ts_iso = None

    # Body preview — properly parsed, no MIME boundaries
    body_text = _extract_text(msg)
    preview = _clean_preview(body_text)

    return {
        "id": f"{account_email}:{msg_uid}",
        "uid": msg_uid,
        "account": account_email,
        "sender": from_name or from_addr or "Unknown",
        "senderEmail": from_addr or None,
        "subject": subject,
        "timestamp": ts_iso,
        "preview": preview,
    }


async def run_worker(
    account: ImapAccount,
    on_event: Callable[[dict], Awaitable[None]],
    stop_event: asyncio.Event,
) -> None:
    poll_count = 0
    last_count = 0
    backoff = 2.0

    while not stop_event.is_set():
        client: aioimaplib.IMAP4_SSL | None = None
        try:
            client = aioimaplib.IMAP4_SSL(host=account.host, port=account.port, timeout=30)
            await client.wait_hello_from_server()
            await client.login(account.email, account.password)
            await client.select("INBOX")
            log.info("[%s] ✅ connected — poll every %ds", account.email, POLL_SECONDS)
            backoff = 2.0
            poll_count = 0

            typ, d = await client.search("ALL")
            if typ == "OK" and d and d[0]:
                raw = d[0]
                if isinstance(raw, (bytes, bytearray)):
                    raw = raw.decode()
                last_count = len(raw.strip().split()) if raw.strip() else 0
            else:
                last_count = 0

            first = await _fetch_newest(client, account.email)
            if first:
                log.info("[%s] 📩 latest: %s", account.email, first.get("subject"))
                await on_event(first)

            while not stop_event.is_set():
                await asyncio.sleep(POLL_SECONDS)
                if stop_event.is_set():
                    break
                poll_count += 1
                if poll_count % NOOP_EVERY == 0:
                    try:
                        await client.noop()
                    except Exception:
                        break

                typ, d = await client.search("ALL")
                if typ != "OK" or not d or not d[0]:
                    break

                raw = d[0]
                if isinstance(raw, (bytes, bytearray)):
                    raw = raw.decode()
                current_count = len(raw.strip().split()) if raw.strip() else 0

                if current_count > last_count:
                    log.info("[%s] 📬 %d→%d", account.email, last_count, current_count)
                    msg = await _fetch_newest(client, account.email)
                    if msg:
                        await on_event(msg)
                    last_count = current_count
                elif current_count < last_count:
                    last_count = current_count

        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("[%s] ⚠️ %s — retry in %.0fs", account.email, e, backoff)
        finally:
            try:
                if client is not None:
                    await client.logout()
            except Exception:
                pass

        if stop_event.is_set():
            break
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60)
