import { BRAND_FIELDS, DEFAULT_AREAS, TRADE_NAME_BRANDS, type BrandField } from "@/config/options";
import { uid } from "@/lib/utils";
import type { StoreEntry, StoreSnapshot } from "@/types";

export const blankEntry = (): StoreEntry => ({
  id: uid(), storeType: "", noRedemption: false, plCode: "", branchCode: "", branchName: "", sqm: "", tradeName: "",
  tw: "", fh: "", gotcha: "", austin: "", adams: "", jacks: "", company: "", lastPmDate: "", conductedBy: "",
});

/**
 * Fill in any fields missing from snapshots saved by older versions of the app,
 * so every entry has the full shape (strings never undefined).
 */
export function normalizeSnapshot(raw: unknown): StoreSnapshot {
  const areas = (raw as { areas?: unknown[] } | null)?.areas;
  if (!Array.isArray(areas)) return { areas: [] };
  return {
    areas: areas.map((a: any, ai) => ({
      id: String(a?.id ?? `area-${ai}`),
      name: String(a?.name ?? `AREA ${ai + 1}`),
      locked: Boolean(a?.locked),
      entries: (Array.isArray(a?.entries) ? a.entries : []).map((e: any) => {
        const base = blankEntry();
        const out = { ...base } as Record<string, unknown>;
        for (const k of Object.keys(base) as Array<keyof StoreEntry>) {
          const v = e?.[k];
          if (k === "noRedemption") out[k] = Boolean(v);
          else if (k === "storeType") out[k] = v === "main" || v === "sat" ? v : "";
          else if (v !== undefined && v !== null) out[k] = String(v);
        }
        return out as unknown as StoreEntry;
      }),
    })),
  };
}

export const defaultSnapshot = (): StoreSnapshot => ({
  areas: DEFAULT_AREAS.map((name) => ({ id: uid(), name, locked: true, entries: Array.from({ length: 7 }, blankEntry) })),
});

export interface RowNumbers {
  main: number | "";
  sat: number | "";
  redemption: number | "";
  brands: Record<BrandField, number | "">;
}

/**
 * Counting rules from the original store list:
 * - every entry counts toward redemption unless "No Redemption" is ticked
 * - Main / Sat numbering restarts per area; totals are global
 * - brand columns are numbered globally; a known trade name decides which brands apply
 */
export function computeStoreSummary(snapshot: StoreSnapshot) {
  let redemption = 0, mainTotal = 0, satTotal = 0;
  const brandCounts = Object.fromEntries(BRAND_FIELDS.map((f) => [f, 0])) as Record<BrandField, number>;
  const rows = new Map<string, RowNumbers>();

  for (const area of snapshot.areas) {
    let main = 0, sat = 0;
    for (const e of area.entries) {
      const countsRedemption = !e.noRedemption;
      if (countsRedemption) redemption++;
      let mainNo: number | "" = "", satNo: number | "" = "";
      if (e.storeType === "main") { main++; mainTotal++; mainNo = main; }
      if (e.storeType === "sat") { sat++; satTotal++; satNo = sat; }
      const mapping = TRADE_NAME_BRANDS[e.tradeName];
      const brands = {} as Record<BrandField, number | "">;
      for (const f of BRAND_FIELDS) {
        const active = mapping ? Boolean(mapping[f]) : String(e[f] ?? "").trim() !== "";
        if (active) brands[f] = ++brandCounts[f];
        else brands[f] = "";
      }
      rows.set(e.id, { main: mainNo, sat: satNo, redemption: countsRedemption ? redemption : "", brands });
    }
  }
  const filledEntries = snapshot.areas.reduce(
    (s, a) => s + a.entries.filter((e) => e.branchName.trim() || e.plCode.trim() || e.branchCode.trim()).length, 0);
  return { redemption, main: mainTotal, sat: satTotal, brandCounts, rows, filledEntries, areas: snapshot.areas.length };
}

export function isFilled(e: StoreEntry): boolean {
  return Boolean(e.branchName.trim() || e.plCode.trim() || e.branchCode.trim());
}
