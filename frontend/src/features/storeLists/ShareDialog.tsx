import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Search, Share2, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Page, SharedUser, User } from "@/types";

/** Admin dialog: choose which (non-admin) users can view and edit a store list. */
export function ShareDialog({ list, onClose }: { list: { id: number; fileName: string | null } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const users = useQuery({
    queryKey: ["users", "share-picker"],
    queryFn: () => api.get<Page<User>>("/users", { pageSize: 200 }),
    enabled: !!list,
    staleTime: 60_000,
  });
  const current = useQuery({
    queryKey: ["/store-lists", list?.id, "shares"],
    queryFn: () => api.get<SharedUser[]>(`/store-lists/${list!.id}/shares`),
    enabled: !!list,
  });
  useEffect(() => {
    if (current.data) setSelected(new Set(current.data.map((u) => u.id)));
  }, [current.data]);
  useEffect(() => { if (!list) setQ(""); }, [list]);

  // Admins already see every store list, and inactive users can't sign in.
  const candidates = useMemo(() => (users.data?.items ?? []).filter((u) => u.role !== "admin" && u.isActive), [users.data]);
  const shown = candidates.filter((u) => `${u.fullName ?? ""} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));

  const save = useMutation({
    mutationFn: () => api.put<SharedUser[]>(`/store-lists/${list!.id}/shares`, { userIds: [...selected] }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/store-lists"] });
      toast.success(res.length ? `Shared with ${res.length} user${res.length > 1 ? "s" : ""}` : "Sharing removed — admins only");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const loading = users.isLoading || current.isLoading;

  return (
    <Modal open={!!list} onClose={onClose} size="md" icon={<Share2 className="h-5 w-5" />}
      title="Share store list" description={list?.fileName ?? undefined}
      footer={<>
        <span className="mr-auto self-center text-xs text-muted">{selected.size} selected</span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} disabled={loading} onClick={() => save.mutate()}>Save sharing</Button>
      </>}>
      <div className="mb-3 flex gap-2.5 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
        <span>Store lists are visible to administrators only. Users you select here can <b className="text-ink">view, edit and print</b> this list. They can't delete it or share it further.</span>
      </div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" />
      </div>
      {loading ? (
        <div className="space-y-2 py-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />)}</div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center text-sm text-muted">
          <Users className="mb-2 h-8 w-8 text-faint" />No active non-admin users yet. Add users under Administration → Users.
        </div>
      ) : (
        <ul className="max-h-[320px] space-y-1 overflow-y-auto">
          {shown.map((u, i) => {
            const on = selected.has(u.id);
            return (
              <motion.li key={u.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.2) }}>
                <button type="button" onClick={() => toggle(u.id)} aria-pressed={on}
                  className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                    on ? "border-accent/50 bg-accent-soft" : "border-transparent hover:bg-surface-2")}>
                  <Avatar name={u.fullName ?? u.email} className="h-8 w-8 text-[11px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{u.fullName ?? u.email}</span>
                    <span className="block truncate text-xs text-muted">{u.email}</span>
                  </span>
                  <span onClick={(e) => e.stopPropagation()}><Checkbox checked={on} onChange={() => toggle(u.id)} /></span>
                </button>
              </motion.li>
            );
          })}
          {shown.length === 0 && <li className="py-6 text-center text-sm text-muted">No users match "{q}".</li>}
        </ul>
      )}
    </Modal>
  );
}
