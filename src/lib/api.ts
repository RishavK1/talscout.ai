import { supabase } from "./supabase";
import { toast } from "sonner";

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string | { code: string; message: string; details?: any };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// A token expiring mid-session previously degraded into whatever generic
// message the failed call's own catch block happened to show (or nothing, on
// silent catches) — the user's next save just silently failed with no
// indication *why*. This makes a 401 always mean the same thing everywhere:
// one clear toast, then a hard redirect to sign in again. Guarded so several
// requests failing around the same moment only trigger it once.
let sessionExpiredHandled = false;

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // 1. Fetch active session to get the latest token. Right after an OAuth
  // redirect the code exchange can still be settling — if no token is
  // available yet, give it one short beat and re-read before sending an
  // unauthenticated request (which the server would 401 as "Missing bearer
  // token" even though the user just signed in).
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    ({ data: { session } } = await supabase.auth.getSession());
  }
  const token = session?.access_token;

  // 2. Prepare headers
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // 3. Make fetch request
  const response = await fetch(path, {
    ...options,
    headers,
  });

  // 3b. A 401 anywhere but /api/auth/session means a previously-valid bearer
  // token was rejected — expired or revoked mid-session. (/api/auth/session
  // itself legitimately 401s with "No account provisioned" for a brand-new
  // user still going through onboarding — AuthProvider already handles that
  // specific case and must keep owning it.)
  if (response.status === 401 && !path.startsWith("/api/auth/session") && !sessionExpiredHandled) {
    sessionExpiredHandled = true;
    toast.error("Your session has expired — please sign in again.");
    void supabase.auth.signOut().finally(() => {
      setTimeout(() => {
        window.location.href = "/login?expired=1";
      }, 600);
    });
  }

  // 4. Parse JSON body
  let body: ApiResponse<T>;
  try {
    body = await response.json();
  } catch (err) {
    throw new ApiError("Failed to parse response JSON", response.status);
  }

  // 5. Handle non-ok or custom app errors
  if (!response.ok || !body.ok) {
    let errMsg = "Request failed";
    if (body.error) {
      if (typeof body.error === "string") {
        errMsg = body.error;
      } else if (typeof body.error === "object" && body.error !== null) {
        errMsg = (body.error as any).message || (body.error as any).code || JSON.stringify(body.error);
      }
    } else if (response.statusText) {
      errMsg = response.statusText;
    }
    throw new ApiError(errMsg, response.status);
  }

  return body.data as T;
}

export const api = {
  get: <T = any>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T = any>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T = any>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  put: <T = any>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: <T = any>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "DELETE",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
};
