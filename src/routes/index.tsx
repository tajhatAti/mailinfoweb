import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Menu, RefreshCw, Activity, Mail } from "lucide-react";
import { ACCOUNTS } from "@/lib/accounts";
import { useEmailStream } from "@/hooks/use-email-stream";
import { ConnectionStatus } from "@/components/dashboard/ConnectionStatus";
import { AccountSidebar } from "@/components/dashboard/AccountSidebar";
import { EmailCard, EmailCardSkeleton } from "@/components/dashboard/EmailCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inbox Pulse — Real-time Email Monitoring" },
      {
        name: "description",
        content:
          "Real-time email monitoring dashboard streaming inbox activity across 30+ IMAP accounts over WebSockets.",
      },
      { property: "og:title", content: "Inbox Pulse — Real-time Email Monitoring" },
      {
        property: "og:description",
        content: "Live email stream, glass UI, account filters, and resilient WebSocket lifecycle.",
      },
    ],
  }),
  component: Dashboard,
});

// Configure your FastAPI WebSocket endpoint here or via VITE_EMAIL_WS_URL.
const WS_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_EMAIL_WS_URL ?? "";

function Dashboard() {
  const [selected, setSelected] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status, emails, usingMock, reconnect } = useEmailStream({
    url: WS_URL  undefined,
    accounts: ACCOUNTS,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of emails) c[e.account] = (c[e.account] ?? 0) + 1;
    return c;
  }, [emails]);

  const visible = useMemo(
    () => (selected ? emails.filter((e) => e.account === selected) : emails),
    [emails, selected],
  );

  const idle = emails.length === 0 && (status === "connecting"  status === "reconnecting");

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-background/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="glass-panel rounded-lg p-2 lg:hidden"
            aria-label="Open accounts"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
              <Mail className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-foreground">Inbox Pulse</h1>
              <p className="text-[11px] text-muted-foreground">Real-time email monitoring</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="glass-panel hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:flex">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">{emails.length}</span>
              <span className="text-muted-foreground">events</span>
            </div>
            <ConnectionStatus status={status} mock={usingMock} />
            <button
              onClick={reconnect}
              className="glass-panel rounded-lg p-2 transition hover:bg-white/5"
              aria-label="Reconnect"
              title="Reconnect"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-4 px-4 py-4 lg:px-6 lg:py-6">
        {/* Sidebar */}
        <div className="hidden lg:block">
          <div className="sticky top-20 h-[calc(100vh-6rem)]">
            <AccountSidebar
              accounts={ACCOUNTS}