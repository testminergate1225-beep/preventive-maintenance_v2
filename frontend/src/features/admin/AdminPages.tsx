import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, ScrollText, Send, ShieldCheck, UserPlus, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState, Pagination, rowMotion, SearchInput, Table, TableSkeleton } from "@/components/ui/Data";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal, useDialogs } from "@/components/ui/Modal";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import type { AuditEntry, Page, User } from "@/types";

type Invite = { message: string; emailed: boolean; link: string | null };

const createSchema = z.object({
  email: z.email("Enter a valid e-mail"),
  fullName: z.string().trim().min(1, "Required").max(255),
  role: z.enum(["user", "admin"]),
  mode: z.enum(["invite", "password"]),
  password: z.string(),
}).refine((v) => v.mode === "invite" || v.password.length >= 8, { path: ["password"], message: "At least 8 characters" });

function InviteResult({ invite, onClose }: { invite: Invite | null; onClose: () => void }) {
  return (
    <Modal open={!!invite} onClose={onClose} size="md" icon={invite?.emailed ? <Mail className="h-5 w-5" /> : <Send className="h-5 w-5" />}
      title={invite?.emailed ? "Invite sent" : "Share this link"} footer={<Button onClick={onClose}>Done</Button>}>
      <p className="text-sm text-muted">{invite?.message}</p>
      {invite?.link && (
        <div className="mt-3 flex gap-2">
          <Input readOnly value={invite.link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => { navigator.clipboard.writeText(invite.link!); toast.success("Link copied"); }}>Copy</Button>
        </div>
      )}
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { confirm } = useDialogs();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const list = useQuery({ queryKey: ["users", q, page], queryFn: () => api.get<Page<User>>("/users", { q, page, pageSize: 50 }), placeholderData: keepPreviousData });
  const form = useForm({ resolver: zodResolver(createSchema), defaultValues: { email: "", fullName: "", role: "user" as const, mode: "invite" as const, password: "" } });

  const sendInvite = useMutation({
    mutationFn: (id: number) => api.post<Invite>(`/users/${id}/invite`),
    onSuccess: (r) => { setInvite(r); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Pick<User, "role" | "isActive">> }) => api.patch<User>(`/users/${id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("User updated"); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const create = form.handleSubmit(async (v) => {
    try {
      const u = await api.post<User>("/users", { email: v.email, fullName: v.fullName, role: v.role, password: v.mode === "password" ? v.password : undefined });
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      form.reset();
      if (v.mode === "invite") sendInvite.mutate(u.id);
      else toast.success(`${u.email} can now sign in`);
    } catch (e) { toast.error(errorMessage(e)); }
  });

  const items = list.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Users" subtitle="Who can access the system, and what they can do." icon={<Users className="h-6 w-6" />}
        actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add user</Button>} />
      <Card>
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name or e-mail…" className="max-w-md" /></div>
        {list.isLoading ? <TableSkeleton cols={5} /> : items.length === 0 ? <EmptyState title="No users found" /> : (
          <>
            <Table head={<><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></>}>
              <AnimatePresence initial={false}>
                {items.map((u) => (
                  <motion.tr key={u.id} {...rowMotion}>
                    <td><div className="flex items-center gap-3"><Avatar name={u.fullName ?? u.email} /><div><div className="font-medium text-ink">{u.fullName ?? "—"}{u.id === me?.id && <span className="ml-1.5 text-xs text-faint">(you)</span>}</div><div className="text-xs text-muted">{u.email}</div></div></div></td>
                    <td>
                      <Select className="h-8 w-[110px] text-[13px]" value={u.role} disabled={u.id === me?.id}
                        onChange={(e) => update.mutate({ id: u.id, patch: { role: e.target.value as User["role"] } })}>
                        <option value="user">User</option><option value="admin">Admin</option>
                      </Select>
                    </td>
                    <td>
                      {!u.isActive ? <Badge tone="neutral">Deactivated</Badge> : !u.hasPassword ? <Badge tone="warn" dot>Invite pending</Badge> : <Badge tone="ok" dot>Active</Badge>}
                    </td>
                    <td className="text-muted">{fmtDateTime(u.lastLoginAt)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {u.isActive && <Button size="sm" variant="ghost" icon={<Send className="h-3.5 w-3.5" />} loading={sendInvite.isPending && sendInvite.variables === u.id}
                          onClick={() => sendInvite.mutate(u.id)}>{u.hasPassword ? "Reset link" : "Send invite"}</Button>}
                        {u.id !== me?.id && (
                          <Button size="sm" variant="ghost" className={u.isActive ? "hover:text-danger" : ""}
                            onClick={async () => {
                              if (!u.isActive || await confirm({ title: `Deactivate ${u.email}?`, message: "They'll be signed out everywhere and can't sign in until reactivated.", confirmLabel: "Deactivate", danger: true }))
                                update.mutate({ id: u.id, patch: { isActive: !u.isActive } });
                            }}>{u.isActive ? "Deactivate" : "Reactivate"}</Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </Table>
            <Pagination page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} icon={<UserPlus className="h-5 w-5" />} title="Add user"
        footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={form.formState.isSubmitting} onClick={create}>Create user</Button></>}>
        <form onSubmit={create} className="space-y-4" noValidate>
          <Field label="Full name" error={form.formState.errors.fullName?.message}><Input {...form.register("fullName")} /></Field>
          <Field label="E-mail" error={form.formState.errors.email?.message}><Input type="email" {...form.register("email")} /></Field>
          <Field label="Role"><Select {...form.register("role")}><option value="user">User — create & edit records</option><option value="admin">Admin — also delete records & manage users</option></Select></Field>
          <Field label="How should they get a password?">
            <Select {...form.register("mode")}><option value="invite">E-mail them a set-password link (recommended)</option><option value="password">Set an initial password now</option></Select>
          </Field>
          {form.watch("mode") === "password" && (
            <Field label="Initial password" hint="Share it securely; they can change it under Account." error={form.formState.errors.password?.message}>
              <Input type="password" autoComplete="new-password" {...form.register("password")} />
            </Field>
          )}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
      <InviteResult invite={invite} onClose={() => setInvite(null)} />
    </div>
  );
}

const ACTION_TONE = (a: string) => (a.includes("failed") || a.includes("reuse") || a.includes("locked") ? "danger" : a.includes("deleted") || a.includes("purged") ? "warn" : a.startsWith("auth") ? "info" : "neutral") as "danger" | "warn" | "info" | "neutral";

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const list = useQuery({ queryKey: ["audit", page, action], queryFn: () => api.get<Page<AuditEntry>>("/audit", { page, pageSize: 50, action }), placeholderData: keepPreviousData });
  const items = list.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Sign-ins, changes and deletions — newest first." icon={<ScrollText className="h-6 w-6" />} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Select className="w-[220px]" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">All activity</option><option value="auth">Authentication</option><option value="user">User management</option>
            <option value="maintenance">PM records</option><option value="load_balancing">Load balancing</option><option value="megger_test">Megger tests</option>
            <option value="pm_checklist">Checklists</option><option value="store_list">Store lists</option><option value="upload">Uploads</option>
          </Select>
        </div>
        {list.isLoading ? <TableSkeleton cols={5} /> : items.length === 0 ? <EmptyState title="No activity yet" art={<ShieldCheck className="h-16 w-16 text-faint" />} /> : (
          <>
            <Table head={<><th>When</th><th>User</th><th>Action</th><th>Target</th><th>IP</th></>}>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-muted">{fmtDateTime(a.createdAt)}</td>
                  <td><div className="text-ink">{a.userName ?? "—"}</div><div className="text-xs text-muted">{a.userEmail}</div></td>
                  <td><Badge tone={ACTION_TONE(a.action)}>{a.action}</Badge></td>
                  <td className="text-muted">{a.entityType ? `${a.entityType} #${a.entityId ?? ""}` : "—"}
                    {a.details && <div className="max-w-[280px] truncate font-mono text-[11px] text-faint" title={JSON.stringify(a.details)}>{JSON.stringify(a.details)}</div>}</td>
                  <td className="font-mono text-xs text-faint">{a.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
