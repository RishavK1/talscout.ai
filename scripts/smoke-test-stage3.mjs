/**
 * TalScout — Stage-3 Billing & Entitlements Smoke Tests
 *
 * Verifies:
 *  1. POST /api/auth/signup -> create workspace.
 *  2. POST /api/team -> invite member fails with 402 (PAY-05: active sub required).
 *  3. POST /api/billing/checkout -> creates a real Stripe Checkout Session (live hit!).
 *  4. POST /api/webhooks/stripe -> receives simulated signed webhook event,
 *     activating the subscription and setting seat limits (PAY-01/02/03).
 *  5. POST /api/team -> invite members up to the seat limit (succeeds).
 *  6. POST /api/team -> inviting more than the seat limit fails with 402 (PAY-06).
 *  7. DELETE /api/team/:userId -> removing a member frees up a seat (PAY-07).
 *  8. POST /api/team -> invitation now succeeds (recycled seat verified).
 *  9. Clean up tenant from DB.
 *
 * Run:
 *   node --env-file=.env.live scripts/smoke-test-stage3.mjs
 */

import pg from "pg";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";

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

const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const JWT_SECRET_RAW = process.env.SUPABASE_JWT_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const NEXT_APP_URL = process.env.APP_URL ?? "http://localhost:3100";

if (!ADMIN_URL) throw new Error("DATABASE_ADMIN_URL (or DATABASE_URL) required");
if (!JWT_SECRET_RAW) throw new Error("SUPABASE_JWT_SECRET required");
if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY required");
if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET required");

const ssl = { rejectUnauthorized: false };
const stripe = new Stripe(STRIPE_SECRET_KEY);

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

async function runStage3Tests() {
  console.log("\n═══ Stage 3 Stripe Billing & Entitlement Smoke Test ═══");

  const adminAuthId = randomUUID();
  const adminEmail = `smoke-billing-admin-${Date.now()}@talscout-test.dev`;
  let tenantId = null;
  let member1Id = null;
  let member2Id = null;

  // 1. Provision Workspace
  await expect("POST /api/auth/signup → 200, workspace provisioned", async () => {
    const jwt = await mintJwt(adminAuthId, adminEmail);
    const res = await fetch(`${NEXT_APP_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ workspaceName: `Billing Agency ${Date.now()}` }),
    });
    const body = await res.json();
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}`);
    tenantId = body.data.tenantId;
    console.log("    Tenant ID:", tenantId);
  });

  if (!tenantId) {
    fail("Cannot continue without tenantId");
    return;
  }

  // 2. Privilege validation: expect invite to fail without active subscription (PAY-05)
  await expect("POST /api/team (invite) → 402, subscription required (PAY-05)", async () => {
    const jwt = await mintJwt(adminAuthId, adminEmail);
    const res = await fetch(`${NEXT_APP_URL}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ email: `m1-${Date.now()}@talscout-test.dev`, role: "recruiter" }),
    });
    assert(res.status === 402, `Expected 402 Payment Required, got ${res.status}`);
    const body = await res.json();
    assert(body.error?.message.includes("No seats available"), `Unexpected error message: ${body.error?.message}`);
  });

  // 3. Create Stripe Checkout Session (Live hit!)
  await expect("POST /api/billing/checkout → 200, Stripe session URL returned", async () => {
    const jwt = await mintJwt(adminAuthId, adminEmail);
    const res = await fetch(`${NEXT_APP_URL}/api/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ plan: "growth", seats: 3 }),
    });
    const body = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.data?.url, "No checkout session URL returned");
    assert(body.data.url.includes("checkout.stripe.com"), "URL does not point to Stripe checkout");
    console.log("    Checkout URL:", body.data.url);
  });

  // 4. Simulate signature-verified webhook to activate subscription (PAY-01/02/03)
  await expect("POST /api/webhooks/stripe → 200, signs and processes event", async () => {
    const payload = {
      id: `evt_smoke_${Date.now()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          customer: `cus_smoke_${Date.now()}`,
          subscription: `sub_smoke_${Date.now()}`,
          metadata: {
            tenantId,
            plan: "growth",
            seats: "3",
          }
        }
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: STRIPE_WEBHOOK_SECRET,
    });

    const res = await fetch(`${NEXT_APP_URL}/api/webhooks/stripe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: payloadString,
    });
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.ok === true, "ok != true");
  });

  // Verify DB update
  await expect("Verify subscription active in database (3 seats, plan=growth)", async () => {
    const rSub = await query(ADMIN_URL, "SELECT status, seats FROM subscriptions WHERE tenant_id = $1", [tenantId]);
    assert(rSub.rows.length === 1, "Subscription record not found");
    assert(rSub.rows[0].status === "active", `Expected active, got ${rSub.rows[0].status}`);
    assert(rSub.rows[0].seats === 3, `Expected 3 seats, got ${rSub.rows[0].seats}`);

    const rTenant = await query(ADMIN_URL, "SELECT plan, seat_limit FROM tenants WHERE id = $1", [tenantId]);
    assert(rTenant.rows[0].plan === "growth", `Expected plan growth, got ${rTenant.rows[0].plan}`);
    assert(rTenant.rows[0].seat_limit === 3, `Expected seat limit 3, got ${rTenant.rows[0].seat_limit}`);
  });

  // 5. Invite team members up to seat limit (purchased seats = 3. Creator takes 1 seat, so we can invite 2 more)
  await expect("POST /api/team → invite Member 1 (succeeds, seat 2/3)", async () => {
    const jwt = await mintJwt(adminAuthId, adminEmail);
    const res = await fetch(`${NEXT_APP_URL}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ email: `member1-${Date.now()}@talscout-test.dev`, role: "recruiter" }),
    });
    const body = await res.json();
    assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(body)}`);
    member1Id = body.data.id;
  });

  await expect("POST /api/team → invite Member 2 (succeeds, seat 3/3)", async () => {
    const jwt = await mintJwt(adminAuthId, adminEmail);
    const res = await fetch(`${NEXT_APP_URL}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ email: `member2-${Date.now()}@talscout-test.dev`, role: "recruiter" }),
    });
    const body = await res.json();
    assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(body)}`);
    member2Id = body.data.id;
  });

  // 6. Exceed seat limit (seat 4/3 -> should fail with 402 PAY-06)
  await expect("POST /api/team → invite Member 3 (fails with 402, quota reached) (PAY-06)", async () => {
    const jwt = await mintJwt(adminAuthId, adminEmail);
    const res = await fetch(`${NEXT_APP_URL}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ email: `member3-${Date.now()}@talscout-test.dev`, role: "recruiter" }),
    });
    assert(res.status === 402, `Expected 402, got ${res.status}`);
    const body = await res.json();
    assert(body.error?.message.includes("No seats available"), "Unexpected error message");
  });

  // 7. Remove Member 1 to free up a seat (PAY-07)
  if (member1Id) {
    await expect("DELETE /api/team/:id → remove Member 1 to free up a seat (PAY-07)", async () => {
      const jwt = await mintJwt(adminAuthId, adminEmail);
      const res = await fetch(`${NEXT_APP_URL}/api/team/${member1Id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${jwt}` },
      });
      assert(res.status === 200 || res.status === 204, `Expected 200/204, got ${res.status}`);
    });
  }

  // 8. Re-invite Member 3 (seat count is 2/3 now, should succeed)
  await expect("POST /api/team → invite Member 3 again (now succeeds) (PAY-07)", async () => {
    const jwt = await mintJwt(adminAuthId, adminEmail);
    const res = await fetch(`${NEXT_APP_URL}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ email: `member3-${Date.now()}@talscout-test.dev`, role: "recruiter" }),
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
  });

  // 9. Cleanup
  if (tenantId) {
    await expect("Clean up test tenant from DB", async () => {
      await query(ADMIN_URL, "DELETE FROM tenants WHERE id = $1", [tenantId]);
    });
  }
}

console.log("TalScout — Stage-3 Smoke Tests");
console.log("================================");
console.log("Admin URL:", ADMIN_URL?.replace(/:[^:@]+@/, ":***@"));
console.log("App URL:", NEXT_APP_URL);
console.log();

try {
  await runStage3Tests();
} catch (e) {
  fail("Stage 3 tests failed with exception", e);
}

console.log("\n════════════════════════════════");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("❌ Stage 3 tests failed — see above");
  process.exit(1);
} else {
  console.log("✅ All Stage 3 tests passed");
  process.exit(0);
}
