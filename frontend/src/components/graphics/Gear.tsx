import { motion } from "motion/react";

/** SVG path for a gear with trapezoidal teeth and a centre hole (even-odd fill). */
export function gearPath(teeth: number, outer: number, inner: number, hole: number): string {
  const step = (Math.PI * 2) / teeth;
  const pt = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  let d = "";
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    d += `${i === 0 ? "M" : "L"}${pt(inner, a)} L${pt(outer, a + step * 0.18)} L${pt(outer, a + step * 0.48)} L${pt(inner, a + step * 0.66)} `;
  }
  d += "Z ";
  d += `M${hole},0 A${hole},${hole} 0 1,0 ${-hole},0 A${hole},${hole} 0 1,0 ${hole},0 Z`;
  return d;
}

export function Gear({
  teeth = 12, size = 100, color = "currentColor", duration = 12, reverse = false, className, spokes = true,
}: { teeth?: number; size?: number; color?: string; duration?: number; reverse?: boolean; className?: string; spokes?: boolean }) {
  const r = size / 2;
  return (
    <svg viewBox={`${-r} ${-r} ${size} ${size}`} width={size} height={size} className={className} aria-hidden>
      <motion.g animate={{ rotate: reverse ? -360 : 360 }} transition={{ duration, ease: "linear", repeat: Infinity }}>
        <path d={gearPath(teeth, r, r * 0.8, r * 0.26)} fill={color} fillRule="evenodd" />
        {spokes && (
          <g stroke={color} strokeWidth={r * 0.1} strokeLinecap="round" opacity={0.55}>
            {[0, 60, 120].map((deg) => (
              <line key={deg} x1={0} y1={-r * 0.62} x2={0} y2={r * 0.62} transform={`rotate(${deg})`} />
            ))}
          </g>
        )}
      </motion.g>
    </svg>
  );
}

/** Three meshing gears — used for the brand mark and loaders. */
export function GearCluster({ size = 40, className, speed = 1 }: { size?: number; className?: string; speed?: number }) {
  const d = 10 / speed;
  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }} aria-hidden>
      <Gear size={size * 0.68} teeth={10} duration={d} color="var(--app-accent)" className="absolute left-0 top-0" spokes={false} />
      <Gear size={size * 0.46} teeth={8} duration={d * 0.68} reverse color="#94a3b8" className="absolute bottom-0 right-0" spokes={false} />
    </div>
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted">
      <GearCluster size={56} speed={1.6} />
      <span className="text-sm">{label}</span>
    </div>
  );
}
