import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/outreach/campaigns/route";
import { POST as fireCampaignPOST } from "../../src/app/api/outreach/campaigns/[id]/fire/route";
import { POST as scheduleFirePOST } from "../../src/app/api/outreach/campaigns/[id]/fire/schedule/route";
import { POST as createSenderPOST } from "../../src/app/api/outreach/senders/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { outreachCampaigns, outreachSends, tenants } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import { outreachLeadRepo, senderAccountRepo } from "../../src/server/repositories/outreach.repo";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const setPlan = (id: string, plan: string) =>
  adminDb().update(tenants).set({ plan }).where(eq(tenants.id, id));

const smtpBody = (email: string) => ({
  label: email,
  email,
  smtpHost: "smtp.test.local",
  smtpPort: 587,
  smtpSecure: false,
  smtpUsername: email,
  smtpPassword: "test-password",
});

async function createReadyCampaign(token: string) {
  const created = await call(createCampaignPOST, {
    token,
    body: { name: "Test Campaign" },
  });
  const campaignId = created.json.data.id as string;
  await adminDb()
    .update(outreachCampaigns)
    .set({ status: "ready" })
    .where(eq(outreachCampaigns.id, campaignId));
  return campaignId;
}

async function seedSender(tenantId: string, email: string, dailyLimit = 1000) {
  // dailyLimit defaults well above anything these plan-gating tests fire, so
  // the tenant-wide daily cap (what most of these tests exercise) isn't
  // incidentally masked by the per-sender cap (schema default: 40/day) — see
  // the dedicated "per-sender dailyLimit" describe block below for that.
  return await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.createSmtp(ctx, {
      label: email,
      email,
      dailyLimit,
      smtpHost: "smtp.test.local",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: email,
      smtpPasswordEnc: "enc:test",
    }),
  );
}

async function seedLeadsWithEmail(tenantId: string, campaignId: string, count: number) {
  return await withTenantTx({ tenantId }, (ctx) =>
    outreachLeadRepo.bulkInsert(
      ctx,
      campaignId,
      Array.from({ length: count }, (_, i) => ({
        name: `Lead ${i}`,
        email: `lead${i}@test.local`,
      })),
    ),
  );
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("Starter plan has no bulk-fire outreach access", () => {
  it("create campaign → 402", async () => {
    const { token } = await makeUser("recruiter"); // default starter
    const res = await call(createCampaignPOST, { token, body: { name: "x" } });
    expect(res.status).toBe(402);
  });

  it("connect sender → 402", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(createSenderPOST, { token, body: smtpBody("a@test.local") });
    expect(res.status).toBe(402);
  });

  it("fire an existing campaign (e.g. after a downgrade) → 402", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 3);
    await setPlan(tenant.id, "starter");

    const res = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(402);
  });

  it("schedule a fire → 402", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");
    const campaignId = await createReadyCampaign(token);
    await setPlan(tenant.id, "starter");

    const res = await call(scheduleFirePOST, {
      token,
      body: { stepIndex: 0, scheduledFireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(402);
  });
});

describe("Growth plan — 1 sender account, 100/day cap, no scheduler", () => {
  it("connecting a second sender account → 402", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");

    const first = await call(createSenderPOST, { token, body: smtpBody("a@test.local") });
    expect(first.status).toBe(201);

    const second = await call(createSenderPOST, { token, body: smtpBody("b@test.local") });
    expect(second.status).toBe(402);
  });

  it("firing to more leads than the daily cap fires as many as fit and skips the rest", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 150);

    const res = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);
    expect(res.json.data.scheduled).toBe(100);
    expect(res.json.data.skippedForDailyCapCount).toBe(50);

    const sends = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    expect(sends.length).toBe(100);
  });

  it("a fire attempted after the daily cap is already used up → 402", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 100);

    const first = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(first.status).toBe(200);
    expect(first.json.data.scheduled).toBe(100);

    const second = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 1 },
      routeCtx: params(campaignId),
    });
    expect(second.status).toBe(402);
  });

  it("scheduling a future fire → 402", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local");

    const res = await call(scheduleFirePOST, {
      token,
      body: { stepIndex: 0, scheduledFireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(402);
  });

  it("concurrent fires across two campaigns never exceed the tenant's daily cap", async () => {
    // Regression test for the count-then-insert race: without the per-tenant
    // advisory lock in fireCampaign, two concurrent fires both read the same
    // "sent today" count and both schedule up to the full remaining quota,
    // letting the tenant blow past the 100/day cap (e.g. 80 + 80 = 160).
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");
    await seedSender(tenant.id, "a@test.local");
    const campaignA = await createReadyCampaign(token);
    const campaignB = await createReadyCampaign(token);
    await seedLeadsWithEmail(tenant.id, campaignA, 80);
    await seedLeadsWithEmail(tenant.id, campaignB, 80);

    const [resA, resB] = await Promise.all([
      call(fireCampaignPOST, { token, body: { stepIndex: 0 }, routeCtx: params(campaignA) }),
      call(fireCampaignPOST, { token, body: { stepIndex: 0 }, routeCtx: params(campaignB) }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const totalScheduled = resA.json.data.scheduled + resB.json.data.scheduled;
    expect(totalScheduled).toBe(100);

    const sends = await adminDb().select().from(outreachSends).where(eq(outreachSends.tenantId, tenant.id));
    expect(sends.length).toBe(100);
  });
});

describe("Scale plan — 5 sender accounts, unlimited sends, scheduler available", () => {
  it("allows up to 5 connected senders, rejects the 6th", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");

    for (let i = 0; i < 5; i++) {
      const res = await call(createSenderPOST, { token, body: smtpBody(`s${i}@test.local`) });
      expect(res.status).toBe(201);
    }
    const sixth = await call(createSenderPOST, { token, body: smtpBody("s5@test.local") });
    expect(sixth.status).toBe(402);
  });

  it("fires to every eligible lead with no daily-cap truncation", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 150);

    const res = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);
    expect(res.json.data.scheduled).toBe(150);
    expect(res.json.data.skippedForDailyCapCount).toBe(0);
  });

  it("scheduling a future fire succeeds", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local");

    const res = await call(scheduleFirePOST, {
      token,
      body: { stepIndex: 0, scheduledFireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);
  });
});

describe("per-sender dailyLimit is enforced independently of the tenant-wide cap", () => {
  it("truncates to a single sender's remaining capacity and reports the skip count", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local", 30);
    await seedLeadsWithEmail(tenant.id, campaignId, 50);

    const res = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);
    expect(res.json.data.scheduled).toBe(30);
    expect(res.json.data.skippedForSenderCapCount).toBe(20);

    const sends = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    expect(sends.length).toBe(30);
  });

  it("sums capacity across multiple senders before truncating", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local", 20);
    await seedSender(tenant.id, "b@test.local", 15);
    await seedLeadsWithEmail(tenant.id, campaignId, 50);

    const res = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);
    expect(res.json.data.scheduled).toBe(35);
    expect(res.json.data.skippedForSenderCapCount).toBe(15);
  });

  it("a fire attempted once every connected sender is fully used up → 402", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");
    const campaignId = await createReadyCampaign(token);
    await seedSender(tenant.id, "a@test.local", 10);
    await seedLeadsWithEmail(tenant.id, campaignId, 10);

    const first = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(first.status).toBe(200);
    expect(first.json.data.scheduled).toBe(10);

    const second = await call(fireCampaignPOST, {
      token,
      body: { stepIndex: 1 },
      routeCtx: params(campaignId),
    });
    expect(second.status).toBe(402);
  });
});
