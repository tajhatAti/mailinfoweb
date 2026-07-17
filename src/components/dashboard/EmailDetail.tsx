import { useEffect, useRef, useState } from "react";
import type { EmailMessage } from "@/lib/email-types";
import { detectOTP } from "@/lib/otp-detector";
import { X, Mail, Copy, Check, Loader2, User, AtSign, Clock, Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  email: EmailMessage;
  onClose: () => void;
  onBlock?: (e: EmailMessage) => void;
  onDelete?: (e: EmailMessage) => void;
}

function formatFull(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function gravatarUrl(email: string, size = 44) {
  return `https://www.gravatar.com/avatar/${btoa(email.trim().toLowerCase())}?s=${size}&d=404&r=pg`;
}

function initials(name: string) {
  return name.replace(/["']/g, "").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join("") || "?";
}

export function EmailDetail({ email, onClose, onBlock, onDelete }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const otp = detectOTP((body ?? "") + " " + (email.preview ?? "") + " " + email.subject);

  useEffect(() => {
    if (!email.uid || body !== null) return;
    setLoading(true);
    fetch(`/api/email-body?account=${encodeURIComponent(email.account)}&uid=${encodeURIComponent(email.uid)}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setBody(d.body ?? "<p class='text-muted-foreground text-center py-8'>(empty message)</p>"))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [email.uid, email.account]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedLabel(label); setTimeout(() => setCopiedLabel(null), 1800); });
  };

  const handleBlock = () => { setBlocked(true); onBlock?.(email); setTimeout(onClose, 300); };
  const handleDelete = () => { setDeleted(true); onDelete?.(email); setTimeout(onClose, 300); };

  return (
    <div ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel relative w-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl shadow-black/40">

        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-start gap-3 min-w-0">
            {(!avatarErr && email.senderEmail) ? (
              <img src={gravatarUrl(email.senderEmail)} alt={email.sender} className="h-11 w-11 shrink-0 rounded-xl object-cover" onError={() => setAvatarErr(true)} />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/40 to-accent/30 text-sm font-bold text-foreground">{initials(email.sender) || <Mail className="h-5 w-5" />}</div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground truncate">{email.subject}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{email.sender}</span>
                {email.senderEmail && <span className="flex items-center gap-1"><AtSign className="h-3 w-3" />{email.senderEmail}</span>}
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatFull(email.timestamp)}</span>
              </div>
              <span className="mt-1.5 inline-block glass-panel rounded-full px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{email.account}</span>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {otp && (
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-2.5 bg-primary/5">
            <span className="text-[11px] font-medium text-muted-foreground">{otp.label}:</span>
            <code className="rounded-md bg-white/10 px-2.5 py-1 text-sm font-mono font-bold text-primary tracking-wider">{otp.value}</code>
            <button onClick={() => copy(otp.value, otp.label)} className={cn("ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-all", copiedLabel === otp.label ? "bg-success/20 text-success" : "bg-white/10 text-foreground/80 hover:bg-white/20")}>
              {copiedLabel === otp.label ? <><Check className="h-3 w-3" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
          : error ? <div className="text-center py-8 text-sm text-destructive">Failed: {error}</div>
          : body ? <div className="email-render [&_.email-body]:text-foreground/85" dangerouslySetInnerHTML={{ __html: body }} />
          : email.preview ? <p className="text-sm leading-relaxed text-foreground/70">{email.preview}</p>
          : <p className="text-sm text-muted-foreground text-center py-8">No content</p>}
        </div>

        <div className="border-t border-white/10 px-5 py-3 flex items-center gap-2">
          {email.senderEmail && (
            <button onClick={handleBlock} disabled={blocked} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
              <Ban className="h-3.5 w-3.5" />{blocked ? "Blocked" : "Block"}
            </button>
          )}
          <button onClick={handleDelete} disabled={deleted} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-white/5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors">
            <Trash2 className="h-3.5 w-3.5" />{deleted ? "Deleted" : "Delete"}
          </button>
          <span className="flex-1" />
          {email.senderEmail && (
            <a href={`mailto:${email.senderEmail}`} className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors">Reply</a>
          )}
          {otp && (
            <button onClick={() => copy(otp.value, `ftr-${otp.label}`)} className={cn("flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all", copiedLabel === `ftr-${otp.label}` ? "bg-success/20 text-success" : "bg-primary/15 text-primary hover:bg-primary/25")}>
              {copiedLabel === `ftr-${otp.label}` ? <><Check className="h-3 w-3" />Copied!</> : <><Copy className="h-3 w-3" />Copy {otp.value}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
