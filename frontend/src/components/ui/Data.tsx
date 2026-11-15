import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { EmptyToolbox } from "@/components/graphics/Illustrations";
import { addDays, cn, todayISO } from "@/lib/utils";
import { Button } from "./Button";
import { Input, Select } from "./Field";

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span>
        Showing <b className="text-ink">{from}–{to}</b> of <b className="text-ink">{total}</b>
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
        <span className="px-2 tabular-nums">{page} / {pages}</span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action, art }: { title: string; message?: ReactNode; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
        {art ?? <EmptyToolbox className="h-28 w-28" />}
      </motion.div>
      <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Debounced search box. */
export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onChange(v), 300);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="pl-9 pr-8" />
      {v && (
        <button onClick={() => { setV(""); onChange(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export type DateRange = { from: string; to: string };

/** Date range with quick presets (matching the old records pages). */
export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const preset = (p: string) => {
    const today = todayISO();
    const now = new Date();
    if (p === "") return onChange({ from: "", to: "" });
    if (p === "thismonth") return onChange({ from: todayISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: today });
    if (p === "lastmonth")
      return onChange({ from: todayISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: todayISO(new Date(now.getFullYear(), now.getMonth(), 0)) });
    if (p === "thisyear") return onChange({ from: `${now.getFullYear()}-01-01`, to: today });
    onChange({ from: addDays(today, -Number(p)), to: today });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="w-[150px]" onChange={(e) => preset(e.target.value)} value="" aria-label="Quick date range">
        <option value="">Quick range…</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="thismonth">This month</option>
        <option value="lastmonth">Last month</option>
        <option value="thisyear">This year</option>
      </Select>
      <Input type="date" className="w-[150px]" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="From date" />
      <span className="text-faint">→</span>
      <Input type="date" className="w-[150px]" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="To date" />
      {(value.from || value.to) && (
        <Button size="sm" variant="ghost" onClick={() => onChange({ from: "", to: "" })} icon={<X className="h-3.5 w-3.5" />}>Clear</Button>
      )}
    </div>
  );
}

/** Table shell with consistent styling. */
export function Table({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-faint [&>th]:sticky [&>th]:top-0 [&>th]:border-b [&>th]:border-line [&>th]:bg-surface-2 [&>th]:px-4 [&>th]:py-2.5 [&>th]:whitespace-nowrap">
            {head}
          </tr>
        </thead>
        <tbody className="[&>tr>td]:border-b [&>tr>td]:border-line [&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr:last-child>td]:border-b-0">{children}</tbody>
      </table>
    </div>
  );
}

export const rowMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -12 },
};

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="h-4 flex-1 animate-pulse rounded bg-sunken" style={{ animationDelay: `${(r * cols + c) * 30}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Shown when a list fails to load — never pretend the list is empty. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const msg = error instanceof Error ? error.message : "The server returned an error.";
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-danger"><AlertTriangle className="h-7 w-7" /></div>
      <h3 className="mt-4 font-display text-lg font-semibold text-ink">Couldn't load this list</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{msg}</p>
      <p className="mt-1 max-w-md text-xs text-faint">If this keeps happening, check the backend console — the database may need <code>alembic upgrade head</code>.</p>
      <Button className="mt-5" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>Retry</Button>
    </div>
  );
}
