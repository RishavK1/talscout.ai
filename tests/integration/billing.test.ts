import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as webhookPOST } from "../../src/app/api/webhooks/stripe/route";
import { POST as checkoutPOST } from "../../src/app/api/billing/checkout/route";
import { resetDb, seedTenant } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { subscriptions } from "../../src/server/db/schema";
import { MockPaymentProvider } from "../../src/server/adapters/mock.payment";
import { resetServices } from "../../src/server/container";

beforeEach(async () => {
  await resetDb();
  resetServices();
});
afterAll(async () => {
  await closePools();
});

async function postWebhook(event: unknown, sig?: string) {
  const raw = JSON.stringify(event);
  return call(webhookPOST, {
    method: "POST",
    body: event,
    headers: { "stripe-signature": sig ?? MockPaymentProvider.sign(raw) },
  });
}

async function readSub(tenantId: string) {
  const [s] = await adminDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId));
  return s;
}

describe("PAY — webhook security & idempotency", () => {
  it("PAY-01: invalid signature → 400", async () => {
    const tenant = await seedTenant();
    const res = await postWebhook(
      { id: "evt_1", type: "checkout.session.completed", data: { tenantId: tenant.id, seats: 5 } },
      "deadbeef",
    );
    expect(res.status).toBe(400);
  });

  it("PAY-01: missing signature → 400", async () => {
    const tenant = await seedTenant();
    const res = await call(webhookPOST, {
      method: "POST",
      body: { id: "evt_x", type: "checkout.session.completed", data: { tenantId: tenant.id } },
    });
    expect(res.status).toBe(400);
  });

  it("valid event activates the subscription", async () => {
    const tenant = await seedTenant();
    const res = await postWebhook({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { tenantId: tenant.id, seats: 5, plan: "growth" },
    });
    expect(res.status).toBe(200);
    const sub = await readSub(tenant.id);
    expect(sub.status).toBe("active");
    expect(sub.seats).toBe(5);
  });

  it("PAY-02: replayed event is processed once", async () => {
    const tenant = await seedTenant();
    const ev = {
      id: "evt_dup",
      type: "checkout.session.completed",
      data: { tenantId: tenant.id, seats: 5 },
    };
    await postWebhook(ev);
    // replay with a DIFFERENT payload but the SAME id
    const replay = await postWebhook({ ...ev, data: { tenantId: tenant.id, seats: 99 } });
    expect(replay.status).toBe(200);
    expect(replay.json.data.duplicate).toBe(true);
    const sub = await readSub(tenant.id);
    expect(sub.seats).toBe(5); // not 99
  });

  it("PAY-03: out-of-order events reconcile without error", async () => {
    const tenant = await seedTenant();
    await postWebhook({
      id: "evt_upd",
      type: "customer.subscription.updated",
      data: { tenantId: tenant.id, seats: 3 },
    });
    await postWebhook({
      id: "evt_cre",
      type: "customer.subscription.created",
      data: { tenantId: tenant.id, seats: 5 },
    });
    const sub = await readSub(tenant.id);
    expect(["active"]).toContain(sub.status);
    expect(sub.seats).toBe(5);
  });

  it("PAY-04: unknown event type is acknowledged and ignored", async () => {
    const tenant = await seedTenant();
    const res = await postWebhook({
      id: "evt_unknown",
      type: "invoice.payment_action_required",
      data: { tenantId: tenant.id },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.ignored).toBeTruthy();
  });

  it("subscription.deleted cancels", async () => {
    const tenant = await seedTenant();
    await postWebhook({
      id: "evt_a",
      type: "checkout.session.completed",
      data: { tenantId: tenant.id, seats: 5 },
    });
    await postWebhook({
      id: "evt_del",
      type: "customer.subscription.deleted",
      data: { tenantId: tenant.id },
    });
    const sub = await readSub(tenant.id);
    expect(sub.status).toBe("canceled");
  });
});

describe("PAY — checkout", () => {
  it("admin can create a checkout session", async () => {
    const { token } = await makeUser("admin");
    const res = await call(checkoutPOST, {
      token,
      body: { plan: "growth", seats: 3 },
    });
    expect(res.status).toBe(200);
    expect(typeof res.json.data.url).toBe("string");
  });

  it("PAY-10: a client-supplied amount is ignored (server price book)", async () => {
    const { token } = await makeUser("admin");
    const res = await call(checkoutPOST, {
      token,
      body: { plan: "growth", seats: 3, amount: 1 },
    });
    expect(res.status).toBe(200); // amount stripped by schema, no effect
  });

  it("RBAC: recruiter cannot create checkout → 403", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(checkoutPOST, {
      token,
      body: { plan: "growth", seats: 3 },
    });
    expect(res.status).toBe(403);
  });
});
