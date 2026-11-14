import { INDIVIDUALS, NAME_ALIASES, TEAM_GROUPS } from "@/config/options";

export interface PerformerCount {
  performedBy: string;
  count: number;
}

const canonical = (name: string): string => {
  const lc = name.trim().toLowerCase();
  for (const [canon, variants] of Object.entries(NAME_ALIASES)) if (variants.includes(lc)) return canon;
  return lc;
};

/** "Joseph Cristal / Johny Austria" → "johny austria|joseph cristal jr" (order-independent). */
export function groupKey(performedBy: string | null | undefined): string | null {
  if (!performedBy || !performedBy.includes(" / ")) return null;
  return performedBy.split(" / ").map(canonical).sort().join("|");
}

export function teamCounts(rows: PerformerCount[]) {
  const counts = new Map(TEAM_GROUPS.map((g) => [g.key, 0]));
  for (const r of rows) {
    const k = groupKey(r.performedBy);
    if (k && counts.has(k)) counts.set(k, counts.get(k)! + r.count);
  }
  return TEAM_GROUPS.map((g) => ({ label: g.label, members: g.members, value: counts.get(g.key) ?? 0 }));
}

/** A record counts once for each individual named in it (solo or in a pair). */
export function individualCounts(rows: PerformerCount[], extra?: string) {
  const names = extra ? [...INDIVIDUALS, extra] : INDIVIDUALS;
  return names.map((label) => {
    const patterns = NAME_ALIASES[label.toLowerCase()] ?? [label.toLowerCase()];
    const value = rows.reduce((sum, r) => {
      const pb = r.performedBy.toLowerCase();
      return patterns.some((p) => pb.includes(p)) ? sum + r.count : sum;
    }, 0);
    return { label, value };
  });
}
