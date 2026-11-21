import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Film, Images, RotateCcw, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState, Pagination, SearchInput } from "@/components/ui/Data";
import { useDialogs } from "@/components/ui/Modal";
import { Card, PageHeader, Segmented } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { cn, fmtBytes, fmtDate, fmtDateTime } from "@/lib/utils";
import type { Page, Upload } from "@/types";

const PAGE_SIZE = 24;

function Lightbox({ items, index, onClose, onIndex }: { items: Upload[]; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  const u = index !== null ? items[index] : null;
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(items.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);
  return createPortal(
    <AnimatePresence>
      {u && (
        <motion.div className="fixed inset-0 z-50 flex flex-col bg-slate-950/92 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 text-slate-200">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{u.originalName}</div>
              <div className="truncate text-xs text-slate-400">
                {u.record ? `${u.record.branchName ?? u.record.branchCode ?? ""} · ${u.record.task ?? ""}` : "Not linked to a record"} · {fmtBytes(u.sizeBytes)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <a href={`${u.url}?download=true`} className="rounded-lg p-2 hover:bg-white/10" aria-label="Download"><Download className="h-5 w-5" /></a>
              <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-14 pb-8">
            <button disabled={index === 0} onClick={() => onIndex(index! - 1)} className="absolute left-3 rounded-full bg-white/10 p-2.5 text-white disabled:opacity-20" aria-label="Previous"><ChevronLeft className="h-6 w-6" /></button>
            <AnimatePresence mode="wait">
              <motion.div key={u.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="flex max-h-full max-w-full items-center justify-center">
                {u.contentType?.startsWith("video") ? (
                  <video src={u.url} controls autoPlay className="max-h-[80vh] max-w-full rounded-xl" />
                ) : (
                  <img src={u.url} alt={u.originalName} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
                )}
              </motion.div>
            </AnimatePresence>
            <button disabled={index === items.length - 1} onClick={() => onIndex(index! + 1)} className="absolute right-3 rounded-full bg-white/10 p-2.5 text-white disabled:opacity-20" aria-label="Next"><ChevronRight className="h-6 w-6" /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function UploadsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { confirm } = useDialogs();
  const [view, setView] = useState<"active" | "trash">("active");
  const [kind, setKind] = useState<"" | "image" | "video">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [view, kind, q]);
  const params = { deleted: view === "trash" || undefined, kind, q, page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: ["uploads", params], queryFn: () => api.get<Page<Upload>>("/uploads", params), placeholderData: keepPreviousData });
  const items = list.data?.items ?? [];

  const refresh = () => { qc.invalidateQueries({ queryKey: ["uploads"] }); qc.invalidateQueries({ queryKey: ["maintenance"] }); setSelected(new Set()); };
  const trash = useMutation({ mutationFn: async (ids: number[]) => { for (const id of ids) await api.del(`/uploads/${id}`); }, onSuccess: () => { refresh(); toast.success("Moved to trash"); }, onError: (e) => toast.error(errorMessage(e)) });
  const restore = useMutation({ mutationFn: (ids: number[]) => api.post("/uploads/restore", { ids }), onSuccess: () => { refresh(); toast.success("Restored"); }, onError: (e) => toast.error(errorMessage(e)) });
  const purge = useMutation({ mutationFn: (ids: number[]) => api.post("/uploads/purge", { ids }), onSuccess: () => { refresh(); toast.success("Permanently deleted"); }, onError: (e) => toast.error(errorMessage(e)) });

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sel = [...selected];

  return (
    <div>
      <PageHeader title="Photos & Videos" subtitle="Evidence attached to maintenance records." icon={<Images className="h-6 w-6" />} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Segmented layoutId="uploads-view" value={view} onChange={setView} options={[{ value: "active", label: "Gallery" }, { value: "trash", label: "Trash" }]} />
          <Segmented layoutId="uploads-kind" value={kind} onChange={setKind} options={[{ value: "", label: "All" }, { value: "image", label: "Photos" }, { value: "video", label: "Videos" }]} />
          <SearchInput className="min-w-[220px] flex-1" value={q} onChange={setQ} placeholder="Branch code, file name or task…" />
        </div>
        <AnimatePresence>
          {sel.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-line bg-accent-soft">
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="mr-auto text-sm font-semibold text-ink">{sel.length} selected</span>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                {view === "active" ? (
                  <Button size="sm" variant="secondary" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => trash.mutate(sel)}>Move to trash</Button>
                ) : (<>
                  <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restore.mutate(sel)}>Restore</Button>
                  {isAdmin && <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={async () => { if (await confirm({ title: `Permanently delete ${sel.length} file(s)?`, message: "The files are removed from storage. This can't be undone.", confirmLabel: "Delete forever", danger: true })) purge.mutate(sel); }}>Delete forever</Button>}
                </>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {list.isLoading ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-sunken" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={view === "trash" ? "Trash is empty" : "No uploads yet"} message={view === "trash" ? "Deleted files appear here until restored or purged." : "Attach photos or videos from a PM record's actions menu."} />
        ) : (
          <motion.div layout className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <AnimatePresence>
              {items.map((u, i) => {
                const isSel = selected.has(u.id);
                return (
                  <motion.div key={u.id} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: i * 0.015 }}
                    className={cn("group relative overflow-hidden rounded-xl border bg-surface transition", isSel ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-line-strong")}>
                    <button onClick={() => setLightbox(i)} className="block aspect-square w-full overflow-hidden bg-sunken">
                      {u.contentType?.startsWith("video") ? (
                        <div className="relative h-full w-full">
                          <video src={u.url} preload="metadata" muted className="h-full w-full object-cover" />
                          <span className="absolute inset-0 grid place-items-center bg-black/25"><Film className="h-7 w-7 text-white drop-shadow" /></span>
                        </div>
                      ) : (
                        <img src={u.url} alt={u.originalName} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      )}
                    </button>
                    <label className="absolute left-2 top-2 grid h-6 w-6 cursor-pointer place-items-center rounded-md bg-white/90 opacity-0 shadow transition group-hover:opacity-100 data-[on=true]:opacity-100" data-on={isSel}>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(u.id)} className="accent-amber-500" aria-label={`Select ${u.originalName}`} />
                    </label>
                    <div className="px-2.5 py-2">
                      <div className="truncate text-xs font-semibold text-ink">{u.record?.branchCode ?? u.record?.branchName ?? "Unlinked"}</div>
                      <div className="truncate text-[11px] text-muted">
                        {view === "trash" ? `Deleted ${fmtDateTime(u.deletedAt)}${u.deletedByName ? ` by ${u.deletedByName}` : ""}` : `${fmtDate(u.uploadedAt.slice(0, 10))} · ${fmtBytes(u.sizeBytes)}`}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={setPage} />
      </Card>
      <Lightbox items={items} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
    </div>
  );
}
