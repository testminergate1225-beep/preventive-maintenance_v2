/**
 * Print-optimised reports. Each loads a saved record by id, or renders an unsaved
 * draft passed via router state (so the editors can print before saving).
 *
 * Design: always light (see @media print in index.css), A4 sheet preview on screen,
 * branded header, labelled info panels, light tables with repeating headers,
 * summary tiles and signature blocks.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { gearPath } from "@/components/graphics/Gear";
import { PageLoader } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { BRAND_FIELDS, BRAND_LABELS, BRAND_SHORT, CIRCUIT_TYPES, MEGGER_CIRCUITS, equipmentLabel } from "@/config/options";
import { api } from "@/lib/api";
import { printReport } from "@/lib/calc/loadBalancing";
import { PASS_THRESHOLD_MOHM } from "@/lib/calc/megger";
import { computeStoreSummary, isFilled, normalizeSnapshot } from "@/lib/calc/storeList";
import { cn, fmtDate, fmtNum } from "@/lib/utils";
import type { ChecklistCategory, CircuitType, LoadBalancingRecord, LoadItem, MaintenanceRecord, MeggerCircuit, Page, StoreSnapshot } from "@/types";
import { MEGGER_KEYS } from "@/types";

// ───────────────────────────── building blocks ─────────────────────────────

function PrintShell({ title, children, landscape }: { title: string; children: ReactNode; landscape?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <style>{`@media print { @page { size: A4 ${landscape ? "landscape" : "portrait"}; } }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3 shadow-sm">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>Back</Button>
        <span className="hidden text-sm font-semibold text-ink sm:block">{title} — print preview</span>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print / Save PDF</Button>
      </div>
      <div className="overflow-x-auto py-8 print:overflow-visible print:py-0">
        <article
          className={cn(
            "print-sheet mx-auto bg-white px-[12mm] py-[12mm] font-sans text-[10.5px] leading-snug text-slate-900 shadow-xl",
            "print:w-auto print:min-h-0 print:p-0 print:shadow-none",
            landscape ? "w-[297mm] min-h-[210mm]" : "w-[210mm] min-h-[297mm]",
          )}
        >
          {children}
        </article>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="-16 -16 32 32" className="h-9 w-9" aria-hidden>
        <rect x="-16" y="-16" width="32" height="32" rx="7" fill="#0f172a" />
        <path d={gearPath(10, 11, 8.6, 3.4)} fill="#f59e0b" fillRule="evenodd" />
      </svg>
      <div className="leading-tight">
        <div className="text-[13px] font-bold tracking-tight text-slate-900">EPM System</div>
        <div className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Electrical Preventive Maintenance</div>
      </div>
    </div>
  );
}

function ReportHeader({ title, subtitle, refNo, date }: { title: string; subtitle?: string; refNo?: string | null; date?: string | null }) {
  return (
    <header className="mb-5">
      <div className="flex items-start justify-between gap-6 pb-3">
        <Brand />
        <div className="text-right">
          <h1 className="text-[17px] font-extrabold uppercase tracking-wide text-slate-900">{title}</h1>
          {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
          <div className="mt-1 flex justify-end gap-4 text-[10px]">
            {refNo && <span><span className="text-slate-500">Ref No.</span> <b className="font-mono">{refNo}</b></span>}
            {date && <span><span className="text-slate-500">Date</span> <b>{date}</b></span>}
          </div>
        </div>
      </div>
      <div className="h-[3px] rounded-full bg-gradient-to-r from-slate-900 via-slate-900 to-amber-500" />
    </header>
  );
}

/** Labelled key/value panel. */
function InfoPanel({ title, items, cols = 2 }: { title?: string; items: Array<[string, ReactNode]>; cols?: number }) {
  return (
    <section className="print-avoid-break overflow-hidden rounded-md border border-slate-300">
      {title && <div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">{title}</div>}
      <dl className="grid gap-x-6 gap-y-1.5 px-3 py-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map(([k, v]) => (
          <div key={k} className="flex min-w-0 gap-2">
            <dt className="w-[92px] shrink-0 text-[9.5px] uppercase tracking-wide text-slate-500">{k}</dt>
            <dd className="min-w-0 font-semibold text-slate-900">{v || <span className="font-normal text-slate-400">—</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type Tone = "ok" | "bad" | "warn" | undefined;
function Tiles({ items }: { items: Array<{ label: string; value: ReactNode; tone?: Tone }> }) {
  const toneCls = (t: Tone) => (t === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : t === "bad" ? "border-red-300 bg-red-50 text-red-800" : t === "warn" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-slate-50 text-slate-900");
  return (
    <div className="print-avoid-break grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((t) => (
        <div key={t.label} className={cn("rounded-md border px-3 py-2", toneCls(t.tone))}>
          <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] opacity-70">{t.label}</div>
          <div className="mt-0.5 text-[14px] font-bold tabular-nums">{t.value}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-1.5 mt-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700"><span className="h-3 w-1 rounded-full bg-amber-500" />{children}</h2>;
}

const TH = "border border-slate-300 bg-slate-100 px-1.5 py-1.5 text-center align-middle text-[8.5px] font-bold uppercase tracking-wide text-slate-700";
const TD = "border border-slate-300 px-1.5 py-1 align-top";
const TDC = `${TD} text-center tabular-nums`;

function DataTable({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <table className={cn("w-full border-collapse", className)}>
      <thead>{head}</thead>
      <tbody className="[&>tr:nth-child(even)]:bg-slate-50/70">{children}</tbody>
    </table>
  );
}

function NoteBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-avoid-break mt-4 rounded-md border border-slate-300">
      <div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">{title}</div>
      <div className="min-h-[36px] whitespace-pre-wrap px-3 py-2">{children}</div>
    </section>
  );
}

function Signatures({ items }: { items: Array<[string, string | null | undefined, string?]> }) {
  return (
    <section className="print-avoid-break mt-8">
      <div className="grid gap-8" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(([label, name, role]) => (
          <div key={label} className="text-center">
            <div className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
            <div className="mt-6 flex h-[22px] items-end justify-center border-b border-slate-900 pb-1 text-[11px] font-semibold uppercase">{name}</div>
            <div className="mt-1 text-[8.5px] text-slate-500">{role ?? "Signature over printed name"}</div>
            <div className="mt-3 flex items-end gap-1 text-[8.5px] text-slate-500">Date:<span className="flex-1 border-b border-slate-400" /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-6 flex justify-between border-t border-slate-200 pt-2 text-[8.5px] text-slate-400">
      <span>Generated by EPM System</span>
      <span>Printed {new Date().toLocaleString()}</span>
    </footer>
  );
}

function Nothing({ title }: { title: string }) {
  return <PrintShell title={title}><p className="text-sm text-slate-600">Nothing to print — open the record again and choose Print.</p></PrintShell>;
}

function useRecord<T>(endpoint: string) {
  const { id } = useParams();
  const location = useLocation();
  const draft = (location.state as { draft?: T } | null)?.draft;
  const q = useQuery({ queryKey: [endpoint, Number(id)], queryFn: () => api.get<T>(`${endpoint}/${id}`), enabled: id !== "draft" && !draft });
  return { data: (draft ?? q.data) as T | undefined, loading: q.isLoading && !draft, missing: id === "draft" && !draft };
}

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v));

// ───────────────────────────── Load balancing ─────────────────────────────

export function LoadBalancingPrint() {
  const { data: r, loading, missing } = useRecord<Partial<LoadBalancingRecord>>("/load-balancing");
  if (loading) return <PageLoader />;
  if (!r || missing) return <Nothing title="Load balancing" />;
  const ct = (r.circuitType ?? "three_wye") as CircuitType;
  const rep = printReport(ct, (r.loads ?? []) as LoadItem[], {
    vLl: r.vLl ?? null, vLn: r.vLn ?? null, vPh: r.vPh ?? null, vL1l2: r.vL1l2 ?? null, vL1l3: r.vL1l3 ?? null, vL2l3: r.vL2l3 ?? null,
    vL1n: r.vL1n ?? null, vL2n: r.vL2n ?? null, vL3n: r.vL3n ?? null,
  });
  const v = (x: number | null) => (x ? fmtNum(x, 2) : "");
  const lineCols = rep.showNeutral ? 4 : 3;
  const balanced = rep.verdict.startsWith("Balanced");
  const hasFlt = !!(r.nameplateKw || r.measIa || r.measIb || r.measIc);

  return (
    <PrintShell title="Load balancing report" landscape>
      <ReportHeader title="Load Balancing Report" subtitle="Load balancing & full load test" refNo={r.refId} date={`${fmtDate(r.testDate)}${r.testTime ? ` · ${r.testTime.slice(0, 5)}` : ""}`} />

      <div className="grid grid-cols-2 gap-3">
        <InfoPanel title="Site" items={[["Company", r.company], ["Location", r.location], ["Branch code", r.branchCode], ["Panel board", r.panel]]} cols={1} />
        <InfoPanel title="Main circuit details" cols={2} items={[
          ["MCB", r.mcb ? `${r.mcb} A` : ""], ["Main voltage", r.mainVoltage ? `${r.mainVoltage} V` : ""],
          ["Wire", r.wires], ["System", CIRCUIT_TYPES.find((c) => c.value === ct)?.label],
          ["V (L-L)", r.vLl ? `${r.vLl} V` : ""], ["V (L-N)", r.vLn ? `${r.vLn} V` : ""],
        ]} />
      </div>

      <SectionTitle>Circuit load measurements</SectionTitle>
      <DataTable head={<>
        <tr>
          <th className={cn(TH, "w-[22%] text-left")} rowSpan={2}>Description</th>
          <th className={TH} colSpan={lineCols}>Line current (A)</th>
          <th className={TH} colSpan={3}>Line voltage (V)</th>
          <th className={TH} colSpan={3}>Phase voltage (V)</th>
          <th className={TH} rowSpan={2}>kVA</th>
          <th className={TH} rowSpan={2}>Remarks</th>
        </tr>
        <tr>
          {rep.lineLabels.slice(0, lineCols).map((l) => <th key={l} className={TH}>{l}</th>)}
          <th className={TH}>L1-L2</th><th className={TH}>L1-L3</th><th className={TH}>L2-L3</th>
          <th className={TH}>L1-N</th><th className={TH}>L2-N</th><th className={TH}>L3-N</th>
        </tr>
      </>}>
        {rep.rows.length === 0 && <tr><td className={cn(TD, "py-4 text-center text-slate-400")} colSpan={lineCols + 9}>No loads recorded</td></tr>}
        {rep.rows.map((row, i) => (
          <tr key={i}>
            <td className={TD}>{row.description}</td>
            <td className={TDC}>{v(row.l1)}</td><td className={TDC}>{v(row.l2)}</td><td className={TDC}>{v(row.l3)}</td>
            {rep.showNeutral && <td className={TDC}>{v(row.n)}</td>}
            <td className={TDC}>{v(row.vL1L2)}</td><td className={TDC}>{v(row.vL1L3)}</td><td className={TDC}>{v(row.vL2L3)}</td>
            <td className={TDC}>{v(row.vL1N)}</td><td className={TDC}>{v(row.vL2N)}</td><td className={TDC}>{v(row.vL3N)}</td>
            <td className={TDC}>{row.kva ? row.kva.toFixed(3) : ""}</td>
            <td className={cn(TDC, row.remark && "font-semibold text-red-700")}>{row.remark}</td>
          </tr>
        ))}
        <tr className="bg-slate-100 font-bold">
          <td className={cn(TD, "text-right uppercase")}>Total</td>
          <td className={TDC}>{rep.totL1.toFixed(2)}</td><td className={TDC}>{rep.totL2.toFixed(2)}</td><td className={TDC}>{rep.totL3.toFixed(2)}</td>
          {rep.showNeutral && <td className={TDC}>{rep.neutral}</td>}
          <td className={TD} colSpan={6} />
          <td className={TDC}>{rep.totKva > 0 ? rep.totKva.toFixed(3) : ""}</td>
          <td className={cn(TDC, rep.verdict && (balanced ? "text-emerald-700" : "text-red-700"))}>{rep.verdict}</td>
        </tr>
      </DataTable>

      <div className="mt-4">
        <Tiles items={[
          { label: rep.lineLabels[0], value: `${rep.totL1.toFixed(2)} A` },
          { label: rep.lineLabels[1], value: `${rep.totL2.toFixed(2)} A` },
          { label: rep.lineLabels[2], value: `${rep.totL3.toFixed(2)} A` },
          ...(rep.showNeutral ? [{ label: ct === "three_wye" ? "Neutral (vector)" : "Neutral", value: `${rep.neutral} A` }] : []),
          { label: "Total kVA", value: rep.totKva > 0 ? rep.totKva.toFixed(3) : "—" },
          { label: "Assessment", value: rep.verdict || "—", tone: rep.verdict ? (balanced ? "ok" : "bad") : undefined },
        ]} />
      </div>

      {hasFlt && (<>
        <SectionTitle>Full load test</SectionTitle>
        <DataTable head={<tr><th className={cn(TH, "text-left")}>Parameter</th><th className={TH}>Phase A</th><th className={TH}>Phase B</th><th className={TH}>Phase C</th></tr>}>
          <tr><td className={TD}>Measured voltage (V)</td><td className={TDC}>{dash(r.measVan)}</td><td className={TDC}>{dash(r.measVbn)}</td><td className={TDC}>{dash(r.measVcn)}</td></tr>
          <tr><td className={TD}>Measured current (A)</td><td className={TDC}>{dash(r.measIa)}</td><td className={TDC}>{dash(r.measIb)}</td><td className={TDC}>{dash(r.measIc)}</td></tr>
          <tr><td className={TD}>Power factor</td><td className={TDC}>{dash(r.pfA) || "1"}</td><td className={TDC}>{dash(r.pfB) || "1"}</td><td className={TDC}>{dash(r.pfC) || "1"}</td></tr>
          <tr><td className={TD}>Nameplate full load power</td><td className={TDC} colSpan={3}>{r.nameplateKw ? `${r.nameplateKw} kW` : ""}</td></tr>
        </DataTable>
      </>)}

      <NoteBox title="Remarks">{r.remarks}</NoteBox>
      <Signatures items={[["Conducted by", r.conductedBy, "Electrician / Technician"], ["Witnessed & verified by", r.witnessBy, "Mall Administration Representative"],
        ["Certified by", r.certifiedBy, "Licensed Professional (RME / REE / PEE)"], ["Witnessed by", r.witnessTenant, "Tenant Representative"]]} />
      <Footer />
    </PrintShell>
  );
}

// ───────────────────────────── Megger ─────────────────────────────

export function MeggerPrint() {
  const { data: r, loading, missing } = useRecord<Record<string, any>>("/megger-tests");
  if (loading) return <PageLoader />;
  if (!r || missing) return <Nothing title="Megger test" />;
  const rows = (r.rows ?? []) as Array<Record<string, any>>;
  const passed = rows.filter((x) => x.remarks === "Passed").length;
  const failed = rows.filter((x) => x.remarks === "Failed").length;
  const low = (v: unknown) => v !== null && v !== "" && v !== undefined && !Number.isNaN(Number(v)) && Number(v) < PASS_THRESHOLD_MOHM;
  return (
    <PrintShell title="Megger test report" landscape>
      <ReportHeader title="Insulation Resistance Test Report" subtitle={r.subject || "Megger test result / insulation test"} refNo={r.referenceNo} date={fmtDate(r.testDate)} />
      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <InfoPanel title="Site" cols={1} items={[["Company", r.company], ["Location", r.location]]} />
        <InfoPanel title="Test parameters" cols={2} items={[
          ["IR test type", r.irTestType], ["Test voltage", r.testVoltage],
          ["Circuit type", MEGGER_CIRCUITS.find((c) => c.value === (r.circuitType as MeggerCircuit))?.label], ["Pass criterion", `≥ ${PASS_THRESHOLD_MOHM} MΩ`],
        ]} />
      </div>
      <div className="mt-3">
        <Tiles items={[
          { label: "Circuits tested", value: rows.length },
          { label: "Passed", value: passed, tone: passed ? "ok" : undefined },
          { label: "Failed", value: failed, tone: failed ? "bad" : undefined },
          { label: "Overall result", value: rows.length === 0 ? "—" : failed ? "Action required" : "All passed", tone: rows.length === 0 ? undefined : failed ? "bad" : "ok" },
        ]} />
      </div>
      <SectionTitle>Panel board / branch circuit readings (MΩ)</SectionTitle>
      <DataTable head={<tr>
        <th className={cn(TH, "text-left")}>Panel</th><th className={TH}>Branch ckt #</th>
        {MEGGER_KEYS.map((k) => <th key={k} className={TH}>{k}</th>)}
        <th className={cn(TH, "text-left")}>Size &amp; type of wire</th><th className={TH}>Result</th>
      </tr>}>
        {rows.length === 0 && <tr><td className={cn(TD, "py-4 text-center text-slate-400")} colSpan={MEGGER_KEYS.length + 4}>No readings recorded</td></tr>}
        {rows.map((row, i) => (
          <tr key={i}>
            <td className={TD}>{row.panel}</td><td className={TDC}>{row.branch}</td>
            {MEGGER_KEYS.map((k) => <td key={k} className={cn(TDC, low(row[k]) && "bg-red-50 font-bold text-red-700")}>{dash(row[k])}</td>)}
            <td className={TD}>{row.wire}</td>
            <td className={cn(TDC, "font-bold", row.remarks === "Passed" && "text-emerald-700", row.remarks === "Failed" && "text-red-700")}>{row.remarks}</td>
          </tr>
        ))}
      </DataTable>
      <p className="mt-2 text-[8.5px] text-slate-500">Readings below {PASS_THRESHOLD_MOHM} MΩ are highlighted and mark the circuit as failed. Blank cells were not applicable to the circuit type.</p>
      <Signatures items={[["Conducted by", r.conductedBy, "Electrician / Technician"], ["Witnessed by", r.witnessedBy, "Representative"], ["Verified by", r.verifiedBy, "Electrical Engineer"]]} />
      <Footer />
    </PrintShell>
  );
}

// ───────────────────────────── Checklist ─────────────────────────────

function StatusMark({ on, tone }: { on: boolean; tone: "ok" | "bad" | "na" }) {
  if (!on) return null;
  const cls = tone === "ok" ? "bg-emerald-600" : tone === "bad" ? "bg-red-600" : "bg-slate-500";
  return <span className={cn("inline-grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold text-white", cls)}>{tone === "na" ? "–" : tone === "ok" ? "✓" : "✕"}</span>;
}

export function ChecklistPrint() {
  const { data: r, loading, missing } = useRecord<Record<string, any>>("/checklists");
  if (loading) return <PageLoader />;
  if (!r || missing) return <Nothing title="Checklist" />;
  const cats = (r.categories ?? []) as ChecklistCategory[];
  const all = cats.flatMap((c) => c.items);
  const count = (s: string) => all.filter((i) => i.status === s).length;
  const ok = count("ok"), bad = count("not_ok"), na = count("na");
  return (
    <PrintShell title="PM checklist">
      <ReportHeader title="Preventive Maintenance Checklist" subtitle="Electrical systems inspection" refNo={r.refNumber} date={fmtDate(r.checklistDate)} />
      <InfoPanel title="Branch information" cols={2} items={[
        ["Branch", r.branchName], ["Branch code", r.branchCode], ["Location", r.location], ["Conducted by", r.conductedBy],
      ]} />
      <div className="mt-3">
        <Tiles items={[
          { label: "Items inspected", value: `${ok + bad + na} / ${all.length}` },
          { label: "OK", value: ok, tone: ok ? "ok" : undefined },
          { label: "Not OK", value: bad, tone: bad ? "bad" : undefined },
          { label: "N/A", value: na },
        ]} />
      </div>
      <SectionTitle>Inspection items</SectionTitle>
      <DataTable head={<>
        <tr>
          <th className={cn(TH, "w-[34%] text-left")} rowSpan={2}>Item description</th>
          <th className={TH} colSpan={3}>Status</th>
          <th className={cn(TH, "text-left")} rowSpan={2}>Remarks / work done</th>
          <th className={cn(TH, "text-left")} rowSpan={2}>Recommendations</th>
        </tr>
        <tr><th className={cn(TH, "w-9")}>OK</th><th className={cn(TH, "w-9")}>Not OK</th><th className={cn(TH, "w-9")}>N/A</th></tr>
      </>}>
        {cats.map((c, ci) => [
          <tr key={`c${ci}`} className="!bg-slate-800 text-white">
            <td className="border border-slate-800 px-2 py-1 font-bold" colSpan={6}>
              {c.category}{c.subtitle && <span className="ml-2 text-[8.5px] font-normal text-slate-300">{c.subtitle}</span>}
            </td>
          </tr>,
          ...c.items.map((it, ii) => (
            <tr key={`${ci}-${ii}`} className={it.status === "not_ok" ? "!bg-red-50" : undefined}>
              <td className={TD}>{it.desc}</td>
              <td className={TDC}><StatusMark on={it.status === "ok"} tone="ok" /></td>
              <td className={TDC}><StatusMark on={it.status === "not_ok"} tone="bad" /></td>
              <td className={TDC}><StatusMark on={it.status === "na"} tone="na" /></td>
              <td className={TD}>{it.remarks}</td>
              <td className={TD}>{it.recommendations}</td>
            </tr>
          )),
        ])}
      </DataTable>
      <NoteBox title="Overall recommendations">{r.overallRecommendations}</NoteBox>
      <Signatures items={[["Conducted by", r.sigConducted], ["Witnessed by", r.sigWitnessed], ["Store manager", r.sigStoreManager], ["Store representative", r.sigStoreRep]]} />
      <Footer />
    </PrintShell>
  );
}

// ───────────────────────────── Store list ─────────────────────────────

export function StoreListPrint() {
  const { data: r, loading, missing } = useRecord<{ fileName: string | null; snapshot: StoreSnapshot | null; savedAt?: string | null }>("/store-lists");
  if (loading) return <PageLoader />;
  if (!r?.snapshot || missing) return <Nothing title="Store list" />;
  const snapshot = normalizeSnapshot(r.snapshot);
  const s = computeStoreSummary(snapshot);
  return (
    <PrintShell title="Store list" landscape>
      <ReportHeader title="Branches Summary" subtitle={r.fileName ?? "Store list"} date={fmtDate((r.savedAt ?? new Date().toISOString()).slice(0, 10))} />
      <Tiles items={[
        { label: "Stores with redemption", value: s.redemption },
        { label: "Main areas", value: s.main },
        { label: "Satellite", value: s.sat },
        { label: "Areas", value: s.areas },
        { label: "Stores listed", value: s.filledEntries },
      ]} />
      <div className="mt-2 grid grid-cols-6 gap-2">
        {BRAND_FIELDS.map((f) => (
          <div key={f} className="flex items-center justify-between rounded-md border border-slate-300 px-2.5 py-1.5">
            <span className="text-[9px] text-slate-600">{BRAND_LABELS[f]}</span><b className="tabular-nums">{s.brandCounts[f]}</b>
          </div>
        ))}
      </div>
      {s.filledEntries === 0 && <p className="mt-6 rounded-md border border-dashed border-slate-300 py-6 text-center text-slate-500">No stores listed in this snapshot.</p>}
      {snapshot.areas.map((a) => {
        const rows = a.entries.filter(isFilled);
        if (!rows.length) return null;
        return (
          <section key={a.id}>
            <SectionTitle>Area: {a.name} <span className="font-normal normal-case tracking-normal text-slate-500">({rows.length} store{rows.length > 1 ? "s" : ""})</span></SectionTitle>
            <DataTable className="text-[9.5px]" head={<tr>
              {["Main", "Sat", "Redm.", "PL code", "Branch code", "Branch name", "SQM", "Trade name", ...BRAND_FIELDS.map((f) => BRAND_SHORT[f]), "Company", "Last PM", "Conducted by"].map((h) => <th key={h} className={TH}>{h}</th>)}
            </tr>}>
              {rows.map((e) => {
                const n = s.rows.get(e.id);
                return (
                  <tr key={e.id}>
                    <td className={TDC}>{n?.main}</td><td className={TDC}>{n?.sat}</td><td className={TDC}>{n?.redemption}</td>
                    <td className={TD}>{e.plCode}</td><td className={TD}>{e.branchCode}</td><td className={cn(TD, "font-semibold")}>{e.branchName}</td><td className={TDC}>{e.sqm}</td><td className={TD}>{e.tradeName}</td>
                    {BRAND_FIELDS.map((f) => <td key={f} className={TDC}>{n?.brands[f]}</td>)}
                    <td className={TD}>{e.company}</td><td className={cn(TD, "whitespace-nowrap")}>{e.lastPmDate ? fmtDate(e.lastPmDate) : ""}</td><td className={TD}>{e.conductedBy}</td>
                  </tr>
                );
              })}
            </DataTable>
          </section>
        );
      })}
      <Footer />
    </PrintShell>
  );
}

// ───────────────────────────── Maintenance list ─────────────────────────────

export function MaintenancePrint() {
  const [sp] = useSearchParams();
  const query = Object.fromEntries(sp.entries());
  const q = useQuery({ queryKey: ["maintenance", "print", query], queryFn: () => api.get<Page<MaintenanceRecord>>("/maintenance", { ...query, pageSize: 500 }) });
  if (q.isLoading) return <PageLoader />;
  const items = q.data?.items ?? [];
  const period = query.dateFrom || query.dateTo ? `${fmtDate(query.dateFrom)} – ${fmtDate(query.dateTo)}` : "All dates";
  return (
    <PrintShell title="PM records" landscape>
      <ReportHeader title="Preventive Maintenance Records" subtitle={`${items.length} record(s) · ${period}`} date={fmtDate(new Date().toISOString().slice(0, 10))} />
      <DataTable className="text-[9.5px]" head={<tr>{["Date", "Branch", "Location", "Equipment", "Task", "Status", "Performed by", "Verified by", "Next due", "Notes"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>}>
        {items.map((r) => (
          <tr key={r.id}>
            <td className={cn(TD, "whitespace-nowrap")}>{fmtDate(r.performedOn)}</td>
            <td className={TD}><b>{r.branchName}</b>{r.branchCode ? <div className="text-slate-500">{r.branchCode}</div> : null}</td>
            <td className={TD}>{r.location}</td><td className={TD}>{equipmentLabel(r.equipment)}</td><td className={TD}>{r.task}</td>
            <td className={TD}>{r.status}</td><td className={TD}>{r.performedBy}</td><td className={TD}>{r.verifiedBy}</td>
            <td className={cn(TD, "whitespace-nowrap")}>{r.nextDue ? fmtDate(r.nextDue) : ""}</td><td className={TD}>{r.notes}</td>
          </tr>
        ))}
      </DataTable>
      {q.data && q.data.total > items.length && <p className="mt-2 text-slate-600">Showing the first {items.length} of {q.data.total}. Narrow the filters to print the rest.</p>}
      <Footer />
    </PrintShell>
  );
}
