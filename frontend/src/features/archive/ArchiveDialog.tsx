import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarRange, EyeOff, LineChart, ListChecks, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal, useDialogs } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { cn, fmtDate } from "@/lib/utils";

type Mode = "selected" | "before";
const REASONS = ["Year-end close-out", "Superseded by a newer record", "Branch closed", "Duplicate entry"];

/** Jan 1 of this year — i.e. archive everything from previous years (the usual year-end close-out). */
const defaultCutoff = () => `${new Date().getFullYear()}-01-01`;

/** What a record type calls itself in the archive flow. */
export interface ArchiveKind {
  /** API collection, e.g. "/load-balancing". */
  endpoint: string;
  /** Query key prefix to refresh after a change (defaults to the endpoint). */
  queryKey?: string;
  /** Plural noun, e.g. "load balancing records". */
  noun: string;
  /** Past-tense verb for the record's date, e.g. "tested", "performed", "dated". */
  dateVerb: string;
  /** What the record stops counting towards while archived. */
  leaves: string;
  /** Where it still counts, if anywhere. */
  history?: string;
}

export const plural = (n: number, noun: string) => `${n} ${n === 1 ? noun.replace(/s$/, "") : noun}`;

/**
 * Archive flow (admins):
 *  1. Choose what to archive — the records ticked in the list, or everything dated before a cutoff.
 *  2. See exactly how many records will move (server dry run for the date mode).
 *  3. Optionally record why (kept on each record and in the audit log).
 *  4. Confirm. Records leave the working list; they stay viewable (read-only) in the Archive tab
 *     and can be unarchived at any time.
 */
export function ArchiveDialog({ kind, open, onClose, selectedIds, onArchived }: {
  kind: ArchiveKind;
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
    queryKey: [kind.queryKey ?? kind.endpoint, "archive-preview", before],
    queryFn: () => api.post<{ count: number }>(`${kind.endpoint}/archive`, { before, dryRun: true }),
    enabled: open && mode === "before" && !!before,
    staleTime: 0,
  });
  const count = mode === "selected" ? selectedIds.length : preview.data?.count ?? 0;

  const archive = useMutation({
    mutationFn: () => api.post<{ count: number }>(`${kind.endpoint}/archive`,
      mode === "selected" ? { ids: selectedIds, reason } : { before, reason }),
    onSuccess: ({ count: n }) => {
      qc.invalidateQueries({ queryKey: [kind.queryKey ?? kind.endpoint] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`${plural(n, kind.noun)} moved to the archive`);
      onArchived();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const title = kind.noun.charAt(0).toUpperCase() + kind.noun.slice(1);
  return (
    <Modal open={open} onClose={onClose} size="md" icon={<Archive className="h-5 w-5" />} title={`Archive ${title.toLowerCase()}`}
      description="Close out finished records without deleting them."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={<Archive className="h-4 w-4" />} loading={archive.isPending}
          disabled={!count || (mode === "before" && (preview.isFetching || !before))} onClick={() => archive.mutate()}>
          {count ? `Archive ${plural(count, "records")}` : "Nothing to archive"}
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
                The <b>{plural(selectedIds.length, kind.noun)}</b> you ticked in the list.
              </motion.p>
            ) : (
              <motion.div key="date" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Field label={`Every active record ${kind.dateVerb} before`} hint={`Records ${kind.dateVerb} on this date or later stay active. Undated records use the day they were created.`}>
                  <Input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className="w-[200px]" />
                </Field>
                <div className={cn("mt-3 flex items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                  count ? "border-accent/40 bg-accent-soft text-ink" : "border-line bg-surface-2 text-muted")}>
                  <motion.span key={preview.data?.count ?? "x"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="font-display text-2xl font-bold tabular-nums text-ink">
                    {preview.isFetching ? "…" : preview.isError ? "!" : count}
                  </motion.span>
                  <span>{preview.isError ? errorMessage(preview.error) : <>{count === 1 ? kind.noun.replace(/s$/, "") : kind.noun} {kind.dateVerb} before <b>{fmtDate(before)}</b> will be archived.</>}</span>
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
            <li className="flex gap-2.5"><EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-faint" />{kind.leaves}</li>
            <li className="flex gap-2.5"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-faint" />Becomes read-only — still viewable and printable from the Archive tab.</li>
            {kind.history && <li className="flex gap-2.5"><LineChart className="mt-0.5 h-4 w-4 shrink-0 text-faint" />{kind.history}</li>}
            <li className="flex gap-2.5"><Archive className="mt-0.5 h-4 w-4 shrink-0 text-faint" />Can be unarchived at any time by an administrator.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

/** Unarchive one record from its editor (asks first), then refresh that record and its list. */
export function useUnarchive(endpoint: string, id: number) {
  const qc = useQueryClient();
  const { confirm } = useDialogs();
  const m = useMutation({
    mutationFn: () => api.post<{ count: number }>(`${endpoint}/unarchive`, { ids: [id] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoint] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Unarchived — the record is editable again");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return async () => {
    if (await confirm({ title: "Unarchive this record?", message: "It returns to the active list and becomes editable again.", confirmLabel: "Unarchive" }))
      m.mutate();
  };
}

/** Small read-only notice for editors/detail views of an archived record. */
export function ArchivedNotice({ archivedAt, archivedByName, archiveReason, canUnarchive, onUnarchive, extra }: {
  archivedAt: string; archivedByName?: string | null; archiveReason?: string | null;
  canUnarchive?: boolean; onUnarchive?: () => void; extra?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="no-print mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunken text-muted"><Lock className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">Archived · read-only</div>
        <div className="text-muted">
          {fmtDate(archivedAt.slice(0, 10))}{archivedByName ? ` by ${archivedByName}` : ""}
          {archiveReason ? <> — “{archiveReason}”</> : null}
        </div>
        <div className="mt-0.5 text-xs text-faint">{extra ? `${extra} ` : ""}{canUnarchive ? "Unarchive it to make changes." : "An administrator can unarchive it."}</div>
      </div>
      {canUnarchive && onUnarchive && <Button size="sm" variant="secondary" onClick={onUnarchive}>Unarchive</Button>}
    </motion.div>
  );
}
