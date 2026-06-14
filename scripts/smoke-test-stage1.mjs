/**
 * TalScout — Stage-1 Live Smoke Tests
 *
 * Verifies:
 *  1. RLS-under-SET-ROLE: seeds two tenants + candidates via admin connection,
 *     then confirms the restricted talscout_app role + app.tenant_id config
 *     correctly isolates rows (TEN-06).
 *  2. Cross-tenant INSERT is blocked by the WITH CHECK policy (TEN-02).
 *  3. API routes (signup / session / candidates) work against Supabase DB
 *     using a JWT minted with SUPABASE_JWT_SECRET (APP_MODE=mock so AI/Stripe
 *     keys are not required yet).
 *
 * Run:
 *   node --env-file=.env.live scripts/smoke-test-stage1.mjs
 *
 * Pre-conditions:
 *  - .env.live has DATABASE_URL, DATABASE_ADMIN_URL, SUPABASE_JWT_SECRET, APP_MODE=live
 *  - APP_MODE in .env.live is temporarily overridden to "mock" for this script
 *    (we patch process.env before any imports that call getEnv).
 *  - The dev server must NOT be running (this script starts it internally via
 *    Next.js route handlers called in-process, NOT via HTTP — it directly
 *    invokes the route handler modules with a synthetic Request).
 *
 * NOTE: This script does NOT start a server; it uses the pg driver directly for
 * the RLS tests and constructs synthetic Next.js Request objects for the API tests.
 */

import pg from "pg";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

// ── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label) {
  console.log("  ✓", label);
  passed++;
}

function fail(label, err) {
  console.error("  ✗", label, "->", err?.message ?? err);
  failed++;
}

async function expect(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? "assertion failed");
}

// ── env ────────────────────────────────────────────────────────────────────

const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;
const JWT_SECRET_RAW = process.env.SUPABASE_JWT_SECRET;
const APP_DB_ROLE = process.env.APP_DB_ROLE ?? "talscout_app";
const NEXT_APP_URL = process.env.APP_URL ?? "http://localhost:3100";

if (!ADMIN_URL) throw new Error("DATABASE_ADMIN_URL (or DATABASE_URL) required");
if (!JWT_SECRET_RAW) throw new Error("SUPABASE_JWT_SECRET required");

const ssl = { rejectUnauthorized: false };

// ── JWT mint (mimics Supabase-style HS256 token) ───────────────────────────

async function mintJwt(sub, email, ttlSec = 3600) {
  const secret = new TextEncoder().encode(JWT_SECRET_RAW);
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSec)
    .sign(secret);
}

// ── DB helpers ─────────────────────────────────────────────────────────────

/** Run a query on a fresh client then close it (pooler-safe). */
async function query(url, sql, params = []) {
  const c = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 15000 });
  await c.connect();
  try {
    const res = await c.query(sql, params);
    return res;
  } finally {
    try { await c.end(); } catch {}
  }
}

/** Run `fn(client)` inside a transaction on a fresh client. */
async function withTx(url, fn) {
  const c = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 15000 });
  await c.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    try { await c.end(); } catch {}
  }
}

// ── cleanup helper ─────────────────────────────────────────────────────────

const cleanupIds = { tenantA: null, tenantB: null };

async function cleanup() {
  if (cleanupIds.tenantA || cleanupIds.tenantB) {
    console.log("\n── Cleanup ──");
    for (const id of [cleanupIds.tenantA, cleanupIds.tenantB]) {
      if (!id) continue;
      try {
        // Cascade delete via admin — cascades handle child rows
        await query(ADMIN_URL, "DELETE FROM tenants WHERE id = $1", [id]);
        ok(`cleaned up tenant ${id}`);
      } catch (e) {
        fail(`cleanup tenant ${id}`, e);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — RLS under SET ROLE
// ═══════════════════════════════════════════════════════════════════════════

async function runRlsTests() {
  console.log("\n═══ Section 1: RLS under SET ROLE (TEN-06, TEN-02) ═══");

  // 1a. Seed two tenants + one candidate each via admin connection (bypasses RLS)
  let tenantA, tenantB, candidateA, candidateB;

  await expect("seed tenantA via admin", async () => {
    const r = await query(ADMIN_URL, "INSERT INTO tenants (name) VALUES ($1) RETURNING id", [`smoke-A-${Date.now()}`]);
    tenantA = r.rows[0].id;
    cleanupIds.tenantA = tenantA;
  });
  if (!tenantA) { fail("cannot continue without tenantA"); return; }

  await expect("seed tenantB via admin", async () => {
    const r = await query(ADMIN_URL, "INSERT INTO tenants (name) VALUES ($1) RETURNING id", [`smoke-B-${Date.now()}`]);
    tenantB = r.rows[0].id;
    cleanupIds.tenantB = tenantB;
  });
  if (!tenantB) { fail("cannot continue without tenantB"); return; }

  await expect("seed candidateA via admin", async () => {
    const r = await query(
      ADMIN_URL,
      "INSERT INTO candidates (tenant_id, status, full_name) VALUES ($1, 'ready', 'Alice Admin') RETURNING id",
      [tenantA]
    );
    candidateA = r.rows[0].id;
  });

  await expect("seed candidateB via admin", async () => {
    const r = await query(
      ADMIN_URL,
      "INSERT INTO candidates (tenant_id, status, full_name) VALUES ($1, 'ready', 'Bob Builder') RETURNING id",
      [tenantB]
    );
    candidateB = r.rows[0].id;
  });

  // 1b. As app role + tenantA context: SELECT * FROM candidates → only see A's rows
  await expect("[TEN-06] app role + tenantA context sees only tenantA candidates", async () => {
    const rows = await withTx(APP_URL, async (c) => {
      await c.query(`SET LOCAL ROLE "${APP_DB_ROLE}"`);
      await c.query(`SET LOCAL search_path TO public, extensions`);
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
      const r = await c.query("SELECT id, tenant_id FROM candidates WHERE tenant_id = $1 OR tenant_id = $2", [tenantA, tenantB]);
      return r.rows;
    });
    // RLS should filter out tenantB rows even though the WHERE tries to fetch both
    assert(rows.every(r => r.tenant_id === tenantA), `Got rows for wrong tenant: ${JSON.stringify(rows.map(r => r.tenant_id))}`);
    assert(rows.some(r => r.id === candidateA), "Did not get candidateA");
    assert(!rows.some(r => r.id === candidateB), "Got candidateB (cross-tenant leak!)");
  });

  // 1c. As app role + tenantB context: sees only B's rows
  await expect("[TEN-06] app role + tenantB context sees only tenantB candidates", async () => {
    const rows = await withTx(APP_URL, async (c) => {
      await c.query(`SET LOCAL ROLE "${APP_DB_ROLE}"`);
      await c.query(`SET LOCAL search_path TO public, extensions`);
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantB]);
      const r = await c.query("SELECT id, tenant_id FROM candidates WHERE tenant_id = $1 OR tenant_id = $2", [tenantA, tenantB]);
      return r.rows;
    });
    assert(rows.every(r => r.tenant_id === tenantB), `Got rows for wrong tenant: ${JSON.stringify(rows.map(r => r.tenant_id))}`);
    assert(rows.some(r => r.id === candidateB), "Did not get candidateB");
    assert(!rows.some(r => r.id === candidateA), "Got candidateA (cross-tenant leak!)");
  });

  // 1d. Cross-tenant INSERT blocked by WITH CHECK
  await expect("[TEN-02] WITH CHECK blocks cross-tenant INSERT", async () => {
    let blocked = false;
    try {
      await withTx(APP_URL, async (c) => {
        await c.query(`SET LOCAL ROLE "${APP_DB_ROLE}"`);
        await c.query(`SET LOCAL search_path TO public, extensions`);
        await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
        // Try to INSERT a candidate for tenantB while context is tenantA
        await c.query(
          "INSERT INTO candidates (tenant_id, status, full_name) VALUES ($1, 'ready', 'Hacker')",
          [tenantB]
        );
      });
    } catch (e) {
      // RLS WITH CHECK should produce a 'new row violates row-level security policy' error
      if (e.message.includes("row-level security") || e.code === "42501") {
        blocked = true;
      } else {
        throw e; // unexpected error
      }
    }
    assert(blocked, "Cross-tenant INSERT was NOT blocked by RLS!");
  });

  // 1e. Unscoped context (no app.tenant_id set) → no rows
  await expect("[TEN-06] no tenant context → app role sees zero rows", async () => {
    const rows = await withTx(APP_URL, async (c) => {
      await c.query(`SET LOCAL ROLE "${APP_DB_ROLE}"`);
      await c.query(`SET LOCAL search_path TO public, extensions`);
      // Explicitly clear any inherited tenant id
      await c.query(`SELECT set_config('app.tenant_id', '', true)`);
      const r = await c.query("SELECT id FROM candidates WHERE id = $1 OR id = $2", [candidateA, candidateB]);
      return r.rows;
    });
    assert(rows.length === 0, `Expected 0 rows with empty tenant_id, got ${rows.length}`);
  });

  return { tenantA, tenantB };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — API smoke test (signup / session / candidates)
//
// We use the Next.js dev server (must be running) OR call via HTTP if
// APP_URL is given. Since we can't easily import compiled Next.js route
// handlers from a .mjs script, we test via HTTP against a running server.
// ═══════════════════════════════════════════════════════════════════════════

async function runApiTests(tenantA) {
  console.log("\n═══ Section 2: API smoke tests (requires dev server at", NEXT_APP_URL, ") ═══");
  console.log("  ℹ  This section calls HTTP endpoints. Ensure the dev server is running with live DB + JWT:");
  console.log(`     pkill -f 'next dev' || true  # kill any existing dev server first`);
  console.log(`     APP_MODE=mock DATABASE_URL=$(grep DATABASE_URL .env.live | cut -d= -f2-) DATABASE_ADMIN_URL=$(grep DATABASE_ADMIN_URL .env.live | cut -d= -f2-) SUPABASE_JWT_SECRET=$(grep SUPABASE_JWT_SECRET .env.live | cut -d= -f2-) PORT=3100 npm run dev`);
  console.log("  ℹ  If the server is not running, API tests will fail (expected for now).");

  // We mint a fresh auth_user_id for this test run so it doesn't conflict
  const authUserId = randomUUID();
  const email = `smoke-${Date.now()}@talscout-test.dev`;

  // 2a. POST /api/auth/signup — create tenant + admin user
  let signupOk = false;
  let signupData = null;
  await expect("POST /api/auth/signup → 200, tenant + user created", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ workspaceName: `Smoke Agency ${Date.now()}` }),
    });
    const body = await res.json();
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `ok != true: ${JSON.stringify(body)}`);
    assert(body.data?.tenantId, "No tenantId in response");
    // signup returns role instead of userId directly
    signupOk = true;
    signupData = body.data;
  });

  if (!signupOk) {
    console.log("  ⚠ Skipping remaining API tests (signup failed).");
    return;
  }

  // 2b. GET /api/auth/session — returns the user/tenant/role
  await expect("GET /api/auth/session → 200, correct tenantId + role=admin", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/auth/session`, {
      headers: { "Authorization": `Bearer ${jwt}` },
    });
    const body = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `ok != true`);
    assert(body.data?.tenantId === signupData.tenantId, `tenantId mismatch: ${body.data?.tenantId}`);
    assert(body.data?.role === "admin", `Expected role=admin, got ${body.data?.role}`);
  });

  // 2c. GET /api/candidates → empty list (no candidates yet)
  await expect("GET /api/candidates → 200, empty array", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/candidates`, {
      headers: { "Authorization": `Bearer ${jwt}` },
    });
    const body = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `ok != true`);
    assert(Array.isArray(body.data?.candidates), `Expected candidates array`);
    assert(body.data.candidates.length === 0, `Expected empty list, got ${body.data.candidates.length}`);
  });

  // 2d. POST /api/candidates → create one candidate manually
  let candidateId = null;
  await expect("POST /api/candidates → 201, candidate created", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({
        fullName: "Jane Smoke",
        currentTitle: "Senior Engineer",
        location: "Remote",
        yearsExperience: 5,
      }),
    });
    const body = await res.json();
    assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `ok != true`);
    assert(body.data?.id, "No id in response");
    candidateId = body.data.id;
  });

  if (!candidateId) return;

  // 2e. GET /api/candidates/:id → returns the candidate
  await expect("GET /api/candidates/:id → 200, correct candidate", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/candidates/${candidateId}`, {
      headers: { "Authorization": `Bearer ${jwt}` },
    });
    const body = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.data?.id === candidateId, "id mismatch");
    assert(body.data?.fullName === "Jane Smoke", "fullName mismatch");
  });

  // 2f. Security: wrong JWT secret → 401
  await expect("[AUTH-03] Wrong JWT secret → 401", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-totally-different-xyz");
    const badJwt = await new SignJWT({ email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(authUserId)
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(wrongSecret);
    const res = await fetch(`${NEXT_APP_URL}/api/candidates`, {
      headers: { "Authorization": `Bearer ${badJwt}` },
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // 2g. Cleanup: delete the smoke candidate (admin RBAC required, user is admin)
  await expect("DELETE /api/candidates/:id → 200, candidate deleted", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/candidates/${candidateId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${jwt}` },
    });
    // 200 or 204
    assert(res.status === 200 || res.status === 204, `Expected 200/204, got ${res.status}`);
  });

  // 2h. Health check
  await expect("GET /api/health → 200", async () => {
    const res = await fetch(`${NEXT_APP_URL}/api/health`);
    const body = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(body.ok === true, `ok != true`);
  });

  // 2i. Cleanup signed-up user+tenant from DB via admin
  await expect("cleanup smoke signup tenant from DB", async () => {
    await query(ADMIN_URL, "DELETE FROM tenants WHERE id = $1", [signupData.tenantId]);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

console.log("TalScout — Stage-1 Smoke Tests");
console.log("================================");
console.log("Admin URL:", ADMIN_URL?.replace(/:[^:@]+@/, ":***@"));
console.log("App URL:", APP_URL?.replace(/:[^:@]+@/, ":***@"));
console.log("DB Role:", APP_DB_ROLE);
console.log("JWT Secret length:", JWT_SECRET_RAW?.length, "chars");
console.log();

let rlsResult = {};
try {
  rlsResult = await runRlsTests() ?? {};
} catch (e) {
  fail("RLS test section threw", e);
}

await runApiTests(rlsResult.tenantA);

await cleanup();

console.log("\n════════════════════════════════");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("❌ Some tests failed — see above");
  process.exit(1);
} else {
  console.log("✅ All smoke tests passed");
}
