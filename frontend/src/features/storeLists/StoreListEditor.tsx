import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Printer, RotateCcw, Save, Store, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PageLoader } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal, useDialogs } from "@/components/ui/Modal";
import { Badge, Card } from "@/components/ui/Surface";
import { BRAND_FIELDS, BRAND_LABELS, BRAND_SHORT, COMPANIES, DEFAULT_AREAS, TECHNICIANS, TRADE_NAME_BRANDS, TRADE_NAMES } from "@/config/options";
import { api, errorMessage } from "@/lib/api";
import { blankEntry, computeStoreSummary, defaultSnapshot, isFilled, type RowNumbers } from "@/lib/calc/storeList";
import { useDraft } from "@/lib/useDraft";
import { cn, fmtDate, uid } from "@/lib/utils";
import type { StoreArea, StoreEntry, StoreListRecord, StoreSnapshot } from "@/types";
import { EditorHeader, Metric } from "../documents/EditorChrome";

type Form = { fileName: string; snapshot: StoreSnapshot };
const cell = "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] text-ink hover:border-line focus:border-accent focus:bg-surface focus:outline-none";

const AreaCard = memo(function AreaCard({ area, numbers, onChange, onDelete }: {
  area: StoreArea; numbers: Map<string, RowNumbers>; onChange: (a: StoreArea) => void; onDelete: (a: StoreArea) => void;
}) {
  const setEntry = (id: string, patch: Partial<StoreEntry>) => onChange({ ...area, entries: area.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  return (
    <Card initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge tone="warn"><MapPin className="h-3 w-3" /> AREA</Badge>
          <h3 className="font-display text-sm font-bold text-ink">{area.name}</h3>
          <span className="text-xs text-muted">{area.entries.filter(isFilled).length} store(s)</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange({ ...area, entries: [...area.entries, blankEntry()] })}>Row</Button>
          <Button size="sm" variant="ghost" className="hover:text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDelete(area)}>Area</Button>
        </div>
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[1500px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-faint [&>th]:border-b [&>th]:border-line [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:whitespace-nowrap">
              <th className="w-10 text-center">Main</th><th className="w-10 text-center">Sat</th><th className="w-12 text-center">Redm.</th>
              <th className="w-20">PL code</th><th className="w-24">Branch code</th><th className="w-48">Branch name</th><th className="w-16">SQM</th><th className="w-52">Trade name</th>
              {BRAND_FIELDS.map((f) => <th key={f} className="w-14 text-center">{BRAND_SHORT[f]}</th>)}
              <th className="w-48">Company</th><th className="w-32">Last PM</th><th className="w-48">Conducted by</th><th className="w-20">Count as</th><th className="w-12 text-center">No redm.</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {area.entries.map((e) => {
              const n = numbers.get(e.id);
              const mapped = !!TRADE_NAME_BRANDS[e.tradeName];
              return (
                <tr key={e.id} className="group [&>td]:border-b [&>td]:border-line/60 [&>td]:px-1 [&>td]:py-0.5 hover:bg-surface-2/60">
                  <td className="text-center font-semibold tabular-nums text-ink">{n?.main}</td>
                  <td className="text-center font-semibold tabular-nums text-ink">{n?.sat}</td>
                  <td className="text-center tabular-nums text-muted">{n?.redemption}</td>
                  <td><input className={cell} value={e.plCode} onChange={(x) => setEntry(e.id, { plCode: x.target.value })} /></td>
                  <td><input className={cell} value={e.branchCode} onChange={(x) => setEntry(e.id, { branchCode: x.target.value })} /></td>
                  <td><input className={cell} value={e.branchName} onChange={(x) => setEntry(e.id, { branchName: x.target.value })} /></td>
                  <td><input className={cell} value={e.sqm} onChange={(x) => setEntry(e.id, { sqm: x.target.value })} /></td>
                  <td><input className={cell} list="trade-names" value={e.tradeName} onChange={(x) => setEntry(e.id, { tradeName: x.target.value })} placeholder="Select…" /></td>
                  {BRAND_FIELDS.map((f) => (
                    <td key={f}>
                      {mapped ? <div className="text-center font-semibold tabular-nums text-accent-strong" title="Auto-filled from trade name">{n?.brands[f]}</div>
                        : <input className={cn(cell, "text-center")} value={e[f]} onChange={(x) => setEntry(e.id, { [f]: x.target.value })} />}
                    </td>
                  ))}
                  <td><input className={cell} list="companies" value={e.company} onChange={(x) => setEntry(e.id, { company: x.target.value })} /></td>
                  <td><input type="date" className={cell} value={e.lastPmDate} onChange={(x) => setEntry(e.id, { lastPmDate: x.target.value })} /></td>
                  <td><input className={cell} list="technicians" value={e.conductedBy} onChange={(x) => setEntry(e.id, { conductedBy: x.target.value })} /></td>
                  <td>
                    <select className={cell} value={e.storeType} onChange={(x) => setEntry(e.id, { storeType: x.target.value as StoreEntry["storeType"] })}>
                      <option value="">None</option><option value="main">Main</option><option value="sat">Sat</option>
                    </select>
                  </td>
                  <td className="text-center"><input type="checkbox" className="accent-amber-500" checked={e.noRedemption} onChange={(x) => setEntry(e.id, { noRedemption: x.target.checked })} title="Skip redemption count" /></td>
                  <td><button className="rounded p-1 text-faint opacity-0 transition group-hover:opacity-100 hover:text-danger" aria-label="Delete row"
                    onClick={() => onChange({ ...area, entries: area.entries.filter((x) => x.id !== e.id) })}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
});

export function StoreListEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm } = useDialogs();
  const [form, setForm, clearDraft] = useDraft<Form>(isNew ? "store-list" : null, () => ({ fileName: "", snapshot: defaultSnapshot() }));
  const [newArea, setNewArea] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const existing = useQuery({ queryKey: ["/store-lists", Number(id)], queryFn: () => api.get<StoreListRecord>(`/store-lists/${id}`), enabled: !isNew });
  useEffect(() => {
    if (existing.data) setForm({ fileName: existing.data.fileName ?? "", snapshot: existing.data.snapshot ?? defaultSnapshot() });
  }, [existing.data, setForm]);

  const summary = useMemo(() => computeStoreSummary(form.snapshot), [form.snapshot]);
  const updateArea = useCallback((a: StoreArea) => setForm((f) => ({ ...f, snapshot: { areas: f.snapshot.areas.map((x) => (x.id === a.id ? a : x)) } })), [setForm]);
  const deleteArea = useCallback(async (a: StoreArea) => {
    if (await confirm({ title: `Delete area ${a.name}?`, message: `${a.entries.filter(isFilled).length} filled row(s) will be removed.`, confirmLabel: "Delete area", danger: true }))
      setForm((f) => ({ ...f, snapshot: { areas: f.snapshot.areas.filter((x) => x.id !== a.id) } }));
  }, [confirm, setForm]);
  const addArea = () => {
    const n = newArea.trim().toUpperCase();
    if (!n) return;
    if (form.snapshot.areas.some((a) => a.name.toUpperCase() === n)) return toast.error("That area already exists.");
    setForm((f) => ({ ...f, snapshot: { areas: [...f.snapshot.areas, { id: uid(), name: n, locked: false, entries: [blankEntry()] }] } }));
    setNewArea("");
  };

  const save = useMutation({
    mutationFn: (asNew: boolean) => {
      const payload = { fileName: name.trim(), snapshot: form.snapshot };
      return isNew || asNew ? api.post<StoreListRecord>("/store-lists", payload) : api.put<StoreListRecord>(`/store-lists/${id}`, payload);
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["/store-lists"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setSaveOpen(false);
      toast.success(`Saved "${rec.fileName}"`);
      if (isNew) clearDraft();
      if (rec.id !== Number(id)) navigate(`/store-lists/${rec.id}`, { replace: true });
      setForm({ fileName: rec.fileName ?? "", snapshot: rec.snapshot ?? form.snapshot });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const openSave = () => {
    setName(form.fileName || `Store List - ${new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date())}`);
    setSaveOpen(true);
  };

  if (!isNew && existing.isLoading) return <PageLoader />;

  return (
    <div>
      <datalist id="trade-names">{TRADE_NAMES.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="companies">{COMPANIES.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="technicians">{TECHNICIANS.map((t) => <option key={t} value={t} />)}</datalist>

      <EditorHeader back="/store-lists" backLabel="Back to store lists" icon={<Store className="h-5 w-5" />}
        title={isNew ? "New store list" : form.fileName || "Store list"} subtitle="Branches summary by area"
        badge={isNew ? <Badge tone="info">Draft autosaved</Badge> : undefined}
        actions={<>
          <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={async () => {
            if (await confirm({ title: "Reset to default areas?", message: "All current data in this editor will be cleared.", confirmLabel: "Reset", danger: true })) setForm({ fileName: form.fileName, snapshot: defaultSnapshot() });
          }}>Reset</Button>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/print/store-lists/${isNew ? "draft" : id}`, { state: { draft: { fileName: form.fileName, snapshot: form.snapshot } } })}>Print</Button>
          <Button icon={<Save className="h-4 w-4" />} onClick={openSave}>{isNew ? "Save" : "Save changes"}</Button>
        </>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="With redemption" value={summary.redemption} />
        <Metric label="Main areas" value={summary.main} />
        <Metric label="Satellite" value={summary.sat} />
        <Metric label="Areas" value={`${summary.areas} (${summary.areas - DEFAULT_AREAS.length >= 0 ? "+" : ""}${summary.areas - DEFAULT_AREAS.length})`} />
        <Metric label="Stores listed" value={summary.filledEntries} className="lg:col-span-2" />
      </div>
      <Card className="mb-6 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Summary of trade names</div>
        <div className="flex flex-wrap gap-2">
          {BRAND_FIELDS.map((f) => (
            <div key={f} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-sm">
              <span className="text-muted">{BRAND_LABELS[f]}</span>
              <motion.b key={summary.brandCounts[f]} initial={{ scale: 1.4, color: "var(--app-accent-strong)" }} animate={{ scale: 1, color: "var(--app-text)" }} className="tabular-nums">{summary.brandCounts[f]}</motion.b>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        <AnimatePresence initial={false}>
          {form.snapshot.areas.map((a) => <AreaCard key={a.id} area={a} numbers={summary.rows} onChange={updateArea} onDelete={deleteArea} />)}
        </AnimatePresence>
      </div>

      <Card className="mt-5 flex flex-wrap items-center gap-3 p-4">
        <Input className="max-w-xs" value={newArea} onChange={(e) => setNewArea(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addArea()} placeholder="New area name, e.g. NORTH 7" />
        <Button icon={<Plus className="h-4 w-4" />} onClick={addArea}>Add area</Button>
      </Card>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} size="lg" icon={<Save className="h-5 w-5" />} title={isNew ? "Preview & save" : "Update record"}
        footer={<>
          <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
          {!isNew && <Button variant="outline" disabled={!name.trim()} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>Save as new</Button>}
          <Button disabled={!name.trim()} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>{isNew ? "Save" : "Update"}</Button>
        </>}>
        <Field label="File name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Metric label="Areas" value={summary.areas} /><Metric label="Main" value={summary.main} /><Metric label="Sat" value={summary.sat} />
          <Metric label="Redemption" value={summary.redemption} /><Metric label="Entries" value={summary.filledEntries} />
        </div>
        <div className="mt-4 max-h-[300px] space-y-3 overflow-y-auto">
          {form.snapshot.areas.map((a) => {
            const filled = a.entries.filter(isFilled);
            if (!filled.length) return null;
            return (
              <div key={a.id}>
                <div className="mb-1 text-xs font-bold text-ink">{a.name} <span className="font-normal text-muted">({filled.length})</span></div>
                <div className="rounded-lg border border-line text-xs">
                  {filled.map((e) => (
                    <div key={e.id} className="grid grid-cols-[70px_80px_1fr_1fr_90px] gap-2 border-b border-line px-2 py-1 last:border-0">
                      <span>{e.plCode}</span><span>{e.branchCode}</span><span className="truncate">{e.branchName}</span><span className="truncate text-muted">{e.tradeName}</span><span className="text-muted">{fmtDate(e.lastPmDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
