import type { ConnectionStatus as Status } from "@/lib/email-types";
import { cn } from "@/lib/utils";

const cfg: Record<Status, { label: string; dot: string; text: string }> = {
  connected: { label: "Live", dot: "bg-success", text: "text-success" },
  connecting: { label: "Connecting", dot: "bg-warning", text: "text-warning" },
  reconnecting: { label: "Reconnecting", dot: "bg-warning", text: "text-warning" },
  disconnected: { label: "Offline", dot: "bg-destructive", text: "text-destructive" },
};

export function ConnectionStatus({ status }: { status: Status }) {
  const c = cfg[status];
  return (
    <div className="glass-panel flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
      <span className="relative flex h-2 w-2">
        <span className={cn("h-2 w-2 rounded-full", c.dot)} />
        {status !== "disconnected" && <span className={cn("absolute inset-0 h-2 w-2 rounded-full animate-ping opacity-60", c.dot)} />}
      </span>
      <span className={c.text}>{c.label}</span>
    </div>
  );
}
