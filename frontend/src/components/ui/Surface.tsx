import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import type { Tone } from "@/config/options";
import { cn, initials } from "@/lib/utils";

export function Card({ className, hover, children, ...rest }: HTMLMotionProps<"div"> & { hover?: boolean }) {
  return (
    <motion.div
      whileHover={hover ? { y: -3, boxShadow: "var(--app-shadow-lg)" } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ title, subtitle, icon, actions, className }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const toneClass: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-sunken text-muted",
};
const dotClass: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", info: "bg-info", neutral: "bg-faint" };

export function Badge({ tone = "neutral", children, dot, className, pulse }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", toneClass[tone], className)}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dotClass[tone])} />}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dotClass[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-[13px] font-bold text-amber-950", className)}>
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-sunken", className)} />;
}

export function PageHeader({ title, subtitle, icon, actions }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        {icon && (
          <motion.div
            initial={{ rotate: -20, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_10px_24px_-10px_rgba(245,158,11,.8)]"
          >
            {icon}
          </motion.div>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, layoutId }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; layoutId: string }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-sunken p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn("relative rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors", value === o.value ? "text-ink" : "text-muted hover:text-ink")}>
          {value === o.value && (
            <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
