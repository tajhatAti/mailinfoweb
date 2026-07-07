import { useMemo, useState } from "react";
import { Search, Inbox, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  accounts: string[];
  selected: string | null;
  onSelect: (a: string | null) => void;
  counts: Record<string, number>;
  totalCount: number;
  onClose?: () => void;
}

export function AccountSidebar({
  accounts, selected, onSelect, counts, totalCount, onClose,
}: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => accounts.filter((a) => a.toLowerCase().includes(q.toLowerCase())),
    [accounts, q],
  );

  return (
    <aside className="glass-panel flex h-full w-full flex-col rounded-2xl p-4 lg:w-72">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
          <p className="text-[11px] text-muted-foreground">{accounts.length} monitored</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search accounts"
          className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      <button
        onClick={() => onSelect(null)}
        className={cn(
          "mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
          selected === null
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        )}
      >
        <span className="flex items-center gap-2">
          <Inbox className="h-3.5 w-3.5" />
          All accounts
        </span>
        <span className="text-[10px] text-muted-foreground">{totalCount}</span>
      </button>

      <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {filtered.map((a) => {
          const active = selected === a;
          const count = counts[a] ?? 0;
          return (
            <button
              key={a}
              onClick={() => onSelect(a)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    active ? "bg-primary" : "bg-white/20",
                  )}
                />
                <span className="truncate">{a}</span>
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    active ? "bg-primary/25 text-foreground" : "bg-white/5 text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matches</p>
        )}
      </div>
    </aside>
  );
}