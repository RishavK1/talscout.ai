import { AppError, TooManyRequests } from "./errors";
import { logger } from "@/server/observability/logger";

/** Uniform response envelope (ERR-05). */
export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

export function jsonResponse(
  body: Envelope<unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
  });
}

export function okResponse(data: unknown, status = 200): Response {
  return jsonResponse({ ok: true, data }, status);
}

/** Map any thrown value to a safe Response. */
export function errorResponse(err: unknown, requestId: string): Response {
  if (err instanceof AppError) {
    console.log("AppError Thrown:", err.code, err.message);
    const extra: Record<string, string> = {};
    if (err instanceof TooManyRequests && err.retryAfter != null) {
      extra["Retry-After"] = String(err.retryAfter);
    }
    return jsonResponse(
      {
        ok: false,
        error: { code: err.code, message: err.message, details: err.details },
      },
      err.status,
      extra,
    );
  }
  // Unknown error: log full detail server-side, return generic to client.
  logger.error({ err, requestId }, "unhandled_error");
  return jsonResponse(
    {
      ok: false,
      error: {
        code: "internal_error",
        message: "Something went wrong. Please try again.",
      },
    },
    500,
    { "X-Request-Id": requestId },
  );
}
