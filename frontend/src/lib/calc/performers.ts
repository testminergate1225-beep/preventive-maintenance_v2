/**
 * "Performed by" holds a crew of 1–4 technicians joined with " / ", e.g.
 * "Johny Austria / Joseph Cristal Jr / Chris Neri". These helpers turn that
 * string into names, team keys and the counts shown on the Performance page.
 */
import { INDIVIDUALS, MAX_CREW, NAME_ALIASES, TEAM_GROUPS } from "@/config/options";

export interface PerformerCount {
  performedBy: string;
  count: number;
}

export interface TeamCount {
  key: string;
  label: string;
  members: string[];
  value: number;
}

const CREW_SEPARATOR = /\s*\/\s*/;

/** Lower-case canonical key for one name (old spellings map to the current one). */
export function canonicalKey(name: string): string {
  const lc = name.trim().replace(/\s+/g, " ").toLowerCase();
  for (const [canon, variants] of Object.entries(NAME_ALIASES)) if (variants.includes(lc)) return canon;
  return lc;
}

/** Display form of a name: the known technician's spelling when it matches, otherwise as typed. */
export function displayName(name: string): string {
  const key = canonicalKey(name);
  return INDIVIDUALS.find((n) => n.toLowerCase() === key) ?? name.trim().replace(/\s+/g, " ");
}

/** "Johny Austria / Joseph Cristal" → ["Johny Austria", "Joseph Cristal Jr"] (deduplicated, order kept). */
export function splitCrew(performedBy: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (performedBy ?? "").split(CREW_SEPARATOR)) {
    if (!part.trim()) continue;
    const key = canonicalKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(displayName(part));
  }
  return out;
}

export function joinCrew(names: string[]): string {
  return names.slice(0, MAX_CREW).join(" / ");
}

/** Order-independent key for a crew of 2+ people, e.g. "chris neri|johny austria|joseph cristal jr". */
export function groupKey(performedBy: string | null | undefined): string | null {
  const crew = splitCrew(performedBy);
  if (crew.length < 2) return null;
  return crew.map(canonicalKey).sort().join("|");
}

/** Surname for compact team labels ("Joseph Cristal Jr" → "Cristal"). */
function surname(name: string): string {
  const parts = name.split(" ").filter((p) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(p));
  return parts[parts.length - 1] ?? name;
}

export function teamLabel(members: string[]): string {
  const key = members.map(canonicalKey).sort().join("|");
  const known = TEAM_GROUPS.find((g) => g.key === key);
  if (known) return known.label;
  const s = members.map(surname);
  return s.length <= 2 ? s.join(" & ") : `${s.slice(0, -1).join(", ")} & ${s[s.length - 1]}`;
}

/**
 * Every crew of 2–4 people becomes a team, regardless of name order.
 * The configured pairs always appear (even with 0 records) so the page looks familiar.
 * Sorted by records, highest first.
 */
export function teamCounts(rows: PerformerCount[]): TeamCount[] {
  const teams = new Map<string, TeamCount>();
  for (const g of TEAM_GROUPS) teams.set(g.key, { key: g.key, label: g.label, members: g.members, value: 0 });
  for (const r of rows) {
    const crew = splitCrew(r.performedBy);
    if (crew.length < 2) continue;
    const key = crew.map(canonicalKey).sort().join("|");
    const t = teams.get(key) ?? { key, label: teamLabel(crew), members: crew, value: 0 };
    t.value += r.count;
    teams.set(key, t);
  }
  return [...teams.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/**
 * A record counts once for each person in its crew (solo, pair, or group of 3–4).
 * Known technicians always appear; anyone else found in the records is added.
 * `extra` adds a name to look up on demand. Sorted by records, highest first.
 */
export function individualCounts(rows: PerformerCount[], extra?: string) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const name of INDIVIDUALS) counts.set(name.toLowerCase(), { label: name, value: 0 });
  if (extra?.trim()) {
    const k = canonicalKey(extra);
    if (!counts.has(k)) counts.set(k, { label: displayName(extra), value: 0 });
  }
  for (const r of rows) {
    for (const name of splitCrew(r.performedBy)) {
      const k = canonicalKey(name);
      const entry = counts.get(k) ?? { label: name, value: 0 };
      entry.value += r.count;
      counts.set(k, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Keep charts readable: top N entries plus an "Others" bucket. */
export function topWithOthers<T extends { label: string; value: number }>(items: T[], n = 8): Array<{ label: string; value: number }> {
  const nonZero = items.filter((i) => i.value > 0);
  const base = nonZero.length ? nonZero : items;
  if (base.length <= n) return base;
  const others = base.slice(n - 1).reduce((s, i) => s + i.value, 0);
  return [...base.slice(0, n - 1), { label: `Others (${base.length - n + 1})`, value: others }];
}
