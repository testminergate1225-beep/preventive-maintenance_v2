import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { PageLoader } from "@/components/graphics/Gear";
import { api, ApiError, SESSION_EXPIRED_EVENT } from "@/lib/api";
import type { User } from "@/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const ME = ["auth", "me"];

async function fetchMe(): Promise<User | null> {
  try {
    return await api.get<User>("/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ME, queryFn: fetchMe, staleTime: 5 * 60_000, retry: 1 });
  const setUser = useCallback((u: User | null) => qc.setQueryData(ME, u), [qc]);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [qc, setUser]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const res = await api.post<{ user: User }>("/auth/login", { email, password, remember });
      setUser(res.user);
      return res.user;
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      qc.clear();
      qc.setQueryData(ME, null);
    }
  }, [qc, setUser]);

  const user = data ?? null;
  return (
    <Ctx.Provider value={{ user, loading: isLoading, isAdmin: user?.role === "admin", login, logout, setUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
