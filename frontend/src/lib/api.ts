/**
 * Thin fetch wrapper for the EPM API.
 * - Same-origin, httpOnly cookie sessions (no tokens in JS / localStorage)
 * - Echoes the CSRF cookie in X-CSRF-Token on state-changing requests
 * - Transparently refreshes an expired access token once, then retries
 */

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get fieldErrors(): FieldError[] {
    return Array.isArray(this.details) ? (this.details as FieldError[]) : [];
  }
}

export const SESSION_EXPIRED_EVENT = "epm:session-expired";
const BASE = "/api/v1";

type Query = Record<string, string | number | boolean | null | undefined>;
type Options = { method?: string; body?: unknown; query?: Query; signal?: AbortSignal; retry?: boolean };

export function getCsrfToken(): string | undefined {
  const m = document.cookie.match(/(?:^|;\s*)epm_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export function buildUrl(path: string, query?: Query): string {
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.pathname + url.search;
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; concurrent 401s wait for the same promise. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(BASE + "/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": getCsrfToken() ?? "" },
      });
      if (res.ok) return true;
      const body = await res.json().catch(() => null);
      // Another tab rotated the token a moment ago: its new cookies are already ours.
      if (body?.error?.code === "session_stale") return true;
      return false;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const err = body?.error;
  return new ApiError(
    res.status,
    err?.code ?? "http_error",
    err?.message ?? (res.status >= 500 ? "Server error — please try again." : `Request failed (${res.status}).`),
    err?.details,
  );
}

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (!["GET", "HEAD"].includes(method)) headers["X-CSRF-Token"] = getCsrfToken() ?? "";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, credentials: "same-origin", signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection.");
  }

  if (res.status === 401 && opts.retry !== false && !path.startsWith("/auth/login")) {
    const err = await parseError(res);
    if (["token_expired", "not_authenticated", "token_revoked"].includes(err.code) && (await refreshSession())) {
      return request<T>(path, { ...opts, retry: false });
    }
    if (!path.startsWith("/auth/")) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw err;
  }
  if (res.status === 403 && opts.retry !== false) {
    const err = await parseError(res);
    if (err.code === "csrf_failed") return request<T>(path, { ...opts, retry: false });
    throw err;
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Multipart upload with progress (fetch has no upload progress events). */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (pct: number) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", BASE + path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", getCsrfToken() ?? "");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, body?.error?.code ?? "upload_failed", body?.error?.message ?? "Upload failed."));
    };
    xhr.onerror = () => reject(new ApiError(0, "network_error", "Upload failed — network error."));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload cancelled."));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const f = e.fieldErrors[0];
    return f ? `${f.field ? f.field + ": " : ""}${f.message}` : e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
