"""SQLite persistence layer — survives Render free-tier sleep cycles."""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

log = logging.getLogger("email-monitor.db")

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "inbox.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=5000")
    return c


class Database:
    def __init__(self) -> None:
        self._local = threading.local()

    @property
    def conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = _conn()
        return self._local.conn

    def setup(self) -> None:
        c = self.conn
        c.executescript("""
            CREATE TABLE IF NOT EXISTS emails (
                id          TEXT PRIMARY KEY,
                uid         TEXT NOT NULL,
                account     TEXT NOT NULL,
                sender      TEXT NOT NULL DEFAULT 'Unknown',
                sender_email TEXT DEFAULT '',
                subject     TEXT NOT NULL DEFAULT '(no subject)',
                timestamp   TEXT DEFAULT '',
                preview     TEXT DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS blocked_senders (
                sender_email TEXT PRIMARY KEY,
                blocked_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account);
            CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at DESC);
        """)
        c.commit()
        log.info("Database ready at %s", DB_PATH)

    # ── Emails ──────────────────────────────────────────────────

    def insert_email(self, email: dict) -> bool:
        try:
            self.conn.execute(
                """INSERT OR IGNORE INTO emails
                   (id, uid, account, sender, sender_email, subject, timestamp, preview)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    email.get("id", ""),
                    email.get("uid", ""),
                    email.get("account", ""),
                    email.get("sender", "Unknown"),
                    email.get("senderEmail", ""),
                    email.get("subject", "(no subject)"),
                    email.get("timestamp", ""),
                    email.get("preview", ""),
                ),
            )
            self.conn.commit()
            return True
        except Exception as e:
            log.warning("insert_email failed: %s", e)
            return False

    def get_emails(self, limit: int = 200) -> List[dict]:
        rows = self.conn.execute(
            "SELECT * FROM emails ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        # Exclude blocked senders
        blocked = self.get_blocked()
        return [
            {
                "id": r["id"], "uid": r["uid"], "account": r["account"],
                "sender": r["sender"], "senderEmail": r["sender_email"],
                "subject": r["subject"], "timestamp": r["timestamp"],
                "preview": r["preview"],
            }
            for r in rows
            if r["sender_email"] not in blocked
        ]

    def delete_email(self, email_id: str) -> bool:
        try:
            self.conn.execute("DELETE FROM emails WHERE id=?", (email_id,))
            self.conn.commit()
            return True
        except Exception as e:
            log.warning("delete_email failed: %s", e)
            return False

    def get_email_by_id(self, email_id: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM emails WHERE id=?", (email_id,)).fetchone()
        if not r:
            return None
        return {
            "id": r["id"], "uid": r["uid"], "account": r["account"],
            "sender": r["sender"], "senderEmail": r["sender_email"],
            "subject": r["subject"], "timestamp": r["timestamp"],
            "preview": r["preview"],
        }

    # ── Blocked senders ─────────────────────────────────────────

    def block_sender(self, sender_email: str) -> bool:
        if not sender_email:
            return False
        try:
            self.conn.execute(
                "INSERT OR IGNORE INTO blocked_senders (sender_email) VALUES (?)",
                (sender_email.lower().strip(),),
            )
            self.conn.commit()
            log.info("Blocked sender: %s", sender_email)
            return True
        except Exception as e:
            log.warning("block_sender failed: %s", e)
            return False

    def unblock_sender(self, sender_email: str) -> bool:
        try:
            self.conn.execute(
                "DELETE FROM blocked_senders WHERE sender_email=?",
                (sender_email.lower().strip(),),
            )
            self.conn.commit()
            log.info("Unblocked sender: %s", sender_email)
            return True
        except Exception as e:
            log.warning("unblock_sender failed: %s", e)
            return False

    def get_blocked(self) -> set[str]:
        rows = self.conn.execute("SELECT sender_email FROM blocked_senders").fetchall()
        return {r["sender_email"] for r in rows}

    def get_blocked_list(self) -> List[dict]:
        rows = self.conn.execute(
            "SELECT sender_email, blocked_at FROM blocked_senders ORDER BY blocked_at DESC"
        ).fetchall()
        return [{"senderEmail": r["sender_email"], "blockedAt": r["blocked_at"]} for r in rows]


# Singleton
db = Database()
