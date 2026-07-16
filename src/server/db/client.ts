import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { getEnv, adminDbUrl } from "@/server/config/env";
import { schema } from "./schema";

/**
 * Two connection pools:
 *  - appPool  : the RESTRICTED role (RLS enforced) — used for all request work.
 *  - adminPool: the owner role (DDL, migrations, tests setup) — never used in
 *               the request path.
 */
// Next.js dev-mode (Turbopack/webpack) re-evaluates server modules on every
// file edit, which would otherwise re-run the `let _appPool = null`
// initializer and spawn a brand-new `Pool` (10 more real connections) on top
// of the still-open previous one — over a session this exhausts Postgres's
// connection cap and every query queues behind the leaked connections until
// it hits `statement_timeout`. Stashing the pools on `globalThis` (which
// survives module re-evaluation, unlike module-scope `let`) keeps one pool
// per process regardless of how many times this module reloads.
const globalForDb = globalThis as unknown as {
  _appPool?: Pool;
  _adminPool?: Pool;
  _appDb?: NodePgDatabase<typeof schema>;
  _adminDb?: NodePgDatabase<typeof schema>;
};

/** Local Postgres needs no SSL; remote (Supabase) requires it. */
function sslFor(url: string): false | { rejectUnauthorized: boolean; ca?: string } {
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }
  
  return { rejectUnauthorized: false };
}

// Supabase's Supavisor pooler in Session mode hard-caps total concurrent
// client connections at the dashboard's `pool_size` (currently 15) no matter
// how many serverless instances are alive — it's a global ceiling, not a
// per-connection-string one. Each Vercel invocation gets its own process and
// therefore its own pair of pools, so keeping `max` small here is what lets
// several concurrent invocations coexist under that shared 15-connection cap
// instead of two invocations alone exhausting it (see EMAXCONNSESSION).
//
// That constraint doesn't apply in local dev: it's a single long-running
// process, not N concurrent serverless invocations, so it isn't sharing the
// 15-cap with anyone else. Keeping the prod-sized pool there instead starves
// a single page load — e.g. the dashboard alone fires ~6 concurrent
// authenticated requests, each needing 2 admin-pool connections just to
// resolve the session, so a 2-connection cap serializes them into multi-
// second queues. Widen only outside production.
const isProd = getEnv().NODE_ENV === "production";
const APP_POOL_MAX = isProd ? 3 : 10;
const ADMIN_POOL_MAX = isProd ? 2 : 5;

export function appPool(): Pool {
  if (!globalForDb._appPool) {
    const url = getEnv().DATABASE_URL;
    globalForDb._appPool = new Pool({
      connectionString: url,
      max: APP_POOL_MAX,
      idleTimeoutMillis: 10_000,
      // Fail a stuck connect in 5s instead of hanging indefinitely when the
      // (free-tier, remote) DB is cold/waking — the caller can then retry or
      // surface an error fast rather than leaving the user on a dead spinner.
      connectionTimeoutMillis: 5_000,
      // Keep TCP sockets alive so warm connections don't get silently dropped
      // by intermediaries, which would otherwise force a fresh cold connect.
      keepAlive: true,
      ssl: sslFor(url),
    });
  }
  return globalForDb._appPool;
}

export function adminPool(): Pool {
  if (!globalForDb._adminPool) {
    const url = adminDbUrl();
    globalForDb._adminPool = new Pool({
      connectionString: url,
      max: ADMIN_POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
      ssl: sslFor(url),
    });
  }
  return globalForDb._adminPool;
}

/** Drizzle bound to the restricted app pool (RLS applies). */
export function db(): NodePgDatabase<typeof schema> {
  if (!globalForDb._appDb) globalForDb._appDb = drizzle(appPool(), { schema });
  return globalForDb._appDb;
}

/** Drizzle bound to the admin pool — DDL / setup / tests only. */
export function adminDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb._adminDb) globalForDb._adminDb = drizzle(adminPool(), { schema });
  return globalForDb._adminDb;
}

export async function closePools(): Promise<void> {
  await Promise.all([globalForDb._appPool?.end(), globalForDb._adminPool?.end()]);
  globalForDb._appPool = undefined;
  globalForDb._adminPool = undefined;
  globalForDb._appDb = undefined;
  globalForDb._adminDb = undefined;
}

/**
 * True when an error is a CONNECTION-ESTABLISHMENT failure (pool couldn't get a
 * socket to the DB) rather than a query error. These are the only errors safe
 * to blind-retry: nothing was executed, so there's no risk of double-applying a
 * write. Covers pg's connect-timeout message + the usual TCP/DNS error codes a
 * cold/waking remote DB throws.
 */
function isConnectError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code && ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EHOSTUNREACH"].includes(code)) {
    return true;
  }
  const msg = (err as { message?: string })?.message ?? "";
  return /timeout exceeded when trying to connect|Connection terminated/i.test(msg);
}

/**
 * Retry `fn` a few times with exponential backoff, but ONLY when it fails to
 * establish a connection (see `isConnectError`). Turns a cold-DB first request
 * that would otherwise hang/error into a short wait that succeeds once the DB
 * wakes. Query errors, auth errors, etc. bubble immediately — never retried.
 */
export async function withConnectRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1_000, 2_000, 4_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === delays.length || !isConnectError(err)) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}
