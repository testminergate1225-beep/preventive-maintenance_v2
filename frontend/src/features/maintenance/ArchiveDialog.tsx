import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarRange, EyeOff, Lock, ListChecks, LineChart } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { cn, fmtDate } from "@/lib/utils";

type Mode = "selected" | "before";
const REASONS = ["Year-end close-out", "Superseded by a newer PM", "Branch closed", "Duplicate entry"];

/** Jan 1 of this year — i.e. archive everything from previous years (the usual year-end close-out). */
const defaultCutoff = () => `${new Date().getFullYear()}-01-01`;

/**
 * Archive flow (admins):
 *  1. Choose what to archive — the records ticked in the list, or everything performed before a date.
 *  2. See exactly how many records will move (server dry run for the date mode).
 *  3. Optionally record why (kept on each record and in the audit log).
 *  4. Confirm. Records leave the working list and due tracking; they stay viewable in the Archive tab
 *     and can be unarchived at any time.
 */
export function ArchiveDialog({ open, onClose, selectedIds, onArchived }: {
  open: boolean;
  onClose: () => void;
  selectedIds: number[];
  onArchived: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("before");
  const [before, setBefore] = useState(defaultCutoff);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(selectedIds.length ? "selected" : "before");
    setReason("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useQuery({
    queryKey: ["maintenance", "archive-preview", before],
    queryFn: () => api.post<{ count: number }>("/maintenance/archive", { before, dryRun: true }),
    enabled: open && mode === "before" && !!before,
    staleTime: 0,
  });
  const count = mode === "selected" ? selectedIds.length : preview.data?.count ?? 0;

  const archive = useMutation({
    mutationFn: () => api.post<{ count: number }>("/maintenance/archive",
      mode === "selected" ? { ids: selectedIds, reason } : { before, reason }),
    onSuccess: ({ count: n }) => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`${n} record${n === 1 ? "" : "s"} moved to the archive`);
      onArchived();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal open={open} onClose={onClose} size="md" icon={<Archive className="h-5 w-5" />} title="Archive PM records"
      description="Close out finished records without deleting them."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={<Archive className="h-4 w-4" />} loading={archive.isPending}
          disabled={!count || (mode === "before" && (preview.isFetching || !before))} onClick={() => archive.mutate()}>
          {count ? `Archive ${count} record${count === 1 ? "" : "s"}` : "Nothing to archive"}
        </Button>
      </>}>
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[13px] font-medium text-muted">1 · What to archive</div>
          {selectedIds.length > 0 && (
            <div className="mb-3">
              <Segmented layoutId="archive-mode" value={mode} onChange={setMode} options={[
                { value: "selected", label: <span className="inline-flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />Selected ({selectedIds.length})</span> },
                { value: "before", label: <span className="inline-flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5" />By date</span> },
              ]} />
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {mode === "selected" ? (
              <motion.p key="sel" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-surface-2 p-3 text-sm text-ink">
                The <b>{selectedIds.length}</b> record{selectedIds.length === 1 ? "" : "s"} you ticked in the list.
              </motion.p>
            ) : (
              <motion.div key="date" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Field label="Every active record performed before" hint="Records performed on this date or later stay active.">
                  <Input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className="w-[200px]" />
                </Field>
                <div className={cn("mt-3 flex items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                  count ? "border-accent/40 bg-accent-soft text-ink" : "border-line bg-surface-2 text-muted")}>
                  <motion.span key={preview.data?.count ?? "x"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="font-display text-2xl font-bold tabular-nums text-ink">
                    {preview.isFetching ? "…" : preview.isError ? "!" : count}
                  </motion.span>
                  <span>{preview.isError ? errorMessage(preview.error) : <>record{count === 1 ? "" : "s"} performed before <b>{fmtDate(before)}</b> will be archived.</>}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div>
          <Field label="2 · Reason (optional)" hint="Saved on each record and in the audit log.">
            <Input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Year-end close-out" />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  reason === r ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-muted hover:border-line-strong hover:text-ink")}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-medium text-muted">3 · What happens</div>
          <ul className="space-y-2 text-sm text-ink">
            <li className="flex gap-2.5"><EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-faint" />Leaves the active list and stops counting as overdue or due soon.</li>
            <li className="flex gap-2.5"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-faint" />Becomes read-only — still viewable, printable and exportable from the Archive tab.</li>
            <li className="flex gap-2.5"><LineChart className="mt-0.5 h-4 w-4 shrink-0 text-faint" />Still counts in history: monthly trend and Top Performers.</li>
            <li className="flex gap-2.5"><Archive className="mt-0.5 h-4 w-4 shrink-0 text-faint" />Can be unarchived at any time by an administrator.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
