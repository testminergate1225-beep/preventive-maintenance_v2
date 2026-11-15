import { AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Input } from "./Field";

export function Modal({
  open, onClose, title, description, children, footer, size = "md", icon,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the open/close effect on every render
  // (callers pass inline functions; re-running it used to steal focus on each keystroke).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const dialog = ref.current;
      if (!dialog || dialog.contains(document.activeElement)) return; // something inside already has focus (autoFocus)
      const target =
        dialog.querySelector<HTMLElement>("[data-autofocus]") ??
        bodyRef.current?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])") ??
        dialog.querySelector<HTMLElement>("[data-dialog-footer] button");
      target?.focus();
    }, 60);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl", full: "max-w-[min(96vw,1400px)]" };
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn("relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl", widths[size])}
          >
            {(title || description) && (
              <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                {icon && <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong">{icon}</div>}
                <div className="min-w-0 flex-1">
                  {title && <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>}
                  {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
                </div>
                <button onClick={onClose} className="rounded-lg p-1.5 text-faint transition hover:bg-surface-2 hover:text-ink" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div ref={bodyRef} className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div data-dialog-footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ───────────── Promise-based confirm / prompt dialogs ─────────────

type ConfirmOpts = { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean };
type PromptOpts = { title: string; message?: ReactNode; label?: string; defaultValue?: string; confirmLabel?: string; type?: string };
type DialogState =
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOpts)
  | ({ kind: "prompt"; resolve: (v: string | null) => void } & PromptOpts)
  | null;

const DialogCtx = createContext<{ confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> } | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const [value, setValue] = useState("");
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ kind: "confirm", resolve, ...o })), []);
  const prompt = useCallback((o: PromptOpts) => {
    setValue(o.defaultValue ?? "");
    return new Promise<string | null>((resolve) => setState({ kind: "prompt", resolve, ...o }));
  }, []);
  const close = (result: boolean) => {
    if (!state) return;
    if (state.kind === "confirm") state.resolve(result);
    else state.resolve(result ? value : null);
    setState(null);
  };
  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={state?.title}
        icon={state?.kind === "confirm" && state.danger ? <AlertTriangle className="h-5 w-5 text-danger" /> : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
            <Button
              variant={state?.kind === "confirm" && state.danger ? "danger" : "primary"}
              disabled={state?.kind === "prompt" && !value.trim()}
              onClick={() => close(true)}
            >
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-muted">{state.message}</div>}
        {state?.kind === "prompt" && (
          <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (value.trim()) close(true); }}>
            {state.label && <label className="mb-1.5 block text-[13px] font-medium text-muted">{state.label}</label>}
            <Input autoFocus type={state.type ?? "text"} value={value} onFocus={(e) => e.target.select()} onChange={(e) => setValue(e.target.value)} />
          </form>
        )}
      </Modal>
    </DialogCtx.Provider>
  );
}

export function useDialogs() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error("useDialogs must be used inside DialogProvider");
  return ctx;
}
