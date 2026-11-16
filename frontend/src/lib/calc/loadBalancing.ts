/**
 * Load balancing & full-load-test calculations, ported from the original
 * load_balancing_form.php so results match previously printed reports.
 */
import { THREE_PHASE, type CircuitType, type LoadItem } from "@/types";

export function phaseOptions(ct: CircuitType): string[] {
  switch (ct) {
    case "single_ln": return ["L1_N"];
    case "single_llc": return ["L12"];
    case "single_ll": return ["L1", "L2"];
    case "three_wye": return ["AN", "BN", "CN", "N"];
    case "three_delta": return ["AB", "BC", "CA"];
  }
}

/** Three-phase loads are only possible on three-phase systems. */
export const supportsThreePhaseLoads = (ct: CircuitType) => ct === "three_wye" || ct === "three_delta";

export const isThreePhaseLoad = (l: LoadItem) => l.phase === THREE_PHASE;

/** Labels for the three currents of a three-phase load (match the printed line-current columns). */
export function threePhaseLabels(ct: CircuitType): [string, string, string] {
  return ct === "three_delta" ? ["L1-L2", "L1-L3", "L2-L3"] : ["A (L1)", "B (L2)", "C (L3)"];
}

/** The three currents of a load, as [i1, i2, i3]. */
export const lineCurrents = (l: LoadItem): [number, number, number] => [Number(l.ia) || 0, Number(l.ib) || 0, Number(l.ic) || 0];

/** Summary buckets that a three-phase load's i1, i2, i3 add into. Delta follows the print columns: L1-L2=AB, L1-L3=CA, L2-L3=BC. */
const THREE_PHASE_KEYS: Partial<Record<CircuitType, [string, string, string]>> = { three_wye: ["AN", "BN", "CN"], three_delta: ["AB", "CA", "BC"] };

/** Which system-voltage inputs are relevant for a configuration. */
export function voltageRules(ct: CircuitType) {
  return {
    vLl: ct === "single_llc" || ct === "three_wye" || ct === "three_delta",
    vLn: ct === "single_ln" || ct === "three_wye",
    vPh: ct === "single_ll",
    perLineLL: ct === "three_wye" || ct === "three_delta",
    perLineLN: ct === "three_wye",
  };
}

export function phaseLabels(ct: CircuitType): [string, string, string] {
  return ct === "three_delta" ? ["L1L2", "L1L3", "L2L3"] : ["A", "B", "C"];
}

const SUMMARY_KEYS: Partial<Record<CircuitType, string[]>> = {
  three_wye: ["AN", "BN", "CN", "N"],
  three_delta: ["AB", "BC", "CA"],
  single_ll: ["L1", "L2"],
};

export interface Suggestion {
  name: string;
  value: number;
  from: string;
  to: string;
}

export interface Summary {
  totals: Record<string, number>;
  a: number;
  b: number;
  c: number;
  total: number;
  average: number;
  imbalancePct: number;
  suggestions: Suggestion[];
}

export function computeSummary(ct: CircuitType, loads: LoadItem[]): Summary {
  const totals: Record<string, number> = {};
  for (const k of SUMMARY_KEYS[ct] ?? ["L1"]) totals[k] = 0;
  for (const l of loads) {
    const keys3 = THREE_PHASE_KEYS[ct];
    if (isThreePhaseLoad(l) && keys3) {
      lineCurrents(l).forEach((i, n) => (totals[keys3[n]] = (totals[keys3[n]] ?? 0) + i));
    } else {
      totals[l.phase] = (totals[l.phase] ?? 0) + Number(l.value);
    }
  }

  const values = Object.values(totals);
  const [a = 0, b = 0, c = 0] = values;
  // Total keeps the measured neutral (as on the printed form)…
  const total = values.reduce((s, v) => s + v, 0);
  // …but balance statistics and suggestions only consider real phase buckets:
  // the neutral is not a phase you can load or move circuits onto.
  const keys = Object.keys(totals).filter((k) => k !== "N");
  const phaseValues = keys.map((k) => totals[k]);
  const average = phaseValues.reduce((s, v) => s + v, 0) / Math.max(3, keys.length);
  const maxDev = Math.max(...phaseValues.map((v) => Math.abs(v - average)));
  const imbalancePct = average > 0 ? (maxDev / average) * 100 : 0;

  // Greedy suggestions: move single loads from the heaviest to the lightest phase while it narrows the spread.
  const suggestions: Suggestion[] = [];
  const ordered = keys.map((p) => ({ p, v: totals[p] })).sort((x, y) => y.v - x.v);
  if (ordered.length >= 2) {
    const heavy = ordered[0].p;
    const light = ordered[ordered.length - 1].p;
    const candidates = loads.filter((l) => l.phase === heavy).sort((x, y) => y.value - x.value);
    let cur: Record<string, number> = Object.fromEntries(keys.map((k) => [k, totals[k]]));
    for (const cand of candidates) {
      const next = { ...cur, [heavy]: cur[heavy] - cand.value, [light]: cur[light] + cand.value };
      const range = (o: Record<string, number>) => Math.max(...Object.values(o)) - Math.min(...Object.values(o));
      if (range(next) < range(cur)) {
        suggestions.push({ name: cand.name, value: cand.value, from: heavy, to: light });
        cur = next;
      }
      if (suggestions.length >= 5) break;
    }
  }
  return { totals, a, b, c, total, average, imbalancePct, suggestions };
}

function kvaVoltage(ct: CircuitType, vLl: number | null, vLn: number | null, vPh: number | null): number {
  if (ct === "single_ln") return vLn ?? 0;
  if (ct === "single_ll") return vPh ?? 0;
  return vLl ?? 0; // single_llc
}

/** Single-phase kVA: V × I / 1000 (wye and delta are handled per line in loadKva). */
export function rowKva(amps: number, ct: CircuitType, vLl: number | null, vLn: number | null, vPh: number | null): number | null {
  const v = kvaVoltage(ct, vLl, vLn, vPh);
  if (!amps || !v) return null;
  return (v * amps) / 1000;
}

/** Per-line L-N voltage if entered, otherwise the system V(L-N). */
const lnVoltage = (perLine: number | null, main: number | null) => (perLine && perLine > 0 ? perLine : main) || null;

/** Delta phase pair → its own L-L voltage (AB = L1-L2, CA = L1-L3, BC = L2-L3), falling back to V(L-L). */
function deltaVoltage(pair: string, v: Voltages): number | null {
  const perPair = pair === "AB" ? v.vL1l2 : pair === "CA" ? v.vL1l3 : pair === "BC" ? v.vL2l3 : undefined;
  return perPair === undefined ? null : lnVoltage(perPair, v.vLl);
}

/**
 * kVA of one circuit load.
 * Three-phase Wye: each phase load uses its own line-to-neutral voltage —
 *   AN: I × V(L1-N) / 1000,  BN: I × V(L2-N) / 1000,  CN: I × V(L3-N) / 1000.
 *   The neutral current is not a load, so it has no kVA.
 * Three-phase Delta: each phase-pair current × its own line-to-line voltage —
 *   (I L1-L2 × V L1-L2 + I L1-L3 × V L1-L3 + I L2-L3 × V L2-L3) / 1000.
 * Single phase: V × I / 1000.
 */
export function loadKva(load: LoadItem, ct: CircuitType, v: Voltages): number | null {
  if (isThreePhaseLoad(load)) {
    const [i1, i2, i3] = lineCurrents(load);
    if (ct === "three_wye") {
      // Each line current × its own L-N voltage.
      const t = i1 * (lnVoltage(v.vL1n, v.vLn) ?? 0) + i2 * (lnVoltage(v.vL2n, v.vLn) ?? 0) + i3 * (lnVoltage(v.vL3n, v.vLn) ?? 0);
      return t > 0 ? t / 1000 : null;
    }
    if (ct === "three_delta") {
      // (I L1-L2 × V L1-L2 + I L1-L3 × V L1-L3 + I L2-L3 × V L2-L3) / 1000
      const t = i1 * (deltaVoltage("AB", v) ?? 0) + i2 * (deltaVoltage("CA", v) ?? 0) + i3 * (deltaVoltage("BC", v) ?? 0);
      return t > 0 ? t / 1000 : null;
    }
    return null;
  }
  const amps = Number(load.value) || 0;
  if (!amps) return null;
  if (ct === "three_delta") {
    const volts = deltaVoltage(String(load.phase ?? "").toUpperCase().replace(/\s+/g, ""), v);
    return volts ? (amps * volts) / 1000 : null;
  }
  if (ct === "three_wye") {
    const ph = String(load.phase ?? "").toUpperCase().replace(/\s+/g, "");
    const volts = ph === "AN" ? lnVoltage(v.vL1n, v.vLn) : ph === "BN" ? lnVoltage(v.vL2n, v.vLn) : ph === "CN" ? lnVoltage(v.vL3n, v.vLn) : null;
    return volts ? (amps * volts) / 1000 : null;
  }
  return rowKva(amps, ct, v.vLl, v.vLn, v.vPh);
}

/** Sum of the per-load kVA (rounded to 3 dp), or null when nothing can be computed. */
export function kvaTotal(ct: CircuitType, loads: LoadItem[], v: Voltages): number | null {
  const total = loads.reduce((s, l) => s + (loadKva(l, ct, v) ?? 0), 0);
  return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

export interface FullLoadInput {
  nameplateKw: number | null;
  van: number | null;
  vbn: number | null;
  vcn: number | null;
  ia: number | null;
  ib: number | null;
  ic: number | null;
  pfA: number | null;
  pfB: number | null;
  pfC: number | null;
}

export function fullLoadTest(ct: CircuitType, i: FullLoadInput) {
  const z = (v: number | null) => v ?? 0;
  const pf = (v: number | null) => v || 1;
  const [van, vbn, vcn, ia, ib, ic] = [z(i.van), z(i.vbn), z(i.vcn), z(i.ia), z(i.ib), z(i.ic)];
  const [pfa, pfb, pfc] = [pf(i.pfA), pf(i.pfB), pf(i.pfC)];
  let pa = 0, pb = 0, pc = 0;
  if (ct === "three_wye") {
    pa = (van * ia * pfa) / 1000;
    pb = (vbn * ib * pfb) / 1000;
    pc = (vcn * ic * pfc) / 1000;
  } else if (ct === "three_delta" || ct === "single_ll") {
    const vll = Math.max(van, vbn, vcn);
    // P ≈ √3 · V_LL · I_line · PF, split across phases in proportion to current.
    // (The original page referenced the non-existent Math.SQRT3 and showed NaN here.)
    const total = (Math.sqrt(3) * vll * Math.max(ia, ib, ic) * ((pfa + pfb + pfc) / 3)) / 1000;
    const sumI = ia + ib + ic || 1;
    pa = total * (ia / sumI);
    pb = total * (ib / sumI);
    pc = total * (ic / sumI);
  } else {
    pa = (van * ia * pfa) / 1000; // single phase: measured on L1 only
  }
  const total = pa + pb + pc;
  const pct = i.nameplateKw && i.nameplateKw > 0 ? (total / i.nameplateKw) * 100 : 0;
  return { pa, pb, pc, total, pct };
}

// ───────────────────────── Printable report rows ─────────────────────────

export interface Voltages {
  vLl: number | null;
  vLn: number | null;
  vPh: number | null;
  vL1l2: number | null;
  vL1l3: number | null;
  vL2l3: number | null;
  vL1n: number | null;
  vL2n: number | null;
  vL3n: number | null;
}

export interface PrintRow {
  description: string;
  l1: number | null;
  l2: number | null;
  l3: number | null;
  n: number | null;
  vL1L2: number | null;
  vL1L3: number | null;
  vL2L3: number | null;
  vL1N: number | null;
  vL2N: number | null;
  vL3N: number | null;
  kva: number | null;
  remark: string;
}

export function printReport(ct: CircuitType, loads: LoadItem[], v: Voltages) {
  const amp = (x: number) => (x > 0 ? x : null);
  const resolve = (ind: number | null, main: number | null) => (ind && ind > 0 ? ind : main) || null;
  const rules = voltageRules(ct);
  // Only voltages relevant to the configuration are printed.
  const vLl = rules.vLl ? v.vLl : null;
  const vLn = rules.vLn ? v.vLn : null;
  const vPh = rules.vPh ? v.vPh : null;

  // Most recently added load first, as on the original printed form.
  const rows: PrintRow[] = [...loads].reverse().map((load) => {
    const ph = String(load.phase ?? "").toUpperCase().replace(/\s+/g, "");
    let l1: number | null = null, l2: number | null = null, l3: number | null = null, n: number | null = null;
    if (isThreePhaseLoad(load)) {
      [l1, l2, l3] = lineCurrents(load).map(amp) as [number | null, number | null, number | null];
    } else if (ct === "three_delta") {
      if (ph === "AB" || ph === "BA") l1 = amp(load.value);
      else if (ph === "CA" || ph === "AC") l2 = amp(load.value);
      else if (ph === "BC" || ph === "CB") l3 = amp(load.value);
    } else {
      if (ph.includes("A") || ph.includes("L1")) l1 = amp(load.value);
      if (ph.includes("B") || ph.includes("L2")) l2 = amp(load.value);
      if (ph.includes("C") || ph.includes("L3") || ph.includes("3")) l3 = amp(load.value);
      // Only a true neutral reading goes in N (AN/BN/CN and L1_N are phase loads).
      if (ph === "N") n = amp(load.value);
    }
    const hasCurrent = Boolean(l1 || l2 || l3);
    const row: PrintRow = {
      description: isThreePhaseLoad(load) ? `${load.name} (3Φ)` : load.name, l1, l2, l3, n,
      vL1L2: null, vL1L3: null, vL2L3: null, vL1N: null, vL2N: null, vL3N: null,
      kva: loadKva(load, ct, { ...v, vLl, vLn, vPh }), remark: "",
    };
    if (hasCurrent) {
      if (ct === "three_wye" || ct === "three_delta") {
        row.vL1L2 = resolve(v.vL1l2, vLl);
        row.vL1L3 = resolve(v.vL1l3, vLl);
        row.vL2L3 = resolve(v.vL2l3, vLl);
      } else if (ct === "single_llc" || ct === "single_ll") {
        row.vL1L2 = vLl;
      }
      if (ct === "single_ln") row.vL1N = vLn;
      else if (ct === "single_ll") row.vL1N = row.vL2N = vPh;
      else if (ct === "three_wye") {
        row.vL1N = resolve(v.vL1n, vLn);
        row.vL2N = resolve(v.vL2n, vLn);
        row.vL3N = resolve(v.vL3n, vLn);
      }
    }
    return row;
  });

  const sum = (k: "l1" | "l2" | "l3" | "n") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  const totL1 = sum("l1"), totL2 = sum("l2"), totL3 = sum("l3"), totN = sum("n");

  let neutral = totN.toFixed(2);
  let neutralMagnitude = totN;
  let verdict = "";
  if (ct === "three_wye") {
    // Vector sum of phase currents at 0°, 120°, -120°.
    const rad = Math.PI / 180;
    const re = totL1 + totL2 * Math.cos(120 * rad) + totL3 * Math.cos(-120 * rad);
    const im = totL2 * Math.sin(120 * rad) + totL3 * Math.sin(-120 * rad);
    neutralMagnitude = Math.hypot(re, im);
    neutral = `${neutralMagnitude.toFixed(2)}∠${((Math.atan2(im, re) * 180) / Math.PI).toFixed(1)}°`;
    verdict = neutralMagnitude > (totL1 + totL2 + totL3) / 3 ? "Unbalanced Circuit" : "Balanced";
    for (const r of rows) {
      if (r.description === "Neutral Current" && r.n && r.n > neutralMagnitude) r.remark = "Suspected Harmonics";
    }
  } else if (ct === "three_delta") {
    const avg = (totL1 + totL2 + totL3) / 3;
    const limit = avg * 0.2;
    verdict = [totL1, totL2, totL3].some((t) => Math.abs(t - avg) > limit) ? "Unbalanced" : "Balanced";
  }

  const totKva = rows.reduce((s, r) => s + (r.kva ?? 0), 0);
  const lineLabels = ct === "three_delta" ? ["L1L2", "L1L3", "L2L3"] : ct === "single_llc" ? ["L1L2", "L2", "L3", "N"] : ["L1", "L2", "L3", "N"];
  return { rows, totL1, totL2, totL3, neutral, neutralMagnitude, verdict, totKva, lineLabels, showNeutral: ct !== "three_delta" };
}
