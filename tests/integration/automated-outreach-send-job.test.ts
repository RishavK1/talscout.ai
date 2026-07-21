import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { POST as resumeCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/resume/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { blueprints, senderAccounts, automatedCampaigns, automatedLeads } from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";
import { withTenantTx } from "../../src/server/db/tx";
import {
  automatedLeadRepo,
  automatedSendRepo,
} from "../../src/server/repositories/automated-outreach.repo";
import { sendAutomatedEmail } from "../../src/server/jobs/send-automated-email";
import { getServices } from "../../src/server/container";
import type { MockOutreachMailer } from "../../src/server/adapters/mock.outreach-mailer";
import type { BlueprintSections } from "../../src/server/ports";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const MINIMAL_SECTIONS: BlueprintSections = {
  whoWeAre: "Acme Co.",
  whatWeOffer: "A scheduling tool",
  whoItsFor: "Small agencies",
  differentiator: "Faster onboarding",
  painWeSolve: "Manual scheduling",
  proof: [{ label: "100+ customers" }],
  personas: [{ name: "Owner" }],
  voice: "Friendly and direct",
  objections: ["Too expensive"],
  rules: ["Never invent facts", "Keep it short"],
};

async function seedActiveBlueprint(tenantId: string) {
  const [row] = await adminDb()
    .insert(blueprints)
    .values({ tenantId, name: "Acme Offer", status: "active", sections: MINIMAL_SECTIONS })
    .returning();
  return row;
}

async function seedGmailSender(tenantId: string, email = "a@test.local") {
  const [row] = await adminDb()
    .insert(senderAccounts)
    .values({
      tenantId,
      type: "gmail",
      label: email,
      email,
      gmailRefreshTokenEnc: encryptSecret("fake-refresh-token"),
      gmailHasReadScope: true,
      isActive: true,
    })
    .returning();
  return row;
}

/** Creates a campaign + one lead + one "scheduled" automated_sends row
 *  directly (bypassing discovery/enrichment/copy-generation entirely) —
 *  this test suite is only concerned with what happens when the delayed
 *  send job actually wakes up and runs. */
async function seedCampaignWithScheduledSend(token: string, tenantId: string) {
  const blueprint = await seedActiveBlueprint(tenantId);
  const sender = await seedGmailSender(tenantId);
  const created = await call(createCampaignPOST, {
    token,
    body: {
      name: "Campaign",
      blueprintId: blueprint.id,
      senderAccountId: sender.id,
      discoveryQuery: { category: "dentist", location: { text: "Austin, TX" } },
      signatureName: "Jane Doe",
      replyPollingEnabled: false,
    },
  });
  const campaignId = created.json.data.id as string;
  await call(resumeCampaignPOST, { token, method: "POST", routeCtx: params(campaignId) });

  const { leadId, sendId } = await withTenantTx({ tenantId }, async (ctx) => {
    const [lead] = await automatedLeadRepo.upsertDiscovered(ctx, campaignId, [
      { sourcePlaceId: "osm:node/1", name: "Test Dentist", email: "hello@testdentist.example.com" },
    ]);
    const [send] = await automatedSendRepo.bulkInsert(ctx, [
      {
        campaignId,
        leadId: lead.id,
        senderAccountId: sender.id,
        subject: "Quick question",
        body: "Hi there,\n\nBest regards,\nJane Doe",
        scheduledAt: new Date(),
      },
    ]);
    return { leadId: lead.id, sendId: send.id };
  });

  return { campaignId, leadId, sendId };
}

function mockMailer(): MockOutreachMailer {
  return getServices().outreachMailer as MockOutreachMailer;
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("sendAutomatedEmail — the delayed, per-send job", () => {
  it("sends the email and marks the send + lead as sent", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { sendId, leadId } = await seedCampaignWithScheduledSend(token, tenant.id);
    const sentBefore = mockMailer().sent.length;

    await sendAutomatedEmail({ tenantId: tenant.id, sendId }, getServices());

    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedSendRepo.getById(ctx, sendId));
    expect(send?.status).toBe("sent");
    expect(send?.sentAt).not.toBeNull();
    const lead = await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedLeadRepo.getById(ctx, leadId));
    expect(lead?.status).toBe("sent");
    expect(mockMailer().sent.length).toBe(sentBefore + 1);
  });

  it("skips the send (never fires) if the campaign was paused before the job woke up", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { campaignId, sendId, leadId } = await seedCampaignWithScheduledSend(token, tenant.id);
    const sentBefore = mockMailer().sent.length;

    // Simulate the real-world race this pacing model creates on purpose: the
    // send was scheduled minutes ago, but the user paused the campaign in
    // between scheduling and the job actually waking up.
    await adminDb()
      .update(automatedCampaigns)
      .set({ status: "paused" })
      .where(eq(automatedCampaigns.id, campaignId));

    await sendAutomatedEmail({ tenantId: tenant.id, sendId }, getServices());

    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedSendRepo.getById(ctx, sendId));
    expect(send?.status).toBe("skipped");
    expect(send?.errorReason).toBe("campaign_not_active");
    expect(mockMailer().sent.length).toBe(sentBefore); // nothing was sent
    void leadId;
  });

  it("is idempotent — re-running a job for an already-sent row is a no-op", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { sendId } = await seedCampaignWithScheduledSend(token, tenant.id);

    await sendAutomatedEmail({ tenantId: tenant.id, sendId }, getServices());
    const sentAfterFirst = mockMailer().sent.length;

    await sendAutomatedEmail({ tenantId: tenant.id, sendId }, getServices());
    expect(mockMailer().sent.length).toBe(sentAfterFirst); // not sent twice
  });

  it("skips cleanly if the lead has no email (defensive — shouldn't normally happen)", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { sendId, leadId } = await seedCampaignWithScheduledSend(token, tenant.id);
    await adminDb().update(automatedLeads).set({ email: null }).where(eq(automatedLeads.id, leadId));

    await sendAutomatedEmail({ tenantId: tenant.id, sendId }, getServices());

    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedSendRepo.getById(ctx, sendId));
    expect(send?.status).toBe("skipped");
    expect(send?.errorReason).toBe("lead_missing_email");
  });
});
