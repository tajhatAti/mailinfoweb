import { useCallback, useState, memo } from "react";
import type { EmailMessage } from "@/lib/email-types";
import { detectOTP } from "@/lib/otp-detector";
import { Mail, Copy, Check, Maximize2, Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function initials(name: string) {
  return name.replace(/["']/g, "").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join("") || "?";
}

function gravatarUrl(email: string, size = 40) {
  return `https://www.gravatar.com/avatar/${btoa(email.trim().toLowerCase())}?s=${size}&d=404&r=pg`;
}

function Avatar({ email, sender, size = 40 }: { email: string; sender: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err || !email) {
    return <div className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 text-xs font-bold text-foreground" style={{ width: size, height: size }}>{initials(sender) || <Mail className="h-4 w-4" />}</div>;
  }
  return <img src={gravatarUrl(email, size)} alt={sender} className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} onError={() => setErr(true)} />;
}

export const EmailCard = memo(function EmailCard({
  email, fresh, onClick, onBlock, onDelete,
}: {
  email: EmailMessage; fresh?: boolean; onClick?: (e: EmailMessage) => void;
  onBlock?: (e: EmailMessage) => void; onDelete?: (e: EmailMessage) => void;
}) {
  const [copied, setCopied] = useState(false);
  const otp = detectOTP((email.preview ?? "") + " " + email.subject);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); if (!otp) return;
    navigator.clipboard.writeText(otp.value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }, [otp]);

  return (
    <article onClick={() => onClick?.(email)}
      className={cn("glass-card group relative cursor-pointer rounded-xl p-4 transition-all hover:border-primary/30 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99]", fresh && "animate-slide-in")}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(email); } }}
    >
      <div className="flex items-start gap-3">
        <Avatar email={email.senderEmail ?? ""} sender={email.sender} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-semibold text-foreground">{email.sender}</p>
            <time className="shrink-0 text-[11px] font-medium text-muted-foreground">{formatTime(email.timestamp)}</time>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground/90">{email.subject}</p>
          {email.preview && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{email.preview}</p>}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="glass-panel rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{email.account}</span>
            {otp && (
              <button onClick={handleCopy} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all", copied ? "bg-success/20 text-success" : "bg-primary/20 text-primary hover:bg-primary/30")}>
                {copied ? <><Check className="h-3 w-3" />Copied!</> : <><Copy className="h-3 w-3" />{otp.label}: {otp.value}</>}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Action buttons — always visible at bottom-right */}
      <div className="mt-2 flex items-center gap-1 border-t border-white/5 pt-2">
        {email.senderEmail && (
          <button onClick={e => { e.stopPropagation(); onBlock?.(email); }} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors" title="Block">
            <Ban className="h-3 w-3" />Block
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onDelete?.(email); }} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors" title="Delete">
          <Trash2 className="h-3 w-3" />Delete
        </button>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/50"><Maximize2 className="h-3 w-3" />Open</span>
      </div>
    </article>
  );
});

export function EmailCardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-white/5" />
        <div className="flex-1 space-y-2"><div className="h-3 w-1/3 animate-pulse rounded bg-white/5" /><div className="h-3 w-2/3 animate-pulse rounded bg-white/5" /><div className="h-2.5 w-1/2 animate-pulse rounded bg-white/5" /></div>
      </div>
    </div>
  );
}
