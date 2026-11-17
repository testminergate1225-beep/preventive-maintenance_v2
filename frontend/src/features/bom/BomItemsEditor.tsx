import { Camera, CheckCircle2, ImagePlus, Loader2, PackagePlus, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { errorMessage, uploadWithProgress } from "@/lib/api";
import { cn } from "@/lib/utils";
import { blankItem, peso, totals, UNITS, type BomForm, type BomItemForm } from "./bomForm";

type Finding = { label: string; hint: string };

function PhotoTile({ imageId, onChange, disabled }: { imageId: number | null; onChange: (id: number | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const upload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return toast.error("Item photos must be 10 MB or smaller.");
    const form = new FormData();
    form.append("file", file);
    setPct(0);
    try {
      const r = await uploadWithProgress<{ id: number }>("/bom-images", form, setPct).promise;
      onChange(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPct(null);
    }
  };
  return (
    <div className="relative h-24 w-24 shrink-0">
      <button type="button" disabled={disabled || pct !== null} onClick={() => input.current?.click()}
        className={cn("group grid h-full w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed transition",
          imageId ? "border-transparent" : "border-line-strong bg-surface-2 hover:border-accent hover:bg-accent-soft/50",
          disabled && "cursor-default hover:border-line-strong hover:bg-surface-2")}
        aria-label={imageId ? "Replace photo" : "Add photo"} title={imageId ? "Replace photo" : "Add a photo of the item"}>
        {pct !== null ? (
          <span className="flex flex-col items-center gap-1 text-xs font-semibold text-muted"><Loader2 className="h-5 w-5 animate-spin" />{pct}%</span>
        ) : imageId ? (
          <img src={`/api/v1/bom-images/${imageId}`} alt="Item" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[11px] font-medium text-faint"><ImagePlus className="h-6 w-6" />Add photo</span>
        )}
      </button>
      {imageId && !disabled && (
        <button type="button" onClick={() => onChange(null)} aria-label="Remove photo"
          className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-surface text-muted shadow-card ring-1 ring-line hover:text-danger">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
    </div>
  );
}

function ItemCard({ n, item, findings, onChange, onRemove, disabled }: {
  n: number; item: BomItemForm; findings: Finding[]; onChange: (patch: Partial<BomItemForm>) => void; onRemove: () => void; disabled?: boolean;
}) {
  const set = (k: keyof BomItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ [k]: e.target.value });
  const amount = item.unitCost.trim() !== "" && Number(item.unitCost) >= 0 ? (Number(item.quantity) || 0) * Number(item.unitCost) : null;
  const custom = item.finding && !findings.some((f) => f.label === item.finding);
  return (
    <motion.div layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24, height: 0 }}
      className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-ink">{n}</span>
          <PhotoTile imageId={item.imageId} onChange={(imageId) => onChange({ imageId })} disabled={disabled} />
        </div>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-6">
          <Field label="Item / material" required className="sm:col-span-4">
            <Input value={item.name} onChange={set("name")} placeholder="e.g. Circuit breaker 2P 30A" invalid={!item.name.trim() && !!(item.description || item.partNumber)} />
          </Field>
          <Field label="Part no." className="sm:col-span-2"><Input value={item.partNumber} onChange={set("partNumber")} placeholder="Optional" /></Field>
          <Field label="Quantity" className="sm:col-span-2">
            <Input type="number" min="0" step="any" inputMode="decimal" value={item.quantity} onChange={set("quantity")} />
          </Field>
          <Field label="Unit" className="sm:col-span-2">
            <Input list="bom-units" value={item.unit} onChange={set("unit")} placeholder="pc" />
          </Field>
          <Field label="Unit cost (₱)" hint={amount !== null ? `Amount ${peso(amount)}` : "Optional"} className="sm:col-span-2">
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={item.unitCost} onChange={set("unitCost")} placeholder="0.00" />
          </Field>
          <Field label="Description / specification" className="sm:col-span-6">
            <Textarea rows={2} className="min-h-[60px]" value={item.description} onChange={set("description")} placeholder="Size, rating, brand, compatibility…" />
          </Field>
          <Field label="Fixes finding" className="sm:col-span-6">
            <Select value={item.finding} onChange={set("finding")}>
              <option value="">— General / not tied to a finding —</option>
              {findings.map((f) => <option key={f.label} value={f.label}>{f.label}</option>)}
              {custom && <option value={item.finding}>{item.finding}</option>}
            </Select>
          </Field>
        </div>
        {!disabled && (
          <button type="button" onClick={onRemove} aria-label={`Remove line ${n}`}
            className="self-start rounded-lg p-1.5 text-faint transition hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
    </motion.div>
  );
}

/** Material lines of a Bill of Materials, with one-click lines from the checklist's NOT OK findings. */
export function BomItemsEditor({ items, onChange, findings, disabled }: {
  items: BomItemForm[]; onChange: (items: BomItemForm[]) => void; findings: Finding[]; disabled?: boolean;
}) {
  const t = totals(items);
  const covered = new Set(items.filter((i) => i.name.trim()).map((i) => i.finding));
  const add = (finding = "") => onChange([...items, blankItem(finding)]);
  return (
    <div>
      {findings.length > 0 && !disabled && (
        <div className="mb-4 rounded-xl border border-danger/25 bg-danger-soft/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-danger">
            <PackagePlus className="h-4 w-4" /> NOT OK findings — add the materials each one needs
          </div>
          <div className="flex flex-wrap gap-1.5">
            {findings.map((f) => (
              <button key={f.label} type="button" onClick={() => add(f.label)} title={f.hint || undefined}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  covered.has(f.label) ? "border-ok/40 bg-ok-soft text-ok" : "border-danger/30 bg-surface text-ink hover:border-danger hover:bg-danger-soft")}>
                {covered.has(f.label) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {items.map((it, i) => (
            <ItemCard key={it.key} n={i + 1} item={it} findings={findings} disabled={disabled}
              onChange={(patch) => onChange(items.map((x) => (x.key === it.key ? { ...x, ...patch } : x)))}
              onRemove={() => onChange(items.filter((x) => x.key !== it.key))} />
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-line px-6 py-8 text-center">
            <Camera className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-2 text-sm text-muted">No materials yet. {findings.length ? "Click a finding above, or add a line." : "Add the first line."}</p>
          </div>
        )}
      </div>
      <datalist id="bom-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {!disabled ? <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => add()}>Add material line</Button> : <span />}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted"><b className="text-ink">{t.lines}</b> line{t.lines === 1 ? "" : "s"} · qty <b className="text-ink">{+t.qty.toFixed(2)}</b></span>
          {t.hasCost && (
            <span className="rounded-xl border border-accent/40 bg-accent-soft px-3 py-1.5 font-display font-bold text-ink">Est. total {peso(t.amount)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Recipient, notes and sign-off fields. */
export function BomDetailsFields({ form, onChange, compact }: { form: BomForm; onChange: (patch: Partial<BomForm>) => void; compact?: boolean }) {
  const set = (k: keyof BomForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Store e-mail" hint="The finalized BOM is e-mailed here." required>
        <Input type="email" inputMode="email" autoComplete="off" value={form.storeEmail} onChange={set("storeEmail")} placeholder="store@example.com" />
      </Field>
      <Field label="CC (optional)" hint="Separate several addresses with commas.">
        <Input value={form.ccEmails} onChange={set("ccEmails")} placeholder="supervisor@example.com" />
      </Field>
      {!compact && (<>
        <Field label="Prepared by"><Input value={form.preparedBy} onChange={set("preparedBy")} /></Field>
        <Field label="Checked by"><Input value={form.checkedBy} onChange={set("checkedBy")} /></Field>
        <Field label="Approved by"><Input value={form.approvedBy} onChange={set("approvedBy")} /></Field>
        <div className="hidden sm:block" />
        <Field label="Notes" hint="Delivery instructions, schedule, special requirements…" className="sm:col-span-2">
          <Textarea rows={3} value={form.notes} onChange={set("notes")} />
        </Field>
      </>)}
    </div>
  );
}
