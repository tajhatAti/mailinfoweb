import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Menu, RefreshCw, Activity, Mail, Clock, ShieldBan, X } from "lucide-react";
import { ACCOUNTS } from "@/lib/accounts";
import type { BlockedSender, EmailMessage } from "@/lib/email-types";
import { useEmailStream } from "@/hooks/use-email-stream";
import { ConnectionStatus } from "@/components/dashboard/ConnectionStatus";
import { AccountSidebar } from "@/components/dashboard/AccountSidebar";
import { EmailCard, EmailCardSkeleton } from "@/components/dashboard/EmailCard";
import { EmailDetail } from "@/components/dashboard/EmailDetail";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inbox Pulse — 7-Account Monitor" },
      { name: "description", content: "Real-time email monitoring — 7 IMAP accounts over WebSocket." },
      { property: "og:title", content: "Inbox Pulse — 7-Account Monitor" },
    ],
  }),
  component: Dashboard,
});

function getWsUrl(): string {
  const env = (import.meta as { env?: Record<string, string> }).env?.VITE_EMAIL_WS_URL;
  if (env) return env;
  if (typeof window === "undefined") return "";
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
}

function Dashboard() {
  const [selectedAcct, setSelectedAcct] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailEmail, setDetailEmail] = useState<EmailMessage | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedList, setBlockedList] = useState<BlockedSender[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const { status, emails, reconnect, removeEmail } = useEmailStream({ url: getWsUrl(), accounts: ACCOUNTS });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of emails) c[e.account] = (c[e.account] ?? 0) + 1;
    return c;
  }, [emails]);

  const visible = useMemo(() => selectedAcct ? emails.filter(e => e.account === selectedAcct) : emails, [emails, selectedAcct]);
  const idle = emails.length === 0 && (status === "connecting" || status === "reconnecting");
  const isLive = status === "connected";

  // ── Block sender ────────────────────────────────────────────
  const blockSender = useCallback(async (email: EmailMessage) => {
    if (!email.senderEmail) return;
    const r = await fetch("/api/block-sender", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderEmail: email.senderEmail }),
    });
    if (r.ok) {
      setToast(`🚫 Blocked ${email.senderEmail}`);
      setTimeout(() => setToast(null), 2500);
      // remove blocked sender's emails from UI
      removeEmail((e) => e.senderEmail !== email.senderEmail);
      loadBlocked();
    }
  }, [removeEmail]);

  // ── Delete email ────────────────────────────────────────────
  const deleteEmail = useCallback(async (email: EmailMessage) => {
    const r = await fetch("/api/delete-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: email.id, uid: email.uid ?? "", account: email.account }),
    });
    if (r.ok) {
      setToast("🗑️ Email deleted");
      setTimeout(() => setToast(null), 2000);
      removeEmail((e) => e.id !== email.id);
    }
  }, [removeEmail]);

  // ── Load blocked list ───────────────────────────────────────
  const loadBlocked = useCallback(() => {
    fetch("/api/blocked-senders").then(r => r.json()).then(d => setBlockedList(d.blocked ?? [])).catch(() => {});
  }, []);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);

  const unblockSender = async (email: string) => {
    await fetch("/api/unblock-sender", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senderEmail: email }) });
    setToast(`✅ Unblocked ${email}`);
    setTimeout(() => setToast(null), 2500);
    loadBlocked();
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-background/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="glass-panel rounded-lg p-2 lg:hidden"><Menu className="h-4 w-4" /></button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20"><Mail className="h-4 w-4 text-primary-foreground" /></div>
            <div><h1 className="text-sm font-semibold text-foreground">Inbox Pulse</h1><p className="text-[11px] text-muted-foreground">7 Accounts · Live</p></div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="glass-panel hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:flex"><Activity className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold text-foreground">{emails.length}</span><span className="text-muted-foreground">msgs</span></div>
            <ConnectionStatus status={status} />
            {/* Blocked senders button */}
            <button onClick={() => { loadBlocked(); setBlockedOpen(!blockedOpen); }} className={cn("glass-panel rounded-lg p-2 transition", blockedList.length > 0 ? "text-warning hover:bg-warning/10" : "text-muted-foreground hover:bg-white/5")} title="Blocked senders">
              <ShieldBan className="h-3.5 w-3.5" />
              {blockedList.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-warning text-[9px] font-bold text-black flex items-center justify-center">{blockedList.length}</span>}
            </button>
            <button onClick={reconnect} className="glass-panel rounded-lg p-2 transition hover:bg-white/5"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 glass-panel rounded-full px-4 py-2 text-xs font-medium text-foreground animate-slide-in">{toast}</div>
      )}

      <div className="mx-auto flex max-w-7xl gap-4 px-4 py-4 lg:px-6 lg:py-6">
        {/* Sidebar */}
        <div className="hidden lg:block"><div className="sticky top-20 h-[calc(100vh-6rem)]"><AccountSidebar accounts={ACCOUNTS} selected={selectedAcct} onSelect={setSelectedAcct} counts={counts} totalCount={emails.length} /></div></div>
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 p-4"><AccountSidebar accounts={ACCOUNTS} selected={selectedAcct} onSelect={a => { setSelectedAcct(a); setSidebarOpen(false); }} counts={counts} totalCount={emails.length} onClose={() => setSidebarOpen(false)} /></div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 space-y-3">
          {idle ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Mail className="mb-4 h-10 w-10 animate-pulse text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Connecting to monitor…</p>
              <div className="mt-4 flex gap-2">{[1,2,3].map(i => <EmailCardSkeleton key={i} />)}</div>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Mail className="mb-4 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">{isLive ? "Waiting for new emails…" : selectedAcct ? `No emails for ${selectedAcct}` : "No emails yet"}</p>
              <p className="mt-1 text-xs text-muted-foreground/60">{isLive ? `Live — monitoring ${ACCOUNTS.length} accounts` : "New emails appear in real-time"}</p>
              {isLive && <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground/50"><Clock className="h-3.5 w-3.5" />Server running — new emails appear within 8 seconds</div>}
            </div>
          ) : (
            <div className="space-y-3">{visible.map(e => <EmailCard key={e.id} email={e} fresh onClick={setDetailEmail} onBlock={blockSender} onDelete={deleteEmail} />)}</div>
          )}
        </main>
      </div>

      {/* Blocked Senders Panel */}
      {blockedOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-end pt-16 pr-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setBlockedOpen(false)} />
          <div className="glass-panel relative z-10 w-full max-w-xs rounded-2xl p-4 max-h-80 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldBan className="h-4 w-4 text-warning" />Blocked Senders</h3>
              <button onClick={() => setBlockedOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            {blockedList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No blocked senders</p>
            ) : (
              <div className="space-y-1">
                {blockedList.map(b => (
                  <div key={b.senderEmail} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                    <span className="truncate text-foreground/80">{b.senderEmail}</span>
                    <button onClick={() => unblockSender(b.senderEmail)} className="ml-2 shrink-0 rounded-md px-2 py-1 text-[10px] text-success hover:bg-success/10 transition-colors">Unblock</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {detailEmail && <EmailDetail email={detailEmail} onClose={() => setDetailEmail(null)} onBlock={blockSender} onDelete={deleteEmail} />}
    </div>
  );
}
