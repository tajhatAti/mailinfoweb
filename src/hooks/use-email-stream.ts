import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus, EmailMessage } from "@/lib/email-types";

const MAX_EMAILS = 500;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 15000;
const STORAGE_KEY = "inbox-pulse-emails";
const POLL_FALLBACK_MS = 30000;

function loadStored(): EmailMessage[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw).slice(0, MAX_EMAILS) : []; } catch { return []; }
}
function persist(emails: EmailMessage[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(emails.slice(0, MAX_EMAILS))); } catch {}
}

export function useEmailStream({ url, accounts }: { url?: string; accounts: string[] }) {
  const [status, setStatus] = useState<ConnectionStatus>(url ? "connecting" : "disconnected");
  const [emails, setEmails] = useState<EmailMessage[]>(loadStored);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const seenIds = useRef<Set<string>>(new Set(emails.map(e => e.id)));

  const prepend = useCallback((msg: EmailMessage) => {
    if (seenIds.current.has(msg.id)) return;
    seenIds.current.add(msg.id);
    setEmails(prev => { const next = [msg, ...prev].slice(0, MAX_EMAILS); persist(next); return next; });
  }, []);

  const removeEmail = useCallback((predicate: (e: EmailMessage) => boolean) => {
    setEmails(prev => {
      const next = prev.filter(predicate);
      seenIds.current = new Set(next.map(e => e.id));
      persist(next);
      return next;
    });
  }, []);

  const connect = useCallback(() => {
    if (!url) { setStatus("disconnected"); return; }
    setStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { attemptRef.current = 0; setStatus("connected"); };
      ws.onmessage = (evt) => {
        try {
          const d = JSON.parse(evt.data);
          prepend({ id: d.id ?? crypto.randomUUID(), uid: d.uid, subject: d.subject ?? "(no subject)", sender: d.sender ?? "Unknown", senderEmail: d.senderEmail, timestamp: d.timestamp ?? new Date().toISOString(), account: d.account ?? "", preview: d.preview ?? "" });
        } catch { /* skip */ }
      };
      ws.onclose = () => { wsRef.current = null; attemptRef.current++; setStatus("reconnecting"); const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS); reconnectTimer.current = window.setTimeout(connect, delay); };
    } catch { setStatus("disconnected"); }
  }, [url, prepend]);

  const reconnect = useCallback(() => { attemptRef.current = 0; wsRef.current?.close(); if (reconnectTimer.current) clearTimeout(reconnectTimer.current); connect(); }, [connect]);

  // DB poll fallback
  useEffect(() => {
    if (!url) return;
    const apiBase = url.replace(/\/ws$/, "").replace("wss://", "https://").replace("ws://", "http://");
    const poll = () => {
      fetch(`${apiBase}/api/emails`)
        .then(r => r.json())
        .then(data => { if (data.emails) for (const d of data.emails) prepend(d as EmailMessage); })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, POLL_FALLBACK_MS);
    return () => clearInterval(id);
  }, [url, prepend]);

  useEffect(() => { connect(); return () => { wsRef.current?.close(); if (reconnectTimer.current) clearTimeout(reconnectTimer.current); }; }, [connect]);

  return { status, emails, reconnect, removeEmail };
}
