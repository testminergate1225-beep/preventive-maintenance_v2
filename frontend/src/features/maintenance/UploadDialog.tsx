import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, Film, ImageIcon, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api, errorMessage, uploadWithProgress } from "@/lib/api";
import { cn, fmtBytes } from "@/lib/utils";
import type { MaintenanceRecord, Upload } from "@/types";

type Item = { id: string; file: File; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string; abort?: () => void };

export function UploadDialog({ record, open, onClose }: { record: MaintenanceRecord | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const limits = useQuery({ queryKey: ["upload-limits"], queryFn: () => api.get<{ maxBytes: number; allowedExtensions: string[] }>("/uploads/limits"), staleTime: Infinity });

  const update = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const start = (files: File[]) => {
    const max = limits.data?.maxBytes ?? Infinity;
    const allowed = limits.data?.allowedExtensions ?? [];
    const next: Item[] = files.map((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const id = `${file.name}-${file.size}-${Math.random()}`;
      if (allowed.length && !allowed.includes(ext)) return { id, file, progress: 0, status: "error", error: `.${ext} files aren't allowed` };
      if (file.size > max) return { id, file, progress: 0, status: "error", error: `Larger than ${fmtBytes(max)}` };
      return { id, file, progress: 0, status: "queued" };
    });
    setItems((xs) => [...next, ...xs]);
    for (const it of next.filter((i) => i.status === "queued")) {
      const form = new FormData();
      form.append("file", it.file);
      if (record) form.append("recordId", String(record.id));
      const { promise, abort } = uploadWithProgress<Upload>("/uploads", form, (p) => update(it.id, { progress: p }));
      update(it.id, { status: "uploading", abort });
      promise
        .then(() => {
          update(it.id, { status: "done", progress: 100 });
          qc.invalidateQueries({ queryKey: ["uploads"] });
          qc.invalidateQueries({ queryKey: ["maintenance"] });
        })
        .catch((e) => update(it.id, { status: "error", error: errorMessage(e) }));
    }
  };

  const close = () => {
    if (items.some((i) => i.status === "uploading")) return; // don't lose in-flight uploads
    setItems([]);
    onClose();
  };
  const busy = items.some((i) => i.status === "uploading");

  return (
    <Modal open={open} onClose={close} size="md" icon={<CloudUpload className="h-5 w-5" />} title="Attach photos & videos"
      description={record ? `${record.task} · ${record.branchName ?? record.branchCode ?? ""}` : undefined}
      footer={<Button variant="secondary" onClick={close} disabled={busy}>{busy ? "Uploading…" : "Done"}</Button>}>
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); start(Array.from(e.dataTransfer.files)); }}
        onClick={() => input.current?.click()}
        animate={{ scale: drag ? 1.02 : 1, borderColor: drag ? "var(--app-accent)" : "var(--app-border-strong)" }}
        className={cn("flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "bg-accent-soft" : "bg-surface-2 hover:bg-sunken")}
      >
        <motion.div animate={{ y: drag ? -6 : [0, -4, 0] }} transition={drag ? {} : { duration: 2.4, repeat: Infinity }}>
          <CloudUpload className="h-10 w-10 text-accent-strong" />
        </motion.div>
        <div className="mt-3 text-sm font-semibold text-ink">Drop files here or click to browse</div>
        <div className="mt-1 text-xs text-muted">
          Images & videos{limits.data ? ` · up to ${fmtBytes(limits.data.maxBytes)} each` : ""}
        </div>
        <input ref={input} type="file" multiple accept="image/*,video/*" className="hidden"
          onChange={(e) => { start(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </motion.div>

      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.li key={it.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunken text-muted">
                {it.file.type.startsWith("video") ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium text-ink">{it.file.name}</span>
                  <span className="shrink-0 text-muted">{fmtBytes(it.file.size)}</span>
                </div>
                {it.status === "error" ? (
                  <div className="text-xs font-medium text-danger">{it.error}</div>
                ) : (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <motion.div className={cn("h-full rounded-full", it.status === "done" ? "bg-ok" : "bg-accent")} animate={{ width: `${it.progress}%` }} />
                  </div>
                )}
              </div>
              {it.status === "uploading" && (
                <button onClick={() => it.abort?.()} className="rounded p-1 text-faint hover:text-danger" aria-label="Cancel upload"><X className="h-4 w-4" /></button>
              )}
              {it.status === "done" && <CheckCircle2 className="h-5 w-5 text-ok" />}
              {it.status === "error" && <XCircle className="h-5 w-5 text-danger" />}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Modal>
  );
}
