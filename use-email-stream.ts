import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionStatus, EmailMessage } from "@/lib/email-types";

const MAX_EMAILS = 500;
const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 15000;

interface Options {
  url?: string;
  /** Fallback to a mock stream when no URL provided or connection fails permanently. */
  enableMockFallback?: boolean;
  accounts: string[];
}

export function useEmailStream({ url, enableMockFallback = true, accounts }: Options) {
  const [status, setStatus] = useState<ConnectionStatus>(url ? "connecting" : "disconnected");
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [usingMock, setUsingMock] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const mockTimer = useRef<number | null>(null);

  const prependEmail = useCallback((msg: EmailMessage) => {
    setEmails((prev) => {
      const next = [msg, ...prev];
      if (next.length > MAX_EMAILS) next.length = MAX_EMAILS;
      return next;
    });
  }, []);

  const startMock = useCallback(() => {
    if (mockTimer.current) return;
    setUsingMock(true);
    setStatus("connected");
    const subjects = [
      "Your invoice is ready",
      "Weekly digest — 12 new items",
      "Security alert: new sign-in",
      "Meeting reschedule request",
      "Deploy #4821 completed",
      "Payment received",
      "New follower on your update",
      "Password reset requested",
      "Order shipped — tracking inside",
      "Draft feedback attached",
    ];
    const senders = [
      "GitHub", "Stripe", "Vercel", "Linear", "Notion",
      "AWS", "Figma", "Slack", "Google", "Cloudflare",
    ];
    const tick = () => {
      const account = accounts[Math.floor(Math.random() * accounts.length)];
      const sender = senders[Math.floor(Math.random() * senders.length)];
      prependEmail({
        id: crypto.randomUUID(),
        subject: subjects[Math.floor(Math.random() * subjects.length)],
        sender,
        senderEmail: ${sender.toLowerCase()}@notifications.io,
        timestamp: new Date().toISOString(),
        account,
        preview: "Preview snippet of the message content shown inline for quick triage.",
      });
      mockTimer.current = window.setTimeout(tick, 1800 + Math.random() * 3200);
    };
    tick();
  }, [accounts, prependEmail]);

  const stopMock = useCallback(() => {
    if (mockTimer.current) {
      clearTimeout(mockTimer.current);
      mockTimer.current = null;
    }
    setUsingMock(false);
  }, []);

  const connect = useCallback(() => {
    if (!url) {
      if (enableMockFallback) startMock();
      return;
    }
    stopMock();
    setStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus("connected");
      };
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          const msg: EmailMessage = {
            id: data.id ?? crypto.randomUUID(),
            subject: data.subject ?? "(no subject)",
            sender: data.sender ?? data.from ?? "Unknown",
            senderEmail: data.senderEmail ?? data.from_email,
            timestamp: data.timestamp ?? new Date().toISOString(),
            account: data.account ?? "unknown",
            preview: data.preview ?? data.snippet,
          };
          prependEmail(msg);
        } catch (e) {
          console.warn("Malformed WS payload", e);
        }
      };
      ws.onerror = () => { /* handled in onclose */ };
      ws.onclose = () => {
        wsRef.current = null;
        attemptRef.current += 1;
        if (attemptRef.current > 6 && enableMockFallback) {
          startMock();
          return;
        }
        setStatus("reconnecting");
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
        reconnectTimer.current = window.setTimeout(connect, delay);