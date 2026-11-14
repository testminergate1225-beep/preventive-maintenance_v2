/**
 * Print-optimised reports. Each loads a saved record by id, or renders an unsaved
 * draft passed via router state (so the editors can print before saving).
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { PageLoader } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { BRAND_FIELDS, BRAND_SHORT, CIRCUIT_TYPES, MEGGER_CIRCUITS, equipmentLabel } from "@/config/options";
import { api } from "@/lib/api";
import { printReport } from "@/lib/calc/loadBalancing";
import { computeStoreSummary, isFilled } from "@/lib/calc/storeList";
import { fmtDate, fmtNum } from "@/lib/utils";
import type {
  ChecklistCategory, CircuitType, LoadBalancingRecord, LoadItem, MaintenanceRecord, MeggerCircuit, Page, StoreSnapshot,
} from "@/types";
import { MEGGER_KEYS } from "@/types";

function PrintShell({ title, children, landscape }: { title: string; children: ReactNode; landscape?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-sunken print:bg-white">
      {landscape && <style>{"@media print { @page { size: landscape; } }"}</style>}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>Back</Button>
        <span className="text-sm font-semibold text-ink">{title}</span>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print / Save PDF</Button>
      </div>
      <div className="mx-auto my-6 max-w-[1120px] bg-white p-8 text-[12px] text-black shadow-pop print:m-0 print:max-w-none print:p-0 print:shadow-none">{children}</div>
    </div>
  );
}

const th = "border border-black bg-gray-100 px-1.5 py-1 text-center font-bold";
const td = "border border-black px-1.5 py-1";

function Signatures({ items }: { items: Array<[string, string | null | undefined, string?]> }) {
  return (
    <div className="mt-8 border-t-2 border-black pt-4">
      <div className="mb-3 text-[13px] font-bold uppercase tracking-wider">Signatories</div>
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(([label, name, role]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wide text-gray-600">{label}</div>
            <div className="min-h-[26px] border-b-2 border-black px-1 pt-2 text-[13px] font-semibold">{name}</div>
            {role && <div className="mt-0.5 text-[10px] text-gray-500">{role}</div>}
          </div>
        ))}
      </div>
      <div className="mt-3 text-right text-[10px] text-gray-500">Printed: {new Date().toLocaleString()}</div>
    </div>
  );
}

function useRecord<T>(endpoint: string) {
  const { id } = useParams();
  const location = useLocation();
  const draft = (location.state as { draft?: T } | null)?.draft;
  const q = useQuery({ queryKey: [endpoint, Number(id)], queryFn: () => api.get<T>(`${endpoint}/${id}`), enabled: id !== "draft" && !draft });
  return { data: (draft ?? q.data) as T | undefined, loading: q.isLoading && !draft, missing: id === "draft" && !draft };
}

// ───────────────────────── Load balancing ─────────────────────────

export function LoadBalancingPrint() {
  const { data: r, loading, missing } = useRecord<Partial<LoadBalancingRecord>>("/load-balancing");
  if (loading) return <PageLoader />;
  if (!r || missing) return <PrintShell title="Load balancing"><p>Nothing to print — open the record again.</p></PrintShell>;
  const ct = (r.circuitType ?? "three_wye") as CircuitType;
  const rep = printReport(ct, (r.loads ?? []) as LoadItem[], {
    vLl: r.vLl ?? null, vLn: r.vLn ?? null, vPh: r.vPh ?? null, vL1l2: r.vL1l2 ?? null, vL1l3: r.vL1l3 ?? null, vL2l3: r.vL2l3 ?? null,
    vL1n: r.vL1n ?? null, vL2n: r.vL2n ?? null, vL3n: r.vL3n ?? null,
  });
  const v = (x: number | null) => (x ? fmtNum(x, 2) : "");
  const lineCols = rep.showNeutral ? 4 : 3;
  return (
    <PrintShell title="Load balancing report" landscape>
      <div className="mb-3 flex items-start justify-between">
        <div className="leading-snug">
          <div className="text-[15px] font-bold">{r.company}</div>
          <div>{r.location}</div>
          <div className="mt-1 font-bold">MAIN CIRCUIT DETAILS</div>
          <div>Panel: {r.panel}</div><div>Branch: {r.branchCode}</div><div>MCB: {r.mcb ?? ""} A</div><div>Main V: {r.mainVoltage ?? ""} V</div><div>Wires: {r.wires}</div>
        </div>
        <div className="text-right leading-snug">
          <div className="text-[16px] font-bold">LOAD BALANCING</div>
          <div>Date: {fmtDate(r.testDate)}{r.testTime ? ` ${r.testTime.slice(0, 5)}` : ""}</div>
          <div>Ref: {r.refId}</div>
          <div>{CIRCUIT_TYPES.find((c) => c.value === ct)?.label}</div>
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th} rowSpan={2}>DESCRIPTION</th><th className={th} colSpan={lineCols}>LINE CURRENT (AMPS)</th>
            <th className={th} colSpan={3}>LINE VOLTAGE (VOLTS)</th><th className={th} colSpan={3}>PHASE VOLTAGE (VOLTS)</th>
            <th className={th} rowSpan={2}>KVA</th><th className={th} rowSpan={2}>REMARKS</th>
          </tr>
          <tr>
            {rep.lineLabels.slice(0, lineCols).map((l) => <th key={l} className={th}>{l}</th>)}
            <th className={th}>V_L1L2</th><th className={th}>V_L1L3</th><th className={th}>V_L2L3</th>
            <th className={th}>L1-N</th><th className={th}>L2-N</th><th className={th}>L3-N</th>
          </tr>
        </thead>
        <tbody>
          {rep.rows.map((row, i) => (
            <tr key={i}>
              <td className={td}>{row.description}</td>
              <td className={`${td} text-center`}>{v(row.l1)}</td><td className={`${td} text-center`}>{v(row.l2)}</td><td className={`${td} text-center`}>{v(row.l3)}</td>
              {rep.showNeutral && <td className={`${td} text-center`}>{v(row.n)}</td>}
              <td className={`${td} text-center`}>{v(row.vL1L2)}</td><td className={`${td} text-center`}>{v(row.vL1L3)}</td><td className={`${td} text-center`}>{v(row.vL2L3)}</td>
              <td className={`${td} text-center`}>{v(row.vL1N)}</td><td className={`${td} text-center`}>{v(row.vL2N)}</td><td className={`${td} text-center`}>{v(row.vL3N)}</td>
              <td className={`${td} text-center`}>{row.kva ? row.kva.toFixed(3) : ""}</td><td className={`${td} text-center`}>{row.remark}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className={`${td} text-right`}>Total</td>
            <td className={`${td} text-center`}>{rep.totL1.toFixed(2)}</td><td className={`${td} text-center`}>{rep.totL2.toFixed(2)}</td><td className={`${td} text-center`}>{rep.totL3.toFixed(2)}</td>
            {rep.showNeutral && <td className={`${td} text-center`}>{rep.neutral}</td>}
            <td className={td} colSpan={6} /><td className={`${td} text-center`}>{rep.totKva > 0 ? rep.totKva.toFixed(3) : ""}</td><td className={`${td} text-center`}>{rep.verdict}</td>
          </tr>
          {r.remarks && <tr><td className={td} colSpan={lineCols + 8}><b>Remarks:</b> {r.remarks}</td></tr>}
        </tbody>
      </table>
      {(r.nameplateKw || r.measIa) ? (
        <div className="mt-4 text-[11px]"><b>Full load test:</b> nameplate {r.nameplateKw ?? "—"} kW · V {[r.measVan, r.measVbn, r.measVcn].map((x) => x ?? "—").join(" / ")} · I {[r.measIa, r.measIb, r.measIc].map((x) => x ?? "—").join(" / ")} A · PF {[r.pfA, r.pfB, r.pfC].map((x) => x ?? "1").join(" / ")}</div>
      ) : null}
      <Signatures items={[["Conducted by", r.conductedBy, "Electrician / Technician"], ["Witnessed & verified by", r.witnessBy, "Mall Administration Representative"],
        ["Certified by", r.certifiedBy, "Licensed Professional"], ["Witnessed by", r.witnessTenant, "Tenant Representative"]]} />
    </PrintShell>
  );
}

// ───────────────────────── Megger ─────────────────────────

export function MeggerPrint() {
  const { data: r, loading, missing } = useRecord<Record<string, any>>("/megger-tests");
  if (loading) return <PageLoader />;
  if (!r || missing) return <PrintShell title="Megger"><p>Nothing to print.</p></PrintShell>;
  const rows = (r.rows ?? []) as Array<Record<string, any>>;
  return (
    <PrintShell title="Megger test report" landscape>
      <div className="mb-4 text-center">
        <div className="text-[16px] font-bold">Megger Test Report / Insulation Resistance Test</div>
        <div className="text-gray-600">{r.subject || "MEGGER TEST RESULT / INSULATION TEST"}</div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1">
        <div><b>Company:</b> {r.company}</div><div><b>Date:</b> {fmtDate(r.testDate)}</div>
        <div><b>Location:</b> {r.location}</div><div><b>Reference no:</b> {r.referenceNo}</div>
        <div><b>IR test type:</b> {r.irTestType}</div><div><b>Test voltage:</b> {r.testVoltage}</div>
        <div><b>Circuit type:</b> {MEGGER_CIRCUITS.find((c) => c.value === (r.circuitType as MeggerCircuit))?.label}</div>
      </div>
      <div className="mb-1 font-bold">Panel board / branch circuit readings in MΩ</div>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>PANEL</th><th className={th}>BRANCH CKT #</th>{MEGGER_KEYS.map((k) => <th key={k} className={th}>{k}</th>)}<th className={th}>SIZE &amp; TYPE OF WIRE</th><th className={th}>REMARKS</th></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className={td}>{row.panel}</td><td className={td}>{row.branch}</td>
              {MEGGER_KEYS.map((k) => <td key={k} className={`${td} text-center`}>{row[k] ?? ""}</td>)}
              <td className={td}>{row.wire}</td>
              <td className={`${td} text-center font-bold`} style={{ color: row.remarks === "Passed" ? "#060" : row.remarks === "Failed" ? "#c00" : undefined }}>{row.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Signatures items={[["Conducted by", r.conductedBy, "Electrician / Technician"], ["Witnessed by", r.witnessedBy, "Representative"], ["Verified by", r.verifiedBy, "Electrical Engineer"]]} />
    </PrintShell>
  );
}

// ───────────────────────── Checklist ─────────────────────────

export function ChecklistPrint() {
  const { data: r, loading, missing } = useRecord<Record<string, any>>("/checklists");
  if (loading) return <PageLoader />;
  if (!r || missing) return <PrintShell title="Checklist"><p>Nothing to print.</p></PrintShell>;
  const cats = (r.categories ?? []) as ChecklistCategory[];
  const mark = (on: boolean) => (on ? "✔" : "");
  return (
    <PrintShell title="PM checklist">
      <div className="mb-4 text-center text-[16px] font-bold">Preventive Maintenance Checklist</div>
      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1">
        <div><b>Branch:</b> {r.branchName} {r.branchCode ? `(${r.branchCode})` : ""}</div><div><b>Date:</b> {fmtDate(r.checklistDate)}</div>
        <div><b>Location:</b> {r.location}</div><div><b>Reference:</b> {r.refNumber}</div>
        <div><b>Conducted by:</b> {r.conductedBy}</div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr><th className={th} rowSpan={2}>ITEM</th><th className={th} rowSpan={2}>ITEM DESCRIPTION</th><th className={th} colSpan={3}>STATUS</th>
            <th className={th} rowSpan={2}>REMARKS / WORK DONE</th><th className={th} rowSpan={2}>RECOMMENDATIONS</th></tr>
          <tr><th className={th}>OK</th><th className={th}>NOT OK</th><th className={th}>N/A</th></tr>
        </thead>
        <tbody>
          {cats.map((c, ci) => c.items.map((it, ii) => (
            <tr key={`${ci}-${ii}`} className="break-inside-avoid">
              {ii === 0 && <td className={`${td} align-top font-bold`} rowSpan={c.items.length}>{c.category}<div className="font-normal text-[10px] text-gray-600">{c.subtitle}</div></td>}
              <td className={td}>{it.desc}</td>
              <td className={`${td} text-center`}>{mark(it.status === "ok")}</td><td className={`${td} text-center text-red-700`}>{mark(it.status === "not_ok")}</td><td className={`${td} text-center`}>{mark(it.status === "na")}</td>
              <td className={td}>{it.remarks}</td><td className={td}>{it.recommendations}</td>
            </tr>
          )))}
        </tbody>
      </table>
      {r.overallRecommendations && <div className="mt-4"><b>Overall recommendations:</b><div className="whitespace-pre-wrap">{r.overallRecommendations}</div></div>}
      <Signatures items={[["Conducted by", r.sigConducted], ["Witnessed by", r.sigWitnessed], ["Store manager", r.sigStoreManager], ["Store representative", r.sigStoreRep]]} />
    </PrintShell>
  );
}

// ───────────────────────── Store list ─────────────────────────

export function StoreListPrint() {
  const { data: r, loading, missing } = useRecord<{ fileName: string | null; snapshot: StoreSnapshot | null }>("/store-lists");
  if (loading) return <PageLoader />;
  if (!r?.snapshot || missing) return <PrintShell title="Store list"><p>Nothing to print.</p></PrintShell>;
  const s = computeStoreSummary(r.snapshot);
  return (
    <PrintShell title="Store list" landscape>
      <div className="mb-3 flex items-end justify-between">
        <div className="text-[16px] font-bold">Branches Summary{r.fileName ? ` — ${r.fileName}` : ""}</div>
        <div className="text-right">Redemption: <b>{s.redemption}</b> · Main: <b>{s.main}</b> · Sat: <b>{s.sat}</b> · Areas: <b>{s.areas}</b></div>
      </div>
      {r.snapshot.areas.map((a) => {
        const rows = a.entries.filter(isFilled);
        if (!rows.length) return null;
        return (
          <div key={a.id} className="mb-4 break-inside-avoid">
            <div className="mb-1 font-bold">AREA: {a.name}</div>
            <table className="w-full border-collapse text-[10.5px]">
              <thead><tr>
                {["Main", "Sat", "Redm.", "PL code", "Branch code", "Branch name", "SQM", "Trade name", ...BRAND_FIELDS.map((f) => BRAND_SHORT[f]), "Company", "Last PM", "Conducted by"].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((e) => {
                  const n = s.rows.get(e.id);
                  return (
                    <tr key={e.id}>
                      <td className={`${td} text-center`}>{n?.main}</td><td className={`${td} text-center`}>{n?.sat}</td><td className={`${td} text-center`}>{n?.redemption}</td>
                      <td className={td}>{e.plCode}</td><td className={td}>{e.branchCode}</td><td className={td}>{e.branchName}</td><td className={td}>{e.sqm}</td><td className={td}>{e.tradeName}</td>
                      {BRAND_FIELDS.map((f) => <td key={f} className={`${td} text-center`}>{n?.brands[f]}</td>)}
                      <td className={td}>{e.company}</td><td className={td}>{fmtDate(e.lastPmDate) === "—" ? "" : fmtDate(e.lastPmDate)}</td><td className={td}>{e.conductedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="mt-4 grid grid-cols-6 gap-2">
        {BRAND_FIELDS.map((f) => <div key={f} className="border border-black px-2 py-1 text-center"><div className="text-[10px]">{BRAND_SHORT[f]}</div><b>{s.brandCounts[f]}</b></div>)}
      </div>
    </PrintShell>
  );
}

// ───────────────────────── Maintenance list ─────────────────────────

export function MaintenancePrint() {
  const [sp] = useSearchParams();
  const query = Object.fromEntries(sp.entries());
  const q = useQuery({ queryKey: ["maintenance", "print", query], queryFn: () => api.get<Page<MaintenanceRecord>>("/maintenance", { ...query, pageSize: 500 }) });
  if (q.isLoading) return <PageLoader />;
  const items = q.data?.items ?? [];
  return (
    <PrintShell title="PM records" landscape>
      <div className="mb-3 flex items-end justify-between">
        <div className="text-[16px] font-bold">Electrical Preventive Maintenance Records</div>
        <div className="text-gray-600">{items.length} record(s){query.dateFrom || query.dateTo ? ` · ${fmtDate(query.dateFrom)} – ${fmtDate(query.dateTo)}` : ""}</div>
      </div>
      <table className="w-full border-collapse text-[10.5px]">
        <thead><tr>{["Date", "Branch code", "Branch name", "Location", "Equipment", "Task", "Status", "Performed by", "Verified by", "Next due", "Notes"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="break-inside-avoid">
              <td className={td}>{fmtDate(r.performedOn)}</td><td className={td}>{r.branchCode}</td><td className={td}>{r.branchName}</td><td className={td}>{r.location}</td>
              <td className={td}>{equipmentLabel(r.equipment)}</td><td className={td}>{r.task}</td><td className={td}>{r.status}</td><td className={td}>{r.performedBy}</td>
              <td className={td}>{r.verifiedBy}</td><td className={td}>{r.nextDue ? fmtDate(r.nextDue) : ""}</td><td className={td}>{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.data && q.data.total > items.length && <p className="mt-2 text-gray-600">Showing the first {items.length} of {q.data.total}. Narrow the filters to print the rest.</p>}
    </PrintShell>
  );
}
