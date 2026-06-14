import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Idempotent database bootstrap used by the dev script and the test harness.
 * Creates the restricted runtime role + the target DB, installs pgvector,
 * applies the generated migrations, then applies RLS policies + grants.
 *
 * Runs entirely via the ADMIN (owner) connection. The app then connects with
 * the restricted role so RLS is actually enforced.
 */

export interface SetupOptions {
  adminBaseUrl: string; // points at the target db (may not exist yet)
  dbName: string;
  appRole: string;
  appPassword: string;
  /** Drop & recreate the public schema first (clean slate — for test DBs). */
  resetSchema?: boolean;
}

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function run(url: string, fn: (c: Client) => Promise<void>) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await fn(c);
  } finally {
    await c.end();
  }
}

export async function ensureRoleAndDb(opts: SetupOptions): Promise<void> {
  const maintenanceUrl = withDb(opts.adminBaseUrl, "postgres");
  await run(maintenanceUrl, async (c) => {
    // role (no IF NOT EXISTS for roles)
    await c.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${opts.appRole}') THEN
        CREATE ROLE ${opts.appRole} LOGIN PASSWORD '${opts.appPassword}';
      END IF;
    END $$;`);
    // database (CREATE DATABASE can't run in a tx/DO block)
    const exists = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      opts.dbName,
    ]);
    if (exists.rowCount === 0) {
      await c.query(`CREATE DATABASE ${opts.dbName}`);
    }
    await c.query(
      `GRANT CONNECT ON DATABASE ${opts.dbName} TO ${opts.appRole}`,
    );
  });
}

export async function applyMigrations(opts: SetupOptions): Promise<void> {
  const targetUrl = withDb(opts.adminBaseUrl, opts.dbName);
  const migrationsDir = join(process.cwd(), "drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const rls = readFileSync(
    join(process.cwd(), "src/server/db/rls.sql"),
    "utf8",
  );

  await run(targetUrl, async (c) => {
    if (opts.resetSchema) {
      await c.query("DROP SCHEMA IF EXISTS public CASCADE");
      await c.query("CREATE SCHEMA public");
    }
    await c.query("CREATE EXTENSION IF NOT EXISTS vector");
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      for (const stmt of sql.split("--> statement-breakpoint")) {
        const trimmed = stmt.trim();
        if (trimmed) await c.query(trimmed);
      }
    }
    // RLS + grants (references the role created above)
    await c.query(rls);
  });
}

/** Full one-shot setup. */
export async function setupDatabase(opts: SetupOptions): Promise<void> {
  await ensureRoleAndDb(opts);
  await applyMigrations(opts);
}

/** Wipe all data (keeps schema). Used between tests. */
export async function truncateAll(adminTargetUrl: string): Promise<void> {
  await run(adminTargetUrl, async (c) => {
    const { rows } = await c.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (rows.length === 0) return;
    const list = rows.map((r) => `"${r.tablename}"`).join(", ");
    await c.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  });
}
