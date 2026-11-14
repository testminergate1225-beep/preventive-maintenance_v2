import { motion } from "motion/react";
import { Gear } from "./Gear";

/** Open toolbox with tools — empty states. */
export function EmptyToolbox({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden>
      <ellipse cx="80" cy="128" rx="58" ry="7" fill="var(--app-sunken)" />
      {/* wrench */}
      <motion.g initial={{ rotate: -8 }} animate={{ rotate: [-8, 4, -8] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} style={{ originX: "70px", originY: "70px" }}>
        <path d="M58 30c-7 0-12 6-11 13l2 1 5-5 6 2 2 6-5 5 1 2c7 1 13-4 13-11 0-1 0-3-1-4l21 21 5-5-21-21c-2-1-4-1-6-1z" fill="#94a3b8" />
      </motion.g>
      {/* screwdriver */}
      <motion.g animate={{ y: [0, -3, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}>
        <rect x="98" y="22" width="9" height="30" rx="3" fill="var(--app-accent)" transform="rotate(18 102 37)" />
        <rect x="100.5" y="50" width="4" height="24" rx="1.5" fill="#cbd5e1" transform="rotate(18 102 37)" />
      </motion.g>
      {/* box */}
      <path d="M30 70h100l-6 52a6 6 0 0 1-6 5H42a6 6 0 0 1-6-5z" fill="#334155" />
      <rect x="26" y="62" width="108" height="16" rx="4" fill="#475569" />
      <rect x="66" y="56" width="28" height="10" rx="3" fill="none" stroke="#64748b" strokeWidth="4" />
      <rect x="70" y="86" width="20" height="10" rx="2" fill="var(--app-accent)" />
      <path d="M36 100h88" stroke="#1e293b" strokeWidth="2" opacity=".6" />
    </svg>
  );
}

/** Clipboard with checklist items ticking off one by one. */
export function ChecklistBoard({ className, items = 4 }: { className?: string; items?: number }) {
  return (
    <svg viewBox="0 0 120 150" className={className} aria-hidden>
      <rect x="10" y="14" width="100" height="130" rx="10" fill="var(--app-surface)" stroke="var(--app-border-strong)" strokeWidth="2" />
      <rect x="38" y="6" width="44" height="18" rx="5" fill="#475569" />
      {Array.from({ length: items }).map((_, i) => {
        const y = 42 + i * 24;
        return (
          <g key={i}>
            <rect x="22" y={y - 8} width="16" height="16" rx="4" fill="var(--app-sunken)" stroke="var(--app-border-strong)" />
            <motion.path
              d={`M25 ${y} l4 4 l7 -9`}
              fill="none" stroke="var(--app-ok)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1, 0] }}
              transition={{ duration: 4.8, times: [0, 0.15, 0.85, 1], repeat: Infinity, delay: i * 0.6 }}
            />
            <rect x="46" y={y - 4} width={52 - (i % 2) * 14} height="8" rx="4" fill="var(--app-border)" />
          </g>
        );
      })}
    </svg>
  );
}

/** Analogue meter with a sweeping needle (voltage / load gauge). */
export function Meter({ className, label = "kVA" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden>
      <path d="M12 70a48 48 0 0 1 96 0" fill="none" stroke="var(--app-border)" strokeWidth="10" strokeLinecap="round" />
      <path d="M12 70a48 48 0 0 1 62-46" fill="none" stroke="var(--app-ok)" strokeWidth="10" strokeLinecap="round" />
      <path d="M74 24a48 48 0 0 1 22 18" fill="none" stroke="var(--app-accent)" strokeWidth="10" strokeLinecap="round" />
      <path d="M96 42a48 48 0 0 1 12 28" fill="none" stroke="var(--app-danger)" strokeWidth="10" strokeLinecap="round" />
      <motion.g style={{ originX: "60px", originY: "70px" }} animate={{ rotate: [-62, 28, -10, 48, -62] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
        <line x1="60" y1="70" x2="60" y2="30" stroke="var(--app-text)" strokeWidth="3" strokeLinecap="round" />
      </motion.g>
      <circle cx="60" cy="70" r="6" fill="var(--app-text)" />
      <text x="60" y="58" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--app-muted)">{label}</text>
    </svg>
  );
}

/** Hero scene for the auth screens: blueprint, meshing gears, panel board with status lights, gauge and checklist. */
export function MaintenanceScene() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="blueprint absolute inset-0 opacity-70" />
      <motion.div className="absolute -left-16 -top-16 text-slate-700/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Gear size={260} teeth={18} duration={40} color="rgba(148,163,184,.14)" />
      </motion.div>
      <div className="absolute -bottom-24 -right-20">
        <Gear size={340} teeth={22} duration={55} reverse color="rgba(148,163,184,.10)" />
      </div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-8 p-10">
        <div className="relative h-[230px] w-[340px]">
          {/* Panel board */}
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 120 }}
            className="absolute left-0 top-6 h-[190px] w-[150px] rounded-2xl border border-slate-600/60 bg-gradient-to-b from-slate-800 to-slate-900 p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-bold tracking-widest text-slate-400">PANEL LP-1</span>
              <span className="hazard h-2 w-8 rounded-sm" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-md bg-slate-950/60 px-1.5 py-1">
                  <motion.span className="h-2 w-2 rounded-full" style={{ background: i === 5 ? "#f59e0b" : "#34d399" }}
                    animate={{ opacity: i === 5 ? [1, 0.25, 1] : [1, 0.75, 1] }} transition={{ duration: i === 5 ? 0.9 : 2.4, repeat: Infinity, delay: i * 0.15 }} />
                  <span className="h-1.5 flex-1 rounded bg-slate-700" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="h-10 flex-1 origin-bottom rounded bg-gradient-to-t from-amber-500 to-amber-300"
                  animate={{ scaleY: [0.5, 0.9, 0.65, 0.8, 0.5] }} transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut" }} />
              ))}
            </div>
          </motion.div>

          {/* Gauge */}
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35, type: "spring", stiffness: 120 }}
            className="absolute right-0 top-0 w-[170px] rounded-2xl border border-slate-600/60 bg-slate-900/90 p-3 shadow-2xl">
            <Meter className="w-full" label="LOAD" />
            <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-400"><span>Phase balance</span><span className="text-emerald-400">OK</span></div>
          </motion.div>

          {/* Checklist */}
          <motion.div initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.55, type: "spring", stiffness: 120 }}
            className="absolute bottom-0 right-6 w-[120px] rotate-3">
            <ChecklistBoard className="w-full drop-shadow-2xl" />
          </motion.div>

          {/* Spinning gears */}
          <div className="absolute bottom-2 left-[138px] flex items-end">
            <Gear size={58} teeth={11} duration={8} color="#f59e0b" />
            <Gear size={38} teeth={8} duration={5.4} reverse color="#cbd5e1" className="-ml-2 mb-6" />
          </div>
        </div>

        <div className="max-w-sm text-center">
          <h2 className="font-display text-2xl font-bold text-white">Keep every circuit in check.</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Preventive maintenance records, load balancing, insulation tests and checklists — in one place, owned by your team.
          </p>
        </div>
      </div>
    </div>
  );
}
