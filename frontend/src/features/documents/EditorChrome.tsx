import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Card } from "@/components/ui/Surface";
import { cn } from "@/lib/utils";

export function EditorHeader({ back, backLabel, title, subtitle, icon, actions, badge }: {
  back: string; backLabel: string; title: ReactNode; subtitle?: ReactNode; icon: ReactNode; actions: ReactNode; badge?: ReactNode;
}) {
  return (
    <div className="sticky top-16 z-10 -mx-4 mb-6 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={back} className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label={backLabel}><ArrowLeft className="h-5 w-5" /></Link>
          <motion.div initial={{ scale: 0.6, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950">{icon}</motion.div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h1 className="truncate font-display text-lg font-bold text-ink sm:text-xl">{title}</h1>{badge}</div>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function Section({ title, icon, children, className, actions, delay = 0 }: { title: string; icon?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; delay?: number }) {
  return (
    <Card initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, type: "spring", stiffness: 240, damping: 26 }} className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-5 py-3">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-ink">{icon && <span className="text-accent-strong">{icon}</span>}{title}</div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

/**
 * Makes everything inside read-only when `locked` (archived records): a disabled fieldset
 * natively disables every input, select, textarea and button it contains.
 */
export function Locked({ locked, children, className }: { locked: boolean; children: ReactNode; className?: string }) {
  return (
    <fieldset disabled={locked} aria-readonly={locked || undefined} className={cn("m-0 min-w-0 border-0 p-0", locked && "[&_input]:cursor-default [&_select]:cursor-default [&_textarea]:cursor-default", className)}>
      {children}
    </fieldset>
  );
}

/** Small read-only metric used in summaries. */
export function Metric({ label, value, tone, className }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "danger"; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface-2 px-3.5 py-2.5", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className={cn("mt-0.5 font-display text-lg font-bold tabular-nums", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink")}>{value}</div>
    </div>
  );
}
