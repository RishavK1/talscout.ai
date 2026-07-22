import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as analyticsOverviewGET } from "../../src/app/api/analytics/overview/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { outreachSends, outreachLeads } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "../../src/server/repositories/outreach.repo";
import { encryptSecret } from "../../src/server/lib/secret-box";
import { analyticsRepo } from "../../src/server/repositories/analytics.repo";

/**
 * Analytics reads EXISTING outreach data read-only — these tests seed real
 * campaigns/leads/sends via the same repos bulk-fire uses, then assert the
 * aggregation math, so a broken groupBy/join can't silently ship.
 */

async function seedSender(tenantId: string) {
  return await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.createSmtp(ctx, {
      label: "a@test.local",
      email: "a@test.local",
      smtpHost: "smtp.test.local",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: "a@test.local",
      smtpPasswordEnc: encryptSecret("pw"),
    }),
  );
}

async function seedCampaignWithSends(
  tenantId: string,
  name: string,
  senderId: string,
  statuses: Array<"scheduled" | "sent" | "failed" | "skipped">,
) {
  const campaign = await withTenantTx({ tenantId }, (ctx) =>
    outreachCampaignRepo.create(ctx, name),
  );
  const leads = await withTenantTx({ tenantId }, (ctx) =>
    outreachLeadRepo.bulkInsert(
      ctx,
      campaign.id,
      statuses.map((_, i) => ({ name: `Lead ${i}`, email: `l${i}-${name}@test.local` })),
    ),
  );
  const sends = await withTenantTx({ tenantId }, (ctx) =>
    outreachSendRepo.bulkSchedule(
      ctx,
      leads.map((lead, i) => ({
        campaignId: campaign.id,
        leadId: lead.id,
        senderAccountId: senderId,
        stepIndex: 0,
        scheduledAt: new Date(),
      })),
    ),
  );
  for (let i = 0; i < sends.length; i++) {
    await adminDb()
      .update(outreachSends)
      .set({
        status: statuses[i],
        sentAt: statuses[i] === "sent" ? new Date() : null,
      })
      .where(eq(outreachSends.id, sends[i].id));
  }
  return { campaignId: campaign.id, leadIds: leads.map((l) => l.id) };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("GET /api/analytics/overview", () => {
  it("aggregates status totals across all campaigns for the tenant", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    await seedCampaignWithSends(tenant.id, "Campaign A", sender.id, [
      "sent",
      "sent",
      "failed",
    ]);
    await seedCampaignWithSends(tenant.id, "Campaign B", sender.id, [
      "sent",
      "scheduled",
      "skipped",
    ]);

    const res = await call(analyticsOverviewGET, { token });
    expect(res.status).toBe(200);
    expect(res.json.data.totals).toMatchObject({
      sent: 3,
      failed: 1,
      scheduled: 1,
      skipped: 1,
      total: 6,
    });
    expect(res.json.data.tracked.opened).toBe(true);
    expect(res.json.data.tracked.replied).toBe(true);
    expect(res.json.data.tracked.sent).toBe(true);
  });

  it("breaks down status counts per campaign", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    const a = await seedCampaignWithSends(tenant.id, "Campaign A", sender.id, [
      "sent",
      "sent",
    ]);
    const b = await seedCampaignWithSends(tenant.id, "Campaign B", sender.id, ["failed"]);

    const res = await call(analyticsOverviewGET, { token });
    const byCampaign = res.json.data.byCampaign as Array<{
      campaignId: string;
      sent: number;
      failed: number;
    }>;
    const rowA = byCampaign.find((r) => r.campaignId === a.campaignId);
    const rowB = byCampaign.find((r) => r.campaignId === b.campaignId);
    expect(rowA?.sent).toBe(2);
    expect(rowB?.failed).toBe(1);
  });

  it("counts bounced leads separately from send-status totals", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    const { leadIds } = await seedCampaignWithSends(tenant.id, "Campaign A", sender.id, [
      "sent",
    ]);
    await adminDb()
      .update(outreachLeads)
      .set({ status: "bounced" })
      .where(eq(outreachLeads.id, leadIds[0]));

    const res = await call(analyticsOverviewGET, { token });
    expect(res.json.data.totals.bounced).toBe(1);
  });

  it("counts leads whose thread showed a reply", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    const { leadIds } = await seedCampaignWithSends(tenant.id, "Campaign A", sender.id, [
      "sent",
      "sent",
    ]);
    await adminDb()
      .update(outreachLeads)
      .set({ status: "replied" })
      .where(eq(outreachLeads.id, leadIds[0]));

    const res = await call(analyticsOverviewGET, { token });
    expect(res.json.data.totals.replied).toBe(1);
  });

  it("counts sends whose tracking pixel was fetched", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    const { campaignId } = await seedCampaignWithSends(tenant.id, "Campaign A", sender.id, [
      "sent",
      "sent",
    ]);
    const [firstSend] = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    await adminDb()
      .update(outreachSends)
      .set({ openedAt: new Date() })
      .where(eq(outreachSends.id, firstSend.id));

    const res = await call(analyticsOverviewGET, { token });
    expect(res.json.data.totals.opened).toBe(1);
  });

  it("folds a WhatsApp 'read' delivery status into the same Opened total as the email pixel", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    const { campaignId } = await seedCampaignWithSends(tenant.id, "Campaign A", sender.id, [
      "sent",
      "sent",
    ]);
    const [firstSend] = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    await adminDb()
      .update(outreachSends)
      .set({ deliveryStatus: "read" })
      .where(eq(outreachSends.id, firstSend.id));

    const res = await call(analyticsOverviewGET, { token });
    expect(res.json.data.totals.opened).toBe(1);
  });

  it("is tenant-isolated: another tenant's sends never appear in totals", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    await seedCampaignWithSends(tenant.id, "Mine", sender.id, ["sent"]);

    const { tenant: other } = await makeUser("recruiter");
    const otherSender = await seedSender(other.id);
    await seedCampaignWithSends(other.id, "Theirs", otherSender.id, ["sent", "sent", "sent"]);

    const res = await call(analyticsOverviewGET, { token });
    expect(res.json.data.totals.sent).toBe(1);
  });

  it("pads the daily trend to a continuous window with zeros for gap days", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(analyticsOverviewGET, { token, url: "http://test.local/api?days=7" });
    expect(res.status).toBe(200);
    expect(res.json.data.daily).toHaveLength(7);
    expect(res.json.data.days).toBe(7);
    for (const point of res.json.data.daily) {
      expect(point).toHaveProperty("day");
      expect(point).toHaveProperty("sent");
    }
  });

  it("falls back to the default window for an out-of-range days query rather than erroring", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(analyticsOverviewGET, {
      token,
      url: "http://test.local/api?days=9999",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.days).toBe(14);
  });
});

describe("analyticsRepo directly", () => {
  it("dailySentSeries only counts rows with status=sent and a real sentAt", async () => {
    const { tenant } = await makeUser("recruiter");
    const sender = await seedSender(tenant.id);
    await seedCampaignWithSends(tenant.id, "Campaign A", sender.id, [
      "sent",
      "scheduled",
      "failed",
    ]);

    const series = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      analyticsRepo.dailySentSeries(ctx, 7),
    );
    const total = series.reduce((sum, p) => sum + p.sent, 0);
    expect(total).toBe(1);
  });
});
