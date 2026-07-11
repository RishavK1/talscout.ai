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
export function appPool(): Pool {
  if (!globalForDb._appPool) {
    const url = getEnv().DATABASE_URL;
    globalForDb._appPool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
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
      max: 2,
      idleTimeoutMillis: 10_000,
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
