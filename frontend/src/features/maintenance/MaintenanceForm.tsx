import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Save, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { CrewPicker } from "@/components/ui/CrewPicker";
import { ComboSelect, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { BRANCHES, EQUIPMENT, STATUSES } from "@/config/options";
import { api, ApiError, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/utils";
import type { MaintenanceInput, MaintenanceRecord } from "@/types";

const schema = z
  .object({
    branchCode: z.string().max(100),
    branchName: z.string().max(255),
    location: z.string().max(255),
    equipment: z.string().max(255),
    task: z.string().trim().min(1, "Describe the maintenance task").max(5000),
    status: z.string().max(50),
    performedBy: z.string().max(255),
    verifiedBy: z.string().max(255),
    performedOn: z.string().min(1, "Pick the date the work was performed"),
    nextDue: z.string(),
    notes: z.string().max(10000),
  })
  .refine((v) => !v.nextDue || !v.performedOn || v.nextDue >= v.performedOn, { path: ["nextDue"], message: "Next due should be after the performed date" });

const empty = (): MaintenanceInput => ({
  branchCode: "", branchName: "", location: "", equipment: EQUIPMENT[0].value, task: "", status: STATUSES[0], performedBy: "",
  verifiedBy: "", performedOn: todayISO(), nextDue: "", notes: "",
});

function toInput(r: MaintenanceRecord): MaintenanceInput {
  return {
    branchCode: r.branchCode ?? "", branchName: r.branchName ?? "", location: r.location ?? "", equipment: r.equipment ?? "",
    task: r.task, status: r.status ?? "", performedBy: r.performedBy ?? "", verifiedBy: r.verifiedBy ?? "",
    performedOn: r.performedOn ?? "", nextDue: r.nextDue ?? "", notes: r.notes ?? "",
  };
}

export function MaintenanceForm({ open, record, onClose }: { open: boolean; record: MaintenanceRecord | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!record;
  const form = useForm<MaintenanceInput>({ resolver: zodResolver(schema), defaultValues: empty() });
  const { register, handleSubmit, control, reset, formState: { errors } } = form;
  const [pending, setPending] = useState<MaintenanceInput | null>(null);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (open) reset(record ? toInput(record) : empty());
  }, [open, record, reset]);

  const save = useMutation({
    mutationFn: (v: MaintenanceInput) => (editing ? api.put<MaintenanceRecord>(`/maintenance/${record!.id}`, v) : api.post<MaintenanceRecord>("/maintenance", v)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(editing ? "Record updated" : "Record added");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // New records require re-entering the password (kept from the original app's workflow).
  const verify = useMutation({
    mutationFn: () => api.post("/auth/verify-password", { password }),
    onSuccess: () => {
      const v = pending!;
      setPending(null);
      setPassword("");
      save.mutate(v);
    },
    onError: (e) => setPwError(e instanceof ApiError && e.status === 401 ? "Incorrect password. Please try again." : errorMessage(e)),
  });

  const onSubmit = handleSubmit((v) => {
    if (editing) save.mutate(v);
    else {
      setPwError(null);
      setPending(v);
    }
  });

  return (
    <>
      <Modal open={open && !pending} onClose={onClose} size="lg" icon={<Wrench className="h-5 w-5" />}
        title={editing ? "Edit maintenance record" : "Record maintenance"}
        description={editing ? `Record #${record!.id}` : "Log work performed on site."}
        footer={<>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} loading={save.isPending} icon={<Save className="h-4 w-4" />}>{editing ? "Save changes" : "Add record"}</Button>
        </>}>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Branch name">
            <Controller control={control} name="branchName" render={({ field }) => <ComboSelect value={field.value} onChange={field.onChange} options={BRANCHES} customLabel="Custom name…" />} />
          </Field>
          <Field label="Branch code" error={errors.branchCode?.message}><Input placeholder="e.g. TW-01" {...register("branchCode")} /></Field>
          <Field label="Location" className="sm:col-span-2"><Input placeholder="Mall / building / address" {...register("location")} /></Field>
          <Field label="Equipment">
            <Select {...register("equipment")}>
              {EQUIPMENT.map((e) => <option key={e.value + e.label} value={e.value}>{e.label}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select {...register("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
          </Field>
          <Field label="Task" required error={errors.task?.message} className="sm:col-span-2">
            <Input placeholder="Describe the maintenance task" invalid={!!errors.task} {...register("task")} />
          </Field>
          <Field label="Performed on" required error={errors.performedOn?.message}><Input type="date" {...register("performedOn")} /></Field>
          <Field label="Next due" hint="Optional — drives the dashboard reminders" error={errors.nextDue?.message}>
            <Input type="date" invalid={!!errors.nextDue} {...register("nextDue")} />
          </Field>
          <Field label="Performed by" hint="One person, or a crew of up to 4 — the first selected is listed first." className="sm:col-span-2">
            <Controller control={control} name="performedBy" render={({ field }) => <CrewPicker value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Verified by"><Input placeholder="Verifier / officer in-charge" {...register("verifiedBy")} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea placeholder="Observations, measurements, parts replaced…" {...register("notes")} /></Field>
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <Modal open={!!pending} onClose={() => { setPending(null); setPassword(""); }} size="sm" icon={<ShieldCheck className="h-5 w-5" />}
        title="Confirm it's you" description="Enter your password to add this record."
        footer={<>
          <Button variant="secondary" onClick={() => { setPending(null); setPassword(""); }}>Back</Button>
          <Button onClick={() => verify.mutate()} loading={verify.isPending || save.isPending} disabled={!password}>Confirm & save</Button>
        </>}>
        <form onSubmit={(e) => { e.preventDefault(); if (password) verify.mutate(); }}>
          <Field label="Password" error={pwError ?? undefined}>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input autoFocus type="password" autoComplete="current-password" className="pl-9" value={password} invalid={!!pwError}
                onChange={(e) => { setPassword(e.target.value); setPwError(null); }} />
            </div>
          </Field>
        </form>
      </Modal>
    </>
  );
}
