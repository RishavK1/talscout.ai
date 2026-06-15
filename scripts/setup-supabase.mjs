// One-off: provision our schema on Supabase. Pooler-robust: each statement
// runs on its own short-lived connection (Supavisor drops sessions on some
// DO-block/role ops). Idempotent. Run: node --env-file=.env.live scripts/setup-supabase.mjs
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL not set (load .env.live)");
const role = process.env.APP_DB_ROLE || "talscout_app";
const IGNORABLE = new Set(["42710", "42P07", "42P06", "42723", "42P16", "42704", "42P01", "42701"]);

async function run(label, sqlText, { tolerant = true } = {}) {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await c.connect();
    await c.query(sqlText);
    console.log("  ✓", label);
  } catch (e) {
    if (tolerant && IGNORABLE.has(e.code)) console.log("  ~", label, `(skip ${e.code})`);
    else { console.error("  ✗", label, "->", e.code, e.message); throw e; }
  } finally {
    try { await c.end(); } catch {}
  }
}

const SCOPED = ["users","candidates","resume_files","candidate_tags","shortlists","shortlist_items","subscriptions","audit_logs","usage_counters"];
const TENANT_EXPR = "NULLIF(current_setting('app.tenant_id', true), '')::uuid";

console.log("== Extension + role membership ==");
await run("CREATE EXTENSION vector", "CREATE EXTENSION IF NOT EXISTS vector");
await run("CREATE ROLE", `CREATE ROLE ${role} NOLOGIN`); // tolerant if exists
await run("GRANT role TO postgres", `GRANT ${role} TO postgres`);

console.log("== Migrations ==");
const dir = join(process.cwd(), "drizzle");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  console.log(" ", f);
  const sqlText = readFileSync(join(dir, f), "utf8");
  for (const stmt of sqlText.split("--> statement-breakpoint")) {
    const t = stmt.trim();
    if (t) await run("   " + t.split("\n")[0].slice(0, 56), t);
  }
}

console.log("== RLS policies (no DO blocks) ==");
// tenants keyed by id
await run("ENABLE RLS tenants", "ALTER TABLE tenants ENABLE ROW LEVEL SECURITY");
await run("policy tenants", `DROP POLICY IF EXISTS tenant_isolation ON tenants`);
await run("create policy tenants",
  `CREATE POLICY tenant_isolation ON tenants USING (id = ${TENANT_EXPR}) WITH CHECK (id = ${TENANT_EXPR})`);
for (const t of SCOPED) {
  await run(`ENABLE RLS ${t}`, `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  await run(`drop policy ${t}`, `DROP POLICY IF EXISTS tenant_isolation ON ${t}`);
  await run(`create policy ${t}`,
    `CREATE POLICY tenant_isolation ON ${t} USING (tenant_id = ${TENANT_EXPR}) WITH CHECK (tenant_id = ${TENANT_EXPR})`);
}

console.log("== Grants to app role ==");
await run("grant usage schema", `GRANT USAGE ON SCHEMA public TO ${role}`);
await run("grant tables", `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
await run("grant sequences", `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
await run("default priv tables", `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
await run("default priv sequences", `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);

console.log("== Verify ==");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const tbl = await c.query("select count(*)::int n from pg_tables where schemaname='public' and tablename in ('tenants','users','candidates','subscriptions','resume_files')");
const rls = await c.query("select relname from pg_class where relrowsecurity and relnamespace='public'::regnamespace order by relname");
const mem = await c.query("select pg_has_role('postgres',$1,'MEMBER') m", [role]);
console.log("core tables:", tbl.rows[0].n, "/5 | RLS tables:", rls.rows.length, "| postgres∈app:", mem.rows[0].m);
await c.end();
console.log("✅ Supabase setup complete");
