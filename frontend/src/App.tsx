import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { createBrowserRouter, Link, Outlet, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { AuthProvider, RequireAdmin, RequireAuth } from "@/auth/AuthProvider";
import { Gear } from "@/components/graphics/Gear";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { DialogProvider } from "@/components/ui/Modal";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from "@/features/auth/AuthPages";
import { ApiError } from "@/lib/api";

/** Route-level code splitting: each page's chunk loads on first visit. */
const page = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M, admin = false) => async () => {
  const C = (await load())[name] as React.ComponentType;
  return { Component: admin ? () => <RequireAdmin><C /></RequireAdmin> : C };
};
const docs = () => import("@/features/documents/lists");
const prints = () => import("@/features/print/PrintPages");
const adminPages = () => import("@/features/admin/AdminPages");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

function NotFound() {
  return (
    <div className="blueprint flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="relative flex items-center">
        <Gear size={120} teeth={14} duration={14} color="var(--app-accent)" />
        <Gear size={80} teeth={10} duration={9} reverse color="var(--app-faint)" className="-ml-4 mt-16" />
      </div>
      <h1 className="mt-6 font-display text-4xl font-bold text-ink">404 — out of service</h1>
      <p className="mt-2 text-muted">This page doesn't exist or has been moved.</p>
      <Link to="/" className="mt-6"><Button>Back to dashboard</Button></Link>
    </div>
  );
}

function Root() {
  return (
    <AuthProvider>
      <DialogProvider>
        <Outlet />
      </DialogProvider>
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      {
        path: "/print",
        element: <RequireAuth><Outlet /></RequireAuth>,
        children: [
          { path: "maintenance", lazy: page(prints, "MaintenancePrint") },
          { path: "load-balancing/:id", lazy: page(prints, "LoadBalancingPrint") },
          { path: "megger/:id", lazy: page(prints, "MeggerPrint") },
          { path: "checklists/:id", lazy: page(prints, "ChecklistPrint") },
          { path: "store-lists/:id", lazy: page(prints, "StoreListPrint") },
        ],
      },
      {
        path: "/",
        element: <RequireAuth><AppShell /></RequireAuth>,
        children: [
          { index: true, lazy: page(() => import("@/features/dashboard/DashboardPage"), "DashboardPage") },
          { path: "maintenance", lazy: page(() => import("@/features/maintenance/MaintenancePage"), "MaintenancePage") },
          { path: "uploads", lazy: page(() => import("@/features/uploads/UploadsPage"), "UploadsPage") },
          { path: "performance", lazy: page(() => import("@/features/performance/PerformancePage"), "PerformancePage") },
          { path: "load-balancing", lazy: page(docs, "LoadBalancingList") },
          { path: "load-balancing/:id", lazy: page(() => import("@/features/loadBalancing/LoadBalancingEditor"), "LoadBalancingEditor") },
          { path: "megger", lazy: page(docs, "MeggerList") },
          { path: "megger/:id", lazy: page(() => import("@/features/megger/MeggerEditor"), "MeggerEditor") },
          { path: "checklists", lazy: page(docs, "ChecklistList") },
          { path: "checklists/:id", lazy: page(() => import("@/features/checklists/ChecklistEditor"), "ChecklistEditor") },
          { path: "store-lists", lazy: page(docs, "StoreListList") },
          { path: "store-lists/:id", lazy: page(() => import("@/features/storeLists/StoreListEditor"), "StoreListEditor") },
          { path: "account", lazy: page(() => import("@/features/account/AccountPage"), "AccountPage") },
          { path: "admin/users", lazy: page(adminPages, "UsersPage", true) },
          { path: "admin/audit", lazy: page(adminPages, "AuditPage", true) },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors closeButton toastOptions={{ style: { borderRadius: 14 } }} />
      </MotionConfig>
    </QueryClientProvider>
  );
}
