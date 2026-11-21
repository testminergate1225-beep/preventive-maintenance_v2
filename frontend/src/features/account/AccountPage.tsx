import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Save, ShieldCheck, UserCog } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import type { User } from "@/types";

const pwSchema = z
  .object({ currentPassword: z.string().min(1, "Required"), newPassword: z.string().min(8, "At least 8 characters").max(128), confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password" });

export function AccountPage() {
  const { user, setUser } = useAuth();
  const profile = useForm({ resolver: zodResolver(z.object({ fullName: z.string().trim().min(1, "Required").max(255) })), values: { fullName: user?.fullName ?? "" } });
  const pw = useForm({ resolver: zodResolver(pwSchema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });

  const saveProfile = profile.handleSubmit(async (v) => {
    try { setUser(await api.patch<User>("/auth/me", v)); toast.success("Profile updated"); } catch (e) { toast.error(errorMessage(e)); }
  });
  const changePw = pw.handleSubmit(async (v) => {
    try {
      const res = await api.post<{ user: User }>("/auth/change-password", { currentPassword: v.currentPassword, newPassword: v.newPassword });
      setUser(res.user);
      pw.reset();
      toast.success("Password changed. Other devices have been signed out.");
    } catch (e) { toast.error(errorMessage(e)); }
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Account" subtitle="Your profile and sign-in security." icon={<UserCog className="h-6 w-6" />} />
      <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
  <div className="flex items-center gap-4 min-w-0 flex-1">
    <Avatar
      name={user?.fullName ?? user?.email}
      className="h-14 w-14 text-lg shrink-0"
    />

    <div className="min-w-0 flex-1">
      <div className="font-display text-lg font-bold text-ink truncate">
        {user?.fullName}
      </div>
      <div className="text-sm text-muted truncate">
        {user?.email}
      </div>
    </div>
  </div>

  <div className="text-left sm:text-right shrink-0">
    <Badge
      tone={user?.role === "admin" ? "warn" : "info"}
      className="capitalize"
    >
      {user?.role}
    </Badge>

    <div className="mt-1 text-xs text-muted break-words">
      Last sign-in {fmtDateTime(user?.lastLoginAt)}
    </div>
  </div>
</Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Profile" icon={<UserCog className="h-[18px] w-[18px]" />} />
          <form onSubmit={saveProfile} className="space-y-4 p-5">
            <Field label="Full name" error={profile.formState.errors.fullName?.message}><Input {...profile.register("fullName")} /></Field>
            <Field label="E-mail" hint="Ask an administrator to change your e-mail."><Input value={user?.email ?? ""} disabled /></Field>
            <Button type="submit" loading={profile.formState.isSubmitting} icon={<Save className="h-4 w-4" />}>Save</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Change password" icon={<KeyRound className="h-[18px] w-[18px]" />} />
          <form onSubmit={changePw} className="space-y-4 p-5" noValidate>
            <Field label="Current password" error={pw.formState.errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...pw.register("currentPassword")} /></Field>
            <Field label="New password" error={pw.formState.errors.newPassword?.message}><Input type="password" autoComplete="new-password" {...pw.register("newPassword")} /></Field>
            <Field label="Confirm new password" error={pw.formState.errors.confirm?.message}><Input type="password" autoComplete="new-password" {...pw.register("confirm")} /></Field>
            <Button type="submit" loading={pw.formState.isSubmitting} icon={<ShieldCheck className="h-4 w-4" />}>Update password</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
