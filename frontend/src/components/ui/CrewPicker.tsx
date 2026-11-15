import { Check, Plus, UserPlus, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { INDIVIDUALS, MAX_CREW } from "@/config/options";
import { canonicalKey, displayName, joinCrew, splitCrew } from "@/lib/calc/performers";
import { cn, initials } from "@/lib/utils";
import { Input } from "./Field";

/**
 * Pick the crew who performed the work: 1 to MAX_CREW technicians.
 * Value is stored as "Name A / Name B / Name C" (same format as before, so
 * existing records and the Performance page keep working).
 */
export function CrewPicker({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const crew = splitCrew(value);
  const keys = new Set(crew.map(canonicalKey));
  const full = crew.length >= MAX_CREW;
  const [other, setOther] = useState("");

  const toggle = (name: string) => {
    const k = canonicalKey(name);
    if (keys.has(k)) onChange(joinCrew(crew.filter((n) => canonicalKey(n) !== k)));
    else if (!full) onChange(joinCrew([...crew, displayName(name)]));
  };
  const addOther = () => {
    const name = other.trim().replace(/\s*\/\s*/g, " ");
    if (!name || full) return;
    if (!keys.has(canonicalKey(name))) onChange(joinCrew([...crew, displayName(name)]));
    setOther("");
  };
  const customs = crew.filter((n) => !INDIVIDUALS.some((i) => canonicalKey(i) === canonicalKey(n)));

  return (
    <div id={id} className="rounded-xl border border-line bg-surface p-3">
      {/* Selected crew */}
      <div className="flex min-h-[34px] flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false}>
          {crew.length === 0 && (
            <motion.span key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-sm text-faint">
              <Users className="h-4 w-4" /> Select up to {MAX_CREW} technicians
            </motion.span>
          )}
          {crew.map((name, i) => (
            <motion.span key={canonicalKey(name)} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-1 pr-2 text-[13px] font-semibold text-ink ring-1 ring-accent/30">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-ink" title={i === 0 ? "Lead" : undefined}>{initials(name)}</span>
              {name}
              <button type="button" onClick={() => toggle(name)} className="rounded-full p-0.5 text-muted hover:bg-black/10 hover:text-ink" aria-label={`Remove ${name}`}>
                <X className="h-3 w-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <span className={cn("ml-auto text-[11px] font-semibold tabular-nums", full ? "text-accent-strong" : "text-faint")}>{crew.length}/{MAX_CREW}</span>
      </div>

      {/* Technicians */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
        {INDIVIDUALS.map((name) => {
          const on = keys.has(canonicalKey(name));
          const disabled = !on && full;
          return (
            <motion.button key={name} type="button" whileTap={disabled ? undefined : { scale: 0.95 }} onClick={() => toggle(name)} disabled={disabled}
              aria-pressed={on}
              className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                on ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
                disabled && "cursor-not-allowed opacity-40")}>
              {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{name}
            </motion.button>
          );
        })}
        {customs.length > 0 && customs.map((name) => (
          <span key={name} className="inline-flex items-center gap-1 rounded-lg border border-accent bg-accent px-2.5 py-1 text-[12.5px] font-medium text-accent-ink">
            <Check className="h-3.5 w-3.5" />{name}
          </span>
        ))}
      </div>

      {/* Someone not in the list */}
      <div className="mt-2 flex gap-2">
        <Input className="h-8 text-[13px]" value={other} disabled={full} placeholder={full ? `Crew is full (${MAX_CREW})` : "Other name…"}
          onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }} />
        <button type="button" onClick={addOther} disabled={full || !other.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-[12.5px] font-semibold text-muted hover:text-ink disabled:opacity-40">
          <UserPlus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}
