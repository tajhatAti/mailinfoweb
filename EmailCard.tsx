import type { EmailMessage } from "@/lib/email-types";
import { Mail } from "lucide-react";

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return ${Math.max(1, Math.floor(diff))}s ago;
  if (diff < 3600) return ${Math.floor(diff / 60)}m ago;
  if (diff < 86400) return ${Math.floor(diff / 3600)}h ago;
  return d.toLocaleDateString();
}

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function EmailCard({ email, fresh }: { email: EmailMessage; fresh?: boolean }) {
  return (
    <article
      className={glass-card group relative rounded-xl p-4 transition-all hover:border-primary/30 hover:bg-white/[0.04] ${
        fresh ? "animate-slide-in" : ""
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 text-xs font-semibold text-foreground">
          {initials(email.sender) || <Mail className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-semibold text-foreground">{email.sender}</p>
            <time className="shrink-0 text-[11px] font-medium text-muted-foreground">
              {formatTime(email.timestamp)}
            </time>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground/90">{email.subject}</p>
          {email.preview && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{email.preview}</p>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="glass-panel rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {email.account}
            </span>
            {email.senderEmail && (
              <span className="truncate text-[11px] text-muted-foreground/70">
                {email.senderEmail}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function EmailCardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}