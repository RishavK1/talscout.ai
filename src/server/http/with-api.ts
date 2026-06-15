import type { ZodType } from "zod";
import { resolveSession, authenticate, type Session } from "@/server/auth/session";
import { assertRole, type Role } from "@/server/auth/rbac";
import { withTenantTx, type TenantContext } from "@/server/db/tx";
import { okResponse, errorResponse } from "./response";
import { BadRequest, ValidationError, TooManyRequests } from "./errors";
import { getServices } from "@/server/container";

/** What a handler returns: optional data + optional status (defaults 200). */
export interface HandlerResult {
  data?: unknown;
  status?: number;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  keyPrefix?: string;
}

type RouteCtx = { params?: Promise<Record<string, string>> } | undefined;

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function formatIssues(err: { issues: { path: PropertyKey[]; message: string }[] }) {
  return err.issues.map((i) => ({
    field: i.path.join(".") || "(root)",
    message: i.message,
  }));
}

async function parseBody<B>(req: Request, schema: ZodType<B>): Promise<B> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new BadRequest("Expected application/json body"); // VAL-08
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequest("Malformed JSON body"); // VAL-07
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(formatIssues(parsed.error)); // VAL-01/02
  return parsed.data; // unknown keys are stripped by zod objects (VAL-03)
}

function parseQuery<Q>(req: Request, schema: ZodType<Q>): Q {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  for (const [k, v] of url.searchParams) obj[k] = v;
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw new ValidationError(formatIssues(parsed.error));
  return parsed.data;
}

async function readParams(routeCtx: RouteCtx): Promise<Record<string, string>> {
  if (routeCtx?.params) return routeCtx.params;
  return {};
}

// ---------------------------------------------------------------------------
// withAuth — the default guard for authenticated, tenant-scoped endpoints.
// Order: authenticate -> RBAC -> validate -> open tenant tx (RLS) -> handler.
// ---------------------------------------------------------------------------
export interface AuthHandlerCtx<B, Q> {
  req: Request;
  params: Record<string, string>;
  session: Session;
  body: B;
  query: Q;
  ctx: TenantContext;
}

export interface AuthOptions<B, Q> {
  role?: Role;
  bodySchema?: ZodType<B>;
  querySchema?: ZodType<Q>;
  rateLimit?: RateLimitOptions;
}

export function withAuth<B = undefined, Q = undefined>(
  handler: (c: AuthHandlerCtx<B, Q>) => Promise<HandlerResult>,
  options: AuthOptions<B, Q> = {},
) {
  return async (req: Request, routeCtx?: RouteCtx): Promise<Response> => {
    const requestId = newRequestId();
    try {
      const session = await resolveSession(req); // 401/403
      if (options.role) assertRole(session.role, options.role); // 403

      if (options.rateLimit) {
        const key = `rl:tenant:${session.tenantId}:${options.rateLimit.keyPrefix ?? "default"}`;
        const rl = await getServices().limiter.limit(
          key,
          options.rateLimit.limit,
          options.rateLimit.windowSeconds,
        );
        if (!rl.success) {
          throw new TooManyRequests(
            "Rate limit exceeded",
            Math.ceil((rl.reset - Date.now()) / 1000),
          );
        }
      }

      const body = options.bodySchema
        ? await parseBody(req, options.bodySchema)
        : (undefined as B);
      const query = options.querySchema
        ? parseQuery(req, options.querySchema)
        : (undefined as Q);
      const params = await readParams(routeCtx);

      const result = await withTenantTx(
        { tenantId: session.tenantId, userId: session.userId },
        (ctx) => handler({ req, params, session, body, query, ctx }),
      );
      return okResponse(result.data ?? null, result.status ?? 200);
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

// ---------------------------------------------------------------------------
// withPublic — endpoints with no provisioned account (signup, health, webhooks).
// Optionally still verifies a JWT (signup needs the auth identity).
// ---------------------------------------------------------------------------
export interface PublicHandlerCtx<B, Q> {
  req: Request;
  params: Record<string, string>;
  body: B;
  query: Q;
  auth?: { authUserId: string; email?: string };
}

export interface PublicOptions<B, Q> {
  verifyToken?: boolean;
  bodySchema?: ZodType<B>;
  querySchema?: ZodType<Q>;
  rateLimit?: RateLimitOptions;
}

export function withPublic<B = undefined, Q = undefined>(
  handler: (c: PublicHandlerCtx<B, Q>) => Promise<HandlerResult>,
  options: PublicOptions<B, Q> = {},
) {
  return async (req: Request, routeCtx?: RouteCtx): Promise<Response> => {
    const requestId = newRequestId();
    try {
      if (options.rateLimit) {
        const rawIp = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
        const trimmedIp = rawIp.split(",")[0].trim();
        const ip = /^[0-9a-fA-F.:%_\-]+$/.test(trimmedIp) ? trimmedIp : "127.0.0.1";
        const key = `rl:ip:${ip}:${options.rateLimit.keyPrefix ?? "default"}`;
        const rl = await getServices().limiter.limit(
          key,
          options.rateLimit.limit,
          options.rateLimit.windowSeconds,
        );
        if (!rl.success) {
          throw new TooManyRequests(
            "Rate limit exceeded",
            Math.ceil((rl.reset - Date.now()) / 1000),
          );
        }
      }

      const auth = options.verifyToken ? await authenticate(req) : undefined;
      const body = options.bodySchema
        ? await parseBody(req, options.bodySchema)
        : (undefined as B);
      const query = options.querySchema
        ? parseQuery(req, options.querySchema)
        : (undefined as Q);
      const params = await readParams(routeCtx);

      const result = await handler({ req, params, body, query, auth });
      return okResponse(result.data ?? null, result.status ?? 200);
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}
