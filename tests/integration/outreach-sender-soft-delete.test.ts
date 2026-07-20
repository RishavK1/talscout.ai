import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createSmtpSenderPOST, GET as listSendersGET } from "../../src/app/api/outreach/senders/route";
import { DELETE as deleteSenderDELETE, PATCH as patchSenderPATCH } from "../../src/app/api/outreach/senders/[id]/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { outreachSends, tenants } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import { outreachService } from "../../src/server/services/outreach.service";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "../../src/server/repositories/outreach.repo";
import { encryptSecret } from "../../src/server/lib/secret-box";

/**
 * Root-cause fix for the PixelorCode production incident: disconnecting a
 * sender used to hard-DELETE the row, which cascade-deleted every
 * outreach_sends row referencing it (the FK is onDelete: cascade) — wiping a
 * campaign's entire send history and Gmail threading anchors. "Disconnect"
 * is now a soft-delete (deletedAt + scrubbed credentials); these tests
 * assert history survives and reconnect-by-email revives the same row.
 */

async function seedSmtpSender(tenantId: string, email: string) {
  return await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.createSmtp(ctx, {
      label: email,
      email,
      dailyLimit: 100,
      smtpHost: "smtp.test.local",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: email,
      smtpPasswordEnc: encryptSecret("test-password"),
    }),
  );
}

async function seedSentCampaignWithSender(tenantId: string, senderId: string) {
  await adminDb().update(tenants).set({ plan: "scale" }).where(eq(tenants.id, tenantId));
  const campaign = await withTenantTx({ tenantId }, (ctx) => outreachCampaignRepo.create(ctx, "Test Campaign"));
  const [lead] = await withTenantTx({ tenantId }, (ctx) =>
    outreachLeadRepo.bulkInsert(ctx, campaign.id, [{ name: "Lead 1", email: "lead1@test.local" }]),
  );
  const [send] = await withTenantTx({ tenantId }, (ctx) =>
    outreachSendRepo.bulkSchedule(ctx, [
      {
        campaignId: campaign.id,
        leadId: lead.id,
        senderAccountId: senderId,
        stepIndex: 0,
        scheduledAt: new Date(),
      },
    ]),
  );
  await adminDb()
    .update(outreachSends)
    .set({ status: "sent", sentAt: new Date(), rfc822MessageId: "<abc@test>", gmailThreadId: "thread-1" })
    .where(eq(outreachSends.id, send.id));
  return { campaignId: campaign.id, sendId: send.id };
}

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await closePools();
});

describe("disconnecting a sender preserves send history instead of cascade-deleting it", () => {
  it("keeps the outreach_sends row (with threading anchors) after DELETE /senders/[id]", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSmtpSender(tenant.id, "a@test.local");
    const { sendId } = await seedSentCampaignWithSender(tenant.id, sender.id);

    const res = await call(deleteSenderDELETE, {
      token,
      method: "DELETE",
      routeCtx: { params: Promise.resolve({ id: sender.id }) },
    });
    expect(res.status).toBe(200);

    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachSendRepo.getById(ctx, sendId));
    expect(send).not.toBeNull();
    expect(send?.senderAccountId).toBe(sender.id);
    expect(send?.rfc822MessageId).toBe("<abc@test>");
    expect(send?.gmailThreadId).toBe("thread-1");
    expect(send?.status).toBe("sent");
  });

  it("removes the sender from the visible list and scrubs its credentials", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSmtpSender(tenant.id, "a@test.local");

    await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachService.removeSender(ctx, sender.id));

    const listed = await call(listSendersGET, { token });
    expect(listed.json.data.senders.find((s: { id: string }) => s.id === sender.id)).toBeUndefined();

    const raw = await withTenantTx({ tenantId: tenant.id }, (ctx) => senderAccountRepo.getById(ctx, sender.id));
    expect(raw?.deletedAt).not.toBeNull();
    expect(raw?.isActive).toBe(false);
    expect(raw?.smtpPasswordEnc).toBeNull();
  });

  it("refuses to reactivate a disconnected sender via PATCH", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSmtpSender(tenant.id, "a@test.local");
    await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachService.removeSender(ctx, sender.id));

    const res = await call(patchSenderPATCH, {
      token,
      method: "PATCH",
      body: { isActive: true },
      routeCtx: { params: Promise.resolve({ id: sender.id }) },
    });
    expect(res.status).toBe(404);
  });
});

describe("reconnecting a sender with the same email revives the disconnected row", () => {
  it("SMTP: re-creating with the same email reuses the old id instead of erroring", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSmtpSender(tenant.id, "a@test.local");
    const { sendId } = await seedSentCampaignWithSender(tenant.id, sender.id);
    await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachService.removeSender(ctx, sender.id));

    const res = await call(createSmtpSenderPOST, {
      token,
      body: {
        label: "Reconnected",
        email: "a@test.local",
        smtpHost: "smtp.test.local",
        smtpPort: 587,
        smtpSecure: false,
        smtpUsername: "a@test.local",
        smtpPassword: "new-password",
      },
    });
    expect(res.status).toBe(201);
    expect(res.json.data.id).toBe(sender.id);
    expect(res.json.data.isActive).toBe(true);

    const revived = await withTenantTx({ tenantId: tenant.id }, (ctx) => senderAccountRepo.getById(ctx, sender.id));
    expect(revived?.deletedAt).toBeNull();

    // The pre-disconnect send history is still attached to this same sender id.
    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) => outreachSendRepo.getById(ctx, sendId));
    expect(send?.senderAccountId).toBe(sender.id);
  });

  it("still rejects a duplicate email while the existing sender is active (unchanged behavior)", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await adminDb().update(tenants).set({ plan: "scale" }).where(eq(tenants.id, tenant.id));
    await seedSmtpSender(tenant.id, "a@test.local");

    const res = await call(createSmtpSenderPOST, {
      token,
      body: {
        label: "Duplicate",
        email: "a@test.local",
        smtpHost: "smtp.test.local",
        smtpPort: 587,
        smtpSecure: false,
        smtpUsername: "a@test.local",
        smtpPassword: "pw",
      },
    });
    expect(res.status).toBe(409);
  });
});
