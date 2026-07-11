import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/outreach/campaigns/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { outreachCampaigns, outreachSends, tenants } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import { outreachService } from "../../src/server/services/outreach.service";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "../../src/server/repositories/outreach.repo";
import { getServices } from "../../src/server/container";
import { MAX_UPLOAD_BYTES } from "../../src/server/ingestion/file-type";
import { sendOutreachEmail } from "../../src/server/jobs/send-outreach-email";
import { encryptSecret } from "../../src/server/lib/secret-box";

/**
 * Fix #4/#5/#6 (from the "audit the bulk-fire feature" pass): `afterCommit`
 * runs strictly after the DB transaction commits, so a failed enqueue there
 * can never be undone by rollback — the writes are already durable and the
 * client sees a generic error. These tests force `queue.enqueue`/`enqueueBatch`
 * to throw and assert the service performs its compensating write in a fresh
 * transaction rather than silently stranding state.
 *
 * Fix #7: `completeLeadsUpload`'s 10MB limit is re-checked against what
 * Supabase actually stored, not just the client-declared `sizeBytes` from
 * `requestLeadsUpload` — these tests force `storage.getObjectSize` to report
 * an oversized object and assert it's rejected and deleted post-hoc.
 */

async function createReadyCampaign(tenantId: string, token: string) {
  await adminDb().update(tenants).set({ plan: "scale" }).where(eq(tenants.id, tenantId));
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
  return await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.createSmtp(ctx, {
      label: email,
      email,
      dailyLimit,
      smtpHost: "smtp.test.local",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: email,
      smtpPasswordEnc: encryptSecret("test-password"),
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
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await closePools();
});

describe("fireCampaign afterCommit recovery — enqueueBatch failure undoes committed writes", () => {
  it("deletes the send rows and restores prior lead/campaign statuses when the queue throws", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    await seedSender(tenant.id, "a@test.local");
    const leads = await seedLeadsWithEmail(tenant.id, campaignId, 5);

    const queue = getServices().queue;
    const spy = vi
      .spyOn(queue, "enqueueBatch")
      .mockRejectedValueOnce(new Error("simulated enqueue failure"));

    const { afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );

    await expect(afterCommit?.()).rejects.toThrow(/simulated enqueue failure/);
    expect(spy).toHaveBeenCalledTimes(1);

    // The sends committed by fireCampaign's transaction must be undone —
    // otherwise listEligibleForStep would exclude these leads forever since
    // it excludes on row existence, not status.
    const sends = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.campaignId, campaignId));
    expect(sends.length).toBe(0);

    const restoredLeads = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachLeadRepo.listByCampaign(ctx, campaignId),
    );
    for (const l of restoredLeads.rows) {
      expect(l.status).toBe("pending");
    }
    expect(leads.length).toBe(5);

    const campaign = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.getById(ctx, campaignId),
    );
    expect(campaign?.status).toBe("ready");

    // The leads must be retryable — a subsequent real fire should succeed
    // and pick every one of them back up.
    const retry = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await retry.afterCommit?.();
    expect(retry.result.scheduled).toBe(5);
  });

  it("leaves campaign status=running untouched when it was already running before this fire", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 3);

    // First fire succeeds normally, flipping the campaign to "running".
    const first = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await first.afterCommit?.();

    await seedLeadsWithEmail(tenant.id, campaignId, 3);
    const spy = vi
      .spyOn(getServices().queue, "enqueueBatch")
      .mockRejectedValueOnce(new Error("simulated enqueue failure"));

    const second = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 1),
    );
    await expect(second.afterCommit?.()).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);

    const campaign = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.getById(ctx, campaignId),
    );
    // Was already "running" before this (failed) fire — must not be
    // clobbered back to some earlier status.
    expect(campaign?.status).toBe("running");
  });
});

describe("scheduleFire afterCommit recovery — enqueue failure clears the dangling schedule", () => {
  it("clears scheduledFireAt when the wake-up job fails to enqueue", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    await seedSender(tenant.id, "a@test.local");

    const spy = vi
      .spyOn(getServices().queue, "enqueue")
      .mockRejectedValueOnce(new Error("simulated enqueue failure"));

    const scheduledFireAt = new Date(Date.now() + 60 * 60 * 1000);
    const { afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.scheduleFire(ctx, campaignId, 0, scheduledFireAt),
    );

    await expect(afterCommit?.()).rejects.toThrow(/simulated enqueue failure/);
    expect(spy).toHaveBeenCalledTimes(1);

    const campaign = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.getById(ctx, campaignId),
    );
    // Without the fix, scheduledFireAt would stay set with no job ever
    // enqueued to wake up and fire it — a silent stall the UI can't detect.
    expect(campaign?.scheduledFireAt).toBeNull();
  });
});

describe("completeLeadsUpload afterCommit recovery — enqueue failure flips campaign to error", () => {
  async function seedUploadedFile(tenantId: string, campaignId: string, bytes: number) {
    const fileKey = `tenants/${tenantId}/outreach/${campaignId}/${crypto.randomUUID()}.docx`;
    await getServices().storage.putObject(fileKey, Buffer.alloc(bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    return fileKey;
  }

  it("flips the campaign to status=error(enqueue_failed) instead of stranding it in importing", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    const fileKey = await seedUploadedFile(tenant.id, campaignId, 1024);

    const spy = vi
      .spyOn(getServices().queue, "enqueue")
      .mockRejectedValueOnce(new Error("simulated enqueue failure"));

    const { afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.completeLeadsUpload(ctx, campaignId, { fileKey }),
    );

    await expect(afterCommit?.()).rejects.toThrow(/simulated enqueue failure/);
    expect(spy).toHaveBeenCalledTimes(1);

    const campaign = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.getById(ctx, campaignId),
    );
    // Without the fix, this stays "importing" forever with no parse job ever
    // coming to move it along, and no re-upload path since the UI wasn't
    // built to expect "importing" to be a dead end.
    expect(campaign?.status).toBe("error");
    expect(campaign?.errorReason).toBe("enqueue_failed");
  });
});

describe("completeLeadsUpload — server-side upload size enforcement", () => {
  async function seedUploadedFile(tenantId: string, campaignId: string, bytes: number) {
    const fileKey = `tenants/${tenantId}/outreach/${campaignId}/${crypto.randomUUID()}.docx`;
    await getServices().storage.putObject(fileKey, Buffer.alloc(bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    return fileKey;
  }

  it("rejects and deletes an object that's actually over the limit, regardless of declared sizeBytes", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    const fileKey = await seedUploadedFile(tenant.id, campaignId, 1024);

    // The client can lie about sizeBytes at request time — simulate that by
    // having the actual stored object report as oversized regardless of what
    // was actually written.
    vi.spyOn(getServices().storage, "getObjectSize").mockResolvedValueOnce(
      MAX_UPLOAD_BYTES + 1,
    );
    const deleteSpy = vi.spyOn(getServices().storage, "deleteObject");

    await expect(
      withTenantTx({ tenantId: tenant.id }, (ctx) =>
        outreachService.completeLeadsUpload(ctx, campaignId, { fileKey }),
      ),
    ).rejects.toThrow(/10MB/i);

    expect(deleteSpy).toHaveBeenCalledWith(fileKey);

    const campaign = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.getById(ctx, campaignId),
    );
    // Must not have been flipped to "importing" — the whole call is rejected
    // before that write happens.
    expect(campaign?.status).not.toBe("importing");
  });

  it("accepts a file at/under the real limit", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    const fileKey = await seedUploadedFile(tenant.id, campaignId, 2048);

    const { result } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.completeLeadsUpload(ctx, campaignId, { fileKey }),
    );
    expect(result.status).toBe("importing");
  });
});

describe("sendOutreachEmail — transient send failures retry, permanent ones don't", () => {
  async function seedScheduledSend(tenantId: string, token: string) {
    const campaignId = await createReadyCampaign(tenantId, token);
    await withTenantTx({ tenantId }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        {
          stepIndex: 0,
          dayOffset: 0,
          subjectTemplate: "Hello {{name}}",
          bodyTemplate: "Body for {{name}}",
        },
      ]),
    );
    const sender = await seedSender(tenantId, "a@test.local");
    const [lead] = await seedLeadsWithEmail(tenantId, campaignId, 1);
    const [send] = await withTenantTx({ tenantId }, (ctx) =>
      outreachSendRepo.bulkSchedule(ctx, [
        {
          campaignId,
          leadId: lead.id,
          senderAccountId: sender.id,
          stepIndex: 0,
          scheduledAt: new Date(),
        },
      ]),
    );
    // fireCampaign would normally flip these — do it directly since this
    // suite drives sendOutreachEmail without going through fireCampaign.
    await adminDb().update(outreachCampaigns).set({ status: "running" }).where(eq(outreachCampaigns.id, campaignId));
    return { campaignId, sendId: send.id };
  }

  it("retries a transient (ECONNRESET-style) failure and still marks the send sent", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { sendId } = await seedScheduledSend(tenant.id, token);

    const err = new Error("socket hang up") as Error & { code: string };
    err.code = "ECONNRESET";
    const spy = vi
      .spyOn(getServices().outreachMailer, "send")
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined);

    await sendOutreachEmail({ tenantId: tenant.id, sendId }, getServices());

    expect(spy).toHaveBeenCalledTimes(2);
    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, sendId),
    );
    expect(send?.status).toBe("sent");
  });

  it("does not retry a permanent failure (e.g. bad credentials) and marks the send failed on the first attempt", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { sendId } = await seedScheduledSend(tenant.id, token);

    const spy = vi
      .spyOn(getServices().outreachMailer, "send")
      .mockRejectedValue(new Error("invalid recipient"));

    await sendOutreachEmail({ tenantId: tenant.id, sendId }, getServices());

    expect(spy).toHaveBeenCalledTimes(1);
    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, sendId),
    );
    expect(send?.status).toBe("failed");
    expect(send?.errorReason).toBe("invalid recipient");
  });

  it("gives up after repeated transient failures and marks the send failed", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { sendId } = await seedScheduledSend(tenant.id, token);

    const err = new Error("timeout") as Error & { code: string };
    err.code = "ETIMEDOUT";
    const spy = vi.spyOn(getServices().outreachMailer, "send").mockRejectedValue(err);

    await sendOutreachEmail({ tenantId: tenant.id, sendId }, getServices());

    // Bounded at 3 attempts total — a stubborn transient failure must not
    // retry forever.
    expect(spy).toHaveBeenCalledTimes(3);
    const send = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, sendId),
    );
    expect(send?.status).toBe("failed");
  });
});

describe("outreachLeadRepo.bulkInsert — chunked insert stays correct across the chunk boundary", () => {
  it("inserts and returns every row when the batch spans multiple chunks", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);

    // CHUNK_SIZE is 1000 — 1500 leads forces exactly two chunks (1000 + 500)
    // and exercises the boundary rather than just testing a single batch.
    const count = 1500;
    const inserted = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachLeadRepo.bulkInsert(
        ctx,
        campaignId,
        Array.from({ length: count }, (_, i) => ({
          name: `Lead ${i}`,
          email: `chunklead${i}@test.local`,
        })),
      ),
    );
    expect(inserted.length).toBe(count);
    expect(new Set(inserted.map((l) => l.id)).size).toBe(count);

    const total = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachLeadRepo.countByCampaign(ctx, campaignId),
    );
    expect(total).toBe(count);
  });
});
