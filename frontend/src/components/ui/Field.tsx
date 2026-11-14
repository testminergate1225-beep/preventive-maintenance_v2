import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint shadow-[0_1px_0_rgba(15,23,42,.02)] transition " +
  "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...p }, ref) {
    return <input ref={ref} className={cn(control, "h-10", invalid && "border-danger focus:border-danger focus:ring-danger/15", className)} {...p} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...p }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-[84px] py-2.5 leading-relaxed", invalid && "border-danger", className)} {...p} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, children, invalid, ...p }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(control, "h-10 appearance-none pr-9", invalid && "border-danger", className)} {...p}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      </div>
    );
  },
);

export function Field({
  label, hint, error, children, className, htmlFor, required,
}: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string; required?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p key="e" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-medium text-danger">
            {error}
          </motion.p>
        ) : hint ? (
          <p className="text-xs text-faint">{hint}</p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Dropdown with a "Custom…" escape hatch that reveals a text input —
 * mirrors the original forms' "Custom Name" behaviour.
 */
export function ComboSelect({
  value, onChange, options, placeholder = "Select…", customLabel = "Custom…", id, invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
  customLabel?: string;
  id?: string;
  invalid?: boolean;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const known = opts.some((o) => o.value === value);
  const [custom, setCustom] = useState(!known && value !== "");
  const autoId = useId();
  return (
    <div className="flex flex-col gap-2">
      <Select
        id={id ?? autoId}
        invalid={invalid}
        value={custom ? "__custom__" : value}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {opts.map((o) => (
          <option key={o.value + o.label} value={o.value}>{o.label}</option>
        ))}
        <option value="__custom__">{customLabel}</option>
      </Select>
      <AnimatePresence initial={false}>
        {custom && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type a custom value" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink select-none", className)}>
      <span
        className={cn(
          "grid h-[18px] w-[18px] place-items-center rounded-md border transition",
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface",
        )}
      >
        <motion.svg viewBox="0 0 16 16" className="h-3 w-3" initial={false} animate={{ opacity: checked ? 1 : 0 }}>
          <motion.path d="M3.5 8.5l3 3 6-7" fill="none" stroke="var(--app-accent-ink)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
            initial={false} animate={{ pathLength: checked ? 1 : 0 }} transition={{ duration: 0.25 }} />
        </motion.svg>
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
