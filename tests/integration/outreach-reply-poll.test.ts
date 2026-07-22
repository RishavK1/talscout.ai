import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { adminDb, closePools } from "../../src/server/db/client";
import { senderAccounts } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
} from "../../src/server/repositories/outreach.repo";
import { pollOutreachReplies } from "../../src/server/jobs/poll-outreach-replies";
import { getServices } from "../../src/server/container";
import { encryptSecret } from "../../src/server/lib/secret-box";
import type { MockOutreachMailer } from "../../src/server/adapters/mock.outreach-mailer";

function mockMailer(): MockOutreachMailer {
  return getServices().outreachMailer as MockOutreachMailer;
}

async function seedGmailSender(tenantId: string, hasReadScope = true) {
  const [row] = await adminDb()
    .insert(senderAccounts)
    .values({
      tenantId,
      type: "gmail",
      label: "a@test.local",
      email: "a@test.local",
      gmailRefreshTokenEnc: encryptSecret("fake-refresh-token"),
      gmailHasReadScope: hasReadScope,
      isActive: true,
    })
    .returning();
  return row;
}

/** Seeds a campaign + one lead + one already-"sent" threaded send row
 *  directly — this job only cares about what happens once a send has gone
 *  out and carries a gmailThreadId, not about the fire/pacing pipeline. */
async function seedSentThreadedCampaign(tenantId: string, senderId: string) {
  const campaign = await withTenantTx({ tenantId }, (ctx) => outreachCampaignRepo.create(ctx, "Campaign A"));
  const [lead] = await withTenantTx({ tenantId }, (ctx) =>
    outreachLeadRepo.bulkInsert(ctx, campaign.id, [{ name: "Lead 1", email: "l1@test.local" }]),
  );
  const [send] = await withTenantTx({ tenantId }, (ctx) =>
    outreachSendRepo.bulkSchedule(ctx, [
      { campaignId: campaign.id, leadId: lead.id, senderAccountId: senderId, stepIndex: 0, scheduledAt: new Date() },
    ]),
  );
  await withTenantTx({ tenantId }, async (ctx) => {
    await outreachSendRepo.markSentWithThreading(ctx, send.id, {
      rfc822MessageId: "<msg-1@test.local>",
      gmailThreadId: "thread-1",
      sentSubject: "Quick question",
    });
    // Mirrors send-outreach-email.ts, which flips the lead to "sent"
    // alongside the send row — this test seeds directly, bypassing the job.
    await outreachLeadRepo.setStatus(ctx, lead.id, "sent");
  });
  return { campaignId: campaign.id, leadId: lead.id, sendId: send.id };
}

beforeEach(async () => {
  await resetDb();
  mockMailer().threadReplyState = "no_reply";
});
afterAll(async () => {
  await closePools();
});

describe("pollOutreachReplies — Bulk Fire's own reply poll", () => {
  it("marks a lead 'replied' when its thread shows a reply", async () => {
    const { tenant } = await makeUser("recruiter");
    const sender = await seedGmailSender(tenant.id);
    const { leadId } = await seedSentThreadedCampaign(tenant.id, sender.id);

    mockMailer().threadReplyState = "replied";
    await pollOutreachReplies(getServices());

    const lead = await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachLeadRepo.getById(ctx, leadId));
    expect(lead?.status).toBe("replied");
  });

  it("leaves the lead's status alone when there is no reply", async () => {
    const { tenant } = await makeUser("recruiter");
    const sender = await seedGmailSender(tenant.id);
    const { leadId } = await seedSentThreadedCampaign(tenant.id, sender.id);

    mockMailer().threadReplyState = "no_reply";
    await pollOutreachReplies(getServices());

    const lead = await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachLeadRepo.getById(ctx, leadId));
    expect(lead?.status).toBe("sent");
  });

  it("skips senders without Gmail read scope rather than erroring", async () => {
    const { tenant } = await makeUser("recruiter");
    const sender = await seedGmailSender(tenant.id, false);
    const { leadId } = await seedSentThreadedCampaign(tenant.id, sender.id);

    mockMailer().threadReplyState = "replied";
    await expect(pollOutreachReplies(getServices())).resolves.not.toThrow();

    const lead = await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachLeadRepo.getById(ctx, leadId));
    expect(lead?.status).toBe("sent");
  });

  it("is idempotent — a repeat poll tick never re-flips an already-replied lead", async () => {
    const { tenant } = await makeUser("recruiter");
    const sender = await seedGmailSender(tenant.id);
    const { leadId } = await seedSentThreadedCampaign(tenant.id, sender.id);

    mockMailer().threadReplyState = "replied";
    await pollOutreachReplies(getServices());
    await pollOutreachReplies(getServices());

    const lead = await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachLeadRepo.getById(ctx, leadId));
    expect(lead?.status).toBe("replied");
  });

  it("is tenant-isolated: one tenant's reply poll never touches another tenant's leads", async () => {
    const { tenant } = await makeUser("recruiter");
    const sender = await seedGmailSender(tenant.id);
    await seedSentThreadedCampaign(tenant.id, sender.id);

    const { tenant: other } = await makeUser("recruiter");
    const otherSender = await seedGmailSender(other.id);
    const { leadId: otherLeadId } = await seedSentThreadedCampaign(other.id, otherSender.id);

    mockMailer().threadReplyState = "no_reply";
    await pollOutreachReplies(getServices());

    const otherLead = await withTenantTx({ tenantId: other.id }, (ctx) => outreachLeadRepo.getById(ctx, otherLeadId));
    expect(otherLead?.status).toBe("sent");
  });
});
