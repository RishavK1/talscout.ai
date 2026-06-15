import { supabase } from "./supabase";

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

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // 1. Fetch active session to get the latest token
  const { data: { session } } = await supabase.auth.getSession();
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

  if (response.status === 249) {
    // Retry or handling rate limit (from Retry-After)
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
  delete: <T = any>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
