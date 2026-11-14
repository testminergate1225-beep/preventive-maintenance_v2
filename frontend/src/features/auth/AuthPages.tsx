import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { GearCluster } from "@/components/graphics/Gear";
import { MaintenanceScene } from "@/components/graphics/Illustrations";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { api, ApiError, errorMessage } from "@/lib/api";

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden bg-[#0b1220] lg:block">
        <MaintenanceScene />
      </div>
      <div className="blueprint flex items-center justify-center px-5 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0b1220] shadow-lg"><GearCluster size={32} /></div>
            <div>
              <div className="font-display text-xl font-bold text-ink">EPM System</div>
              <div className="text-xs text-muted">Electrical Preventive Maintenance</div>
            </div>
          </div>
          <div className="rounded-3xl border border-line bg-surface/95 p-7 shadow-pop backdrop-blur">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <Input {...props} type={show ? "text" : "password"} className="pl-9 pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-faint hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Alert({ tone, children }: { tone: "danger" | "ok"; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      className={tone === "danger" ? "rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" : "rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm font-medium text-ok"}>
      {children}
    </motion.div>
  );
}

// ─────────────────────────────── Login ───────────────────────────────

const loginSchema = z.object({
  email: z.email("Enter a valid e-mail address"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean(),
});

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shake = useAnimationControls();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setValue, watch } = useForm({
    resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "", remember: false },
  });
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const u = await login(v.email, v.password, v.remember);
      toast.success(`Welcome back, ${u.fullName?.split(" ")[0] ?? "there"}!`);
      navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
    }
  });

  return (
    <AuthLayout>
      <motion.div animate={shake}>
        <h1 className="font-display text-2xl font-bold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Use your work e-mail and password.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <AnimatePresence>{error && <Alert tone="danger">{error}</Alert>}</AnimatePresence>
          <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input id="email" type="email" autoComplete="username" autoFocus className="pl-9" invalid={!!formState.errors.email} {...register("email")} />
            </div>
          </Field>
          <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
            <PasswordInput id="password" autoComplete="current-password" invalid={!!formState.errors.password} {...register("password")} />
          </Field>
          <div className="flex items-center justify-between">
            <Checkbox checked={watch("remember")} onChange={(v) => setValue("remember", v)} label="Keep me signed in" />
            <Link to="/forgot-password" className="text-sm font-semibold text-accent-strong hover:underline">Forgot password?</Link>
          </div>
          <Button type="submit" size="lg" className="w-full justify-center" loading={formState.isSubmitting}>Sign in</Button>
        </form>
        <div className="mt-6 flex gap-2.5 rounded-xl border border-dashed border-line-strong bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
          <span>
            <b className="text-ink">First sign-in since the system upgrade?</b> Passwords weren't carried over from the old login.
            Use <Link to="/forgot-password" className="font-semibold text-accent-strong hover:underline">Forgot password</Link> to set a new one.
          </span>
        </div>
      </motion.div>
    </AuthLayout>
  );
}

// ─────────────────────────── Forgot password ───────────────────────────

export function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(z.object({ email: z.email("Enter a valid e-mail address") })), defaultValues: { email: "" },
  });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(email);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div key="sent" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}
              className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok">
              <Mail className="h-8 w-8" />
            </motion.div>
            <h1 className="mt-5 font-display text-2xl font-bold text-ink">Check your inbox</h1>
            <p className="mt-2 text-sm text-muted">
              If an account exists for <b className="text-ink">{sent}</b>, we've sent a link to reset your password. It expires in 45 minutes and works once.
            </p>
            <p className="mt-3 text-xs text-faint">Didn't get it? Check spam, or try again in a few minutes.</p>
            <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0, x: -20 }}>
            <h1 className="font-display text-2xl font-bold text-ink">Reset your password</h1>
            <p className="mt-1 text-sm text-muted">Enter your e-mail and we'll send you a secure, time-limited link.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <AnimatePresence>{error && <Alert tone="danger">{error}</Alert>}</AnimatePresence>
              <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
                <Input id="email" type="email" autoFocus autoComplete="email" invalid={!!formState.errors.email} {...register("email")} />
              </Field>
              <Button type="submit" size="lg" className="w-full justify-center" loading={formState.isSubmitting} icon={<Mail className="h-4 w-4" />}>
                Send reset link
              </Button>
            </form>
            <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

// ─────────────────────────── Reset / set password ───────────────────────────

const resetSchema = z
  .object({ password: z.string().min(8, "At least 8 characters").max(128), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: Math.min(4, s), label: ["Too short", "Weak", "Fair", "Good", "Strong"][Math.min(4, s)] };
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const info = useQuery({
    queryKey: ["reset-token", token],
    queryFn: () => api.get<{ email: string; fullName: string | null; purpose: string; expiresAt: string }>("/auth/reset-password/validate", { token }),
    enabled: token.length >= 20,
    retry: false,
  });
  const { register, handleSubmit, formState, watch } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pw = watch("password");
  const st = strength(pw);
  const invite = info.data?.purpose === "invite" || params.get("invite") === "1";

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password: v.password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2200);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const invalid = !token || info.isError;
  return (
    <AuthLayout>
      {done ? (
        <div className="text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok">
            <CheckCircle2 className="h-9 w-9" />
          </motion.div>
          <h1 className="mt-5 font-display text-2xl font-bold text-ink">Password set</h1>
          <p className="mt-2 text-sm text-muted">Taking you to sign in…</p>
        </div>
      ) : invalid ? (
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger-soft text-danger"><Lock className="h-8 w-8" /></div>
          <h1 className="mt-5 font-display text-2xl font-bold text-ink">Link expired or invalid</h1>
          <p className="mt-2 text-sm text-muted">{info.error instanceof ApiError ? info.error.message : "This link can't be used."}</p>
          <Link to="/forgot-password"><Button className="mt-6">Request a new link</Button></Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-accent-strong"><ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">{invite ? "Account setup" : "Password reset"}</span></div>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">{invite ? "Set your password" : "Choose a new password"}</h1>
          <p className="mt-1 text-sm text-muted">
            {info.isLoading ? "Checking your link…" : <>For <b className="text-ink">{info.data?.email}</b></>}
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <AnimatePresence>{error && <Alert tone="danger">{error}</Alert>}</AnimatePresence>
            <Field label="New password" htmlFor="pw" error={formState.errors.password?.message}>
              <PasswordInput id="pw" autoFocus autoComplete="new-password" invalid={!!formState.errors.password} {...register("password")} />
              <div className="mt-1 flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div key={i} className="h-1.5 flex-1 rounded-full bg-sunken" animate={{
                      backgroundColor: i < st.score ? ["var(--app-danger)", "var(--app-warn)", "var(--app-accent)", "var(--app-ok)"][st.score - 1] : "var(--app-sunken)",
                    }} />
                  ))}
                </div>
                <span className="w-16 text-right text-[11px] font-semibold text-muted">{pw ? st.label : ""}</span>
              </div>
            </Field>
            <Field label="Confirm password" htmlFor="pw2" error={formState.errors.confirm?.message}>
              <PasswordInput id="pw2" autoComplete="new-password" invalid={!!formState.errors.confirm} {...register("confirm")} />
            </Field>
            <Button type="submit" size="lg" className="w-full justify-center" loading={formState.isSubmitting} disabled={info.isLoading}>
              {invite ? "Activate account" : "Update password"}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
