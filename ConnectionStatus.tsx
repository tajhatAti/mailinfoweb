import type { ConnectionStatus as Status } from "@/lib/email-types";
import { cn } from "@/lib/utils";

const config: Record<Status, { label: string; dot: string; text: string; ring: boolean }> = {
  connected: { label: "Live", dot: "bg-success text-success", text: "text-success", ring: true },
  connecting: { label: "Connecting", dot: "bg-warning text-warning", text: "text-warning", ring: true },
  reconnecting: { label: "Reconnecting", dot: "bg-warning text-warning", text: "text-warning", ring: true },
  disconnected: { label: "Offline", dot: "bg-destructive text-destructive", text: "text-destructive", ring: false },
};

export function ConnectionStatus({ status, mock }: { status: Status; mock?: boolean }) {
  const c = config[status];
  return (
    <div className="glass-panel flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-xs font-medium">
      <span className="relative flex h-2 w-2">
        <span className={cn("h-2 w-2 rounded-full", c.dot.split(" ")[0])} />
        {c.ring && (
          <span
            className={cn(
              "absolute inset-0 h-2 w-2 rounded-full opacity-60 animate-ping",
              c.dot.split(" ")[0],
            )}
          />
        )}
      </span>
      <span className={c.text}>{c.label}</span>
      {mock && <span className="text-muted-foreground/70">· demo</span>}
    </div>
  );
}