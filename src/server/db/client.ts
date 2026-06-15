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
let _appPool: Pool | null = null;
let _adminPool: Pool | null = null;
let _appDb: NodePgDatabase<typeof schema> | null = null;
let _adminDb: NodePgDatabase<typeof schema> | null = null;

/** Local Postgres needs no SSL; remote (Supabase) requires it. */
function sslFor(url: string): false | { rejectUnauthorized: boolean; ca?: string } {
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }
  
  return { rejectUnauthorized: false };
}

export function appPool(): Pool {
  if (!_appPool) {
    const url = getEnv().DATABASE_URL;
    _appPool = new Pool({ connectionString: url, max: 10, ssl: sslFor(url) });
  }
  return _appPool;
}

export function adminPool(): Pool {
  if (!_adminPool) {
    const url = adminDbUrl();
    _adminPool = new Pool({ connectionString: url, max: 4, ssl: sslFor(url) });
  }
  return _adminPool;
}

/** Drizzle bound to the restricted app pool (RLS applies). */
export function db(): NodePgDatabase<typeof schema> {
  if (!_appDb) _appDb = drizzle(appPool(), { schema });
  return _appDb;
}

/** Drizzle bound to the admin pool — DDL / setup / tests only. */
export function adminDb(): NodePgDatabase<typeof schema> {
  if (!_adminDb) _adminDb = drizzle(adminPool(), { schema });
  return _adminDb;
}

export async function closePools(): Promise<void> {
  await Promise.all([_appPool?.end(), _adminPool?.end()]);
  _appPool = _adminPool = null;
  _appDb = _adminDb = null;
}
