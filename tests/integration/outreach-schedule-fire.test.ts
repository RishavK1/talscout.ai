import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DELETE as scheduleDELETE } from "../../src/app/api/outreach/campaigns/[id]/fire/schedule/route";
import { PUT as sendersPUT } from "../../src/app/api/outreach/campaigns/[id]/senders/route";
import { POST as createCampaignPOST } from "../../src/app/api/outreach/campaigns/route";
import { GET as getCampaignGET } from "../../src/app/api/outreach/campaigns/[id]/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { outreachCampaigns, outreachSends } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import { outreachService } from "../../src/server/services/outreach.service";
import {
  outreachLeadRepo,
  senderAccountRepo,
} from "../../src/server/repositories/outreach.repo";
import { fireScheduledCampaign } from "../../src/server/jobs/fire-scheduled-campaign";
import { getServices } from "../../src/server/container";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function createReadyCampaign(token: string) {
  const created = await call(createCampaignPOST, {
    token,
    body: { name: "Test Campaign" },
  });
  const campaignId = created.json.data.id as string;
  // scheduleFire/fireCampaign both require "ready" or "running" — a fresh
  // campaign starts "draft", so flip it directly (mirrors how the leads
  // import job would normally do this).
  await adminDb()
    .update(outreachCampaigns)
    .set({ status: "ready" })
    .where(eq(outreachCampaigns.id, campaignId));
  return campaignId;
}

/**
 * Directly seeds a "pending schedule" DB state, bypassing the HTTP route.
 * Going through the real POST /fire/schedule endpoint isn't useful for this
 * because APP_MODE=mock's InProcessQueue runs the enqueued job SYNCHRONOUSLY
 * inside afterCommit (see container.ts's comment on FIRE_SCHEDULED_CAMPAIGN_JOB) —
 * so the "pending" window collapses to zero and the campaign is
 * fired/errored before the POST call even returns. A real Inngest queue
 * would actually wait via step.sleepUntil; this helper reproduces that
 * "still waiting" state so cancel/staleness can be exercised deterministically.
 */
async function seedPendingSchedule(
  tenantId: string,
  campaignId: string,
  scheduledFireAt: string,
) {
  await withTenantTx({ tenantId }, (ctx) =>
    outreachService.scheduleFire(
      ctx,
      campaignId,
      0,
      new Date(scheduledFireAt),
    ),
  );
}

async function seedSender(tenantId: string, email: string) {
  return await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.createSmtp(ctx, {
      label: email,
      email,
      smtpHost: "smtp.test.local",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: email,
      smtpPasswordEnc: "enc:test",
    }),
  );
}

async function seedLeadsWithEmail(
  tenantId: string,
  campaignId: string,
  count: number,
) {
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

describe("outreachService.scheduleFire / cancelScheduledFire", () => {
  it("persists scheduledFireAt/stepIndex on the campaign row", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    const scheduledFireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await seedPendingSchedule(tenant.id, campaignId, scheduledFireAt);

    const got = await call(getCampaignGET, { token, routeCtx: params(campaignId) });
    expect(got.json.data.campaign.scheduledFireAt).toBe(scheduledFireAt);
    expect(got.json.data.campaign.scheduledFireStepIndex).toBe(0);
  });

  it("rejects a past scheduled time with 400", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    await expect(
      withTenantTx({ tenantId: tenant.id }, (ctx) =>
        outreachService.scheduleFire(
          ctx,
          campaignId,
          0,
          new Date(Date.now() - 1000),
        ),
      ),
    ).rejects.toThrow(/future/i);
  });

  it("cancel clears a pending schedule via the DELETE route", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    await seedPendingSchedule(
      tenant.id,
      campaignId,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );

    const del = await call(scheduleDELETE, {
      token,
      method: "DELETE",
      routeCtx: params(campaignId),
    });
    expect(del.status).toBe(200);

    const got = await call(getCampaignGET, { token, routeCtx: params(campaignId) });
    expect(got.json.data.campaign.scheduledFireAt).toBeNull();
  });
});

describe("fireScheduledCampaign job — re-validate-before-acting", () => {
  it("is a no-op when the wake-up is stale (canceled/rescheduled since enqueue)", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    const scheduledFireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await seedPendingSchedule(tenant.id, campaignId, scheduledFireAt);

    // Simulate a wake-up carrying a stale timestamp — as if the schedule had
    // since been canceled or rescheduled to a different time.
    await fireScheduledCampaign(
      {
        tenantId: tenant.id,
        campaignId,
        scheduledFireAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      getServices(),
    );

    const got = await call(getCampaignGET, { token, routeCtx: params(campaignId) });
    // Untouched — the live scheduledFireAt still matches what was actually set.
    expect(got.json.data.campaign.scheduledFireAt).toBe(scheduledFireAt);
    expect(got.json.data.campaign.status).toBe("ready");
  });

  it("surfaces a failure (no sender connected) as campaign status=error and clears the schedule", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    const scheduledFireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await seedPendingSchedule(tenant.id, campaignId, scheduledFireAt);

    await fireScheduledCampaign(
      { tenantId: tenant.id, campaignId, scheduledFireAt },
      getServices(),
    );

    const got = await call(getCampaignGET, { token, routeCtx: params(campaignId) });
    expect(got.json.data.campaign.status).toBe("error");
    expect(got.json.data.campaign.errorReason).toMatch(/sender/i);
    expect(got.json.data.campaign.scheduledFireAt).toBeNull();
  });
});

describe("per-campaign sender selection", () => {
  it("no selection still round-robins across every active sender", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    const senderA = await seedSender(tenant.id, "a@test.local");
    const senderB = await seedSender(tenant.id, "b@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 4);

    const { afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await afterCommit?.();

    const sends = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    const usedSenderIds = new Set(sends.map((s) => s.senderAccountId));
    expect(usedSenderIds).toEqual(new Set([senderA.id, senderB.id]));
  });

  it("a selected sender is the only one used when firing immediately", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    const senderA = await seedSender(tenant.id, "a@test.local");
    await seedSender(tenant.id, "b@test.local"); // unselected — must be excluded
    await seedLeadsWithEmail(tenant.id, campaignId, 4);

    const put = await call(sendersPUT, {
      token,
      method: "PUT",
      body: { senderAccountIds: [senderA.id] },
      routeCtx: params(campaignId),
    });
    expect(put.status).toBe(200);

    const { afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await afterCommit?.();

    const sends = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    expect(sends.length).toBeGreaterThan(0);
    expect(sends.every((s) => s.senderAccountId === senderA.id)).toBe(true);
  });

  it("rejects an invalid/foreign sender id with 400", async () => {
    const { token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);

    const put = await call(sendersPUT, {
      token,
      method: "PUT",
      body: { senderAccountIds: [crypto.randomUUID()] },
      routeCtx: params(campaignId),
    });
    expect(put.status).toBe(400);
  });

  it("a scheduled fire also honors the campaign's selected sender", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(token);
    const senderA = await seedSender(tenant.id, "a@test.local");
    await seedSender(tenant.id, "b@test.local"); // unselected — must be excluded
    await seedLeadsWithEmail(tenant.id, campaignId, 4);

    const put = await call(sendersPUT, {
      token,
      method: "PUT",
      body: { senderAccountIds: [senderA.id] },
      routeCtx: params(campaignId),
    });
    expect(put.status).toBe(200);

    const scheduledFireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await seedPendingSchedule(tenant.id, campaignId, scheduledFireAt);

    // Simulate the durable job actually waking up and firing for real.
    await fireScheduledCampaign(
      { tenantId: tenant.id, campaignId, scheduledFireAt },
      getServices(),
    );

    const got = await call(getCampaignGET, { token, routeCtx: params(campaignId) });
    expect(got.json.data.campaign.status).toBe("running");

    const sends = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    expect(sends.length).toBeGreaterThan(0);
    expect(sends.every((s) => s.senderAccountId === senderA.id)).toBe(true);
  });
});
