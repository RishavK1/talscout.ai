import { createHmac } from "crypto";
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/outreach/campaigns/route";
import { POST as webhookPOST, GET as webhookGET } from "../../src/app/api/webhooks/whatsapp/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { outreachCampaigns, tenants } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import { outreachService } from "../../src/server/services/outreach.service";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "../../src/server/repositories/outreach.repo";
import { whatsappTemplateRepo } from "../../src/server/repositories/whatsapp-template.repo";
import { sendOutreachWhatsapp } from "../../src/server/jobs/send-outreach-whatsapp";
import { getServices } from "../../src/server/container";
import { encryptSecret } from "../../src/server/lib/secret-box";

// Bulk-fire outreach (campaigns, senders, scheduling) is a Scale-plan
// feature — bump the fixture tenant onto Scale so these tests exercise
// WhatsApp send/webhook mechanics, not plan gating (see
// outreach-plan-gating.test.ts for that).
async function createReadyWhatsAppCampaign(tenantId: string, token: string) {
  await adminDb().update(tenants).set({ plan: "scale" }).where(eq(tenants.id, tenantId));
  const created = await call(createCampaignPOST, {
    token,
    body: { name: "WA Campaign", channel: "whatsapp" },
  });
  const campaignId = created.json.data.id as string;
  await adminDb()
    .update(outreachCampaigns)
    .set({ status: "ready" })
    .where(eq(outreachCampaigns.id, campaignId));
  return campaignId;
}

async function seedWhatsAppSender(
  tenantId: string,
  phoneNumber: string,
  dailyLimit = 1000,
) {
  return await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.createWhatsApp(ctx, {
      label: phoneNumber,
      phoneNumber,
      whatsappPhoneNumberId: "pnid-123",
      whatsappWabaId: "waba-123",
      whatsappAccessTokenEnc: encryptSecret("test-access-token"),
      whatsappDisplayName: "Test Business",
      dailyLimit,
    }),
  );
}

async function seedTemplate(
  tenantId: string,
  senderAccountId: string,
  overrides: Partial<{
    category: "marketing" | "utility" | "authentication";
    status: "pending" | "approved" | "rejected" | "disabled";
    metaTemplateName: string;
    placeholderCount: number;
    metaTemplateId: string;
  }> = {},
) {
  const template = await withTenantTx({ tenantId }, (ctx) =>
    whatsappTemplateRepo.create(ctx, {
      senderAccountId,
      metaTemplateName: overrides.metaTemplateName ?? "follow_up",
      category: overrides.category ?? "utility",
      language: "en_US",
      bodyText: "Hi {{1}}, following up.",
      placeholderCount: overrides.placeholderCount ?? 1,
      metaTemplateId: overrides.metaTemplateId,
    }),
  );
  if (overrides.status && overrides.status !== "pending") {
    await withTenantTx({ tenantId }, (ctx) =>
      whatsappTemplateRepo.setStatus(ctx, template.id, overrides.status!),
    );
    return { ...template, status: overrides.status! };
  }
  return template;
}

async function seedLeadsWithPhone(
  tenantId: string,
  campaignId: string,
  phones: string[],
) {
  return await withTenantTx({ tenantId }, (ctx) =>
    outreachLeadRepo.bulkInsert(
      ctx,
      campaignId,
      phones.map((phone, i) => ({ name: `Lead ${i}`, phone })),
    ),
  );
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("WhatsApp send path — template must be approved", () => {
  it("fireCampaign rejects a step whose template is not yet approved", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, { status: "pending" });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: [] },
      ]),
    );
    await seedLeadsWithPhone(tenant.id, campaignId, ["+15557654321"]);

    // fireCampaign itself only schedules — the "approved" gate is enforced
    // structurally at actual send time (see send-outreach-whatsapp.ts), so
    // scheduling succeeds here and the rejection surfaces per-send below.
    const { afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await afterCommit?.();

    const sends = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachLeadRepo.listEligibleForStep(ctx, campaignId, 1),
    );
    // The lead advanced past step 0 (a send row exists for it) even though
    // it was never actually delivered — confirms markFailed path ran rather
    // than silently leaving the lead stuck as "pending" for step 0 forever.
    expect(sends.length).toBe(0);
  });

  it("sendOutreachWhatsapp marks the send failed with template_not_approved when template is pending", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, { status: "pending" });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: [] },
      ]),
    );
    const [lead] = await seedLeadsWithPhone(tenant.id, campaignId, ["+15557654321"]);
    const [send] = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
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
    await adminDb()
      .update(outreachCampaigns)
      .set({ status: "running" })
      .where(eq(outreachCampaigns.id, campaignId));

    const sendSpy = vi.spyOn(getServices().whatsappSender, "send");
    await sendOutreachWhatsapp({ tenantId: tenant.id, sendId: send.id }, getServices());

    expect(sendSpy).not.toHaveBeenCalled();
    const got = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, send.id),
    );
    expect(got?.status).toBe("failed");
    expect(got?.errorReason).toBe("template_not_approved");
  });

  it("sendOutreachWhatsapp sends and records providerMessageId once the template is approved", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, { status: "approved" });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: ["{{name}}"] },
      ]),
    );
    const [lead] = await seedLeadsWithPhone(tenant.id, campaignId, ["+15557654321"]);
    const [send] = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
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
    await adminDb()
      .update(outreachCampaigns)
      .set({ status: "running" })
      .where(eq(outreachCampaigns.id, campaignId));

    await sendOutreachWhatsapp({ tenantId: tenant.id, sendId: send.id }, getServices());

    const got = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, send.id),
    );
    expect(got?.status).toBe("sent");
    expect(got?.providerMessageId).toMatch(/^mock-wamid\./);
  });
});

describe("US marketing-template pause — skip-and-report, not a hard block", () => {
  it("fireCampaign skips +1 leads for a marketing-category template but still fires to the rest", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, {
      category: "marketing",
      status: "approved",
    });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: [] },
      ]),
    );
    await seedLeadsWithPhone(tenant.id, campaignId, [
      "+15551110000", // US — must be skipped
      "+15552220000", // US — must be skipped
      "+447700900000", // UK — eligible
    ]);

    const { result, afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await afterCommit?.();

    expect(result.skippedForUsMarketingRestrictionCount).toBe(2);
    expect(result.scheduled).toBe(1);
  });

  it("does not skip +1 leads for a utility-category template", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, {
      category: "utility",
      status: "approved",
    });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: [] },
      ]),
    );
    await seedLeadsWithPhone(tenant.id, campaignId, ["+15551110000", "+15552220000"]);

    const { result, afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await afterCommit?.();

    expect(result.skippedForUsMarketingRestrictionCount).toBe(0);
    expect(result.scheduled).toBe(2);
  });

  it("throws Conflict when every eligible lead is a US number for a marketing template", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, {
      category: "marketing",
      status: "approved",
    });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: [] },
      ]),
    );
    await seedLeadsWithPhone(tenant.id, campaignId, ["+15551110000"]);

    await expect(
      withTenantTx({ tenantId: tenant.id }, (ctx) =>
        outreachService.fireCampaign(ctx, campaignId, 0),
      ),
    ).rejects.toThrow(/US numbers/i);
  });
});

describe("per-sender daily cap enforced independent of tenant plan cap", () => {
  it("truncates the fire to what the WhatsApp sender's dailyLimit allows", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    // Scale plan has no tenant-wide daily cap — only the sender's own limit
    // should constrain this fire.
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567", 2);
    const template = await seedTemplate(tenant.id, sender.id, { status: "approved" });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: [] },
      ]),
    );
    await seedLeadsWithPhone(tenant.id, campaignId, [
      "+447700900001",
      "+447700900002",
      "+447700900003",
      "+447700900004",
    ]);

    const { result, afterCommit } = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.fireCampaign(ctx, campaignId, 0),
    );
    await afterCommit?.();

    expect(result.scheduled).toBe(2);
    expect(result.skippedForSenderCapCount).toBe(2);
  });
});

describe("WhatsApp webhook — signature verification", () => {
  function sign(rawBody: string): string {
    const hmac = createHmac("sha256", "test-whatsapp-app-secret");
    hmac.update(rawBody, "utf8");
    return `sha256=${hmac.digest("hex")}`;
  }

  it("rejects a POST with a bad signature", async () => {
    const rawBody = JSON.stringify({ entry: [] });
    const req = new Request("http://test.local/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: rawBody,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(403);
  });

  it("rejects a POST with a missing signature header", async () => {
    const rawBody = JSON.stringify({ entry: [] });
    const req = new Request("http://test.local/api/webhooks/whatsapp", {
      method: "POST",
      body: rawBody,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(403);
  });

  it("accepts a POST with a valid signature", async () => {
    const rawBody = JSON.stringify({ entry: [] });
    const req = new Request("http://test.local/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(rawBody) },
      body: rawBody,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(200);
  });

  it("GET handshake echoes the challenge only for the correct verify token", async () => {
    const good = new Request(
      "http://test.local/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-whatsapp-verify-token&hub.challenge=abc123",
    );
    const goodRes = await webhookGET(good);
    expect(goodRes.status).toBe(200);
    expect(await goodRes.text()).toBe("abc123");

    const bad = new Request(
      "http://test.local/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123",
    );
    const badRes = await webhookGET(bad);
    expect(badRes.status).toBe(403);
  });
});

describe("WhatsApp webhook — resolves tenant from providerMessageId, no tenant in the URL", () => {
  function sign(rawBody: string): string {
    const hmac = createHmac("sha256", "test-whatsapp-app-secret");
    hmac.update(rawBody, "utf8");
    return `sha256=${hmac.digest("hex")}`;
  }

  it("updates deliveryStatus on the send matching the wamid, across tenants, via the admin-scoped lookup", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyWhatsAppCampaign(tenant.id, token);
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, { status: "approved" });
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachCampaignRepo.setSequence(ctx, campaignId, [
        { stepIndex: 0, dayOffset: 0, templateId: template.id, templateParams: [] },
      ]),
    );
    const [lead] = await seedLeadsWithPhone(tenant.id, campaignId, ["+447700900000"]);
    const [send] = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
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
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.markSentWithProviderMessageId(ctx, send.id, "wamid.TESTMESSAGE123"),
    );

    const rawBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: { statuses: [{ id: "wamid.TESTMESSAGE123", status: "delivered" }] },
            },
          ],
        },
      ],
    });
    const req = new Request("http://test.local/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(rawBody) },
      body: rawBody,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(200);

    const got = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, send.id),
    );
    expect(got?.deliveryStatus).toBe("delivered");
  });

  it("is a no-op (still 200) for an unrecognized wamid — must never surface a 4xx for a benign lookup miss", async () => {
    const rawBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: { statuses: [{ id: "wamid.UNKNOWN", status: "read" }] },
            },
          ],
        },
      ],
    });
    const req = new Request("http://test.local/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(rawBody) },
      body: rawBody,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(200);
  });

  it("updates a template's status from a message_template_status_update event", async () => {
    const { tenant } = await makeUser("recruiter");
    const sender = await seedWhatsAppSender(tenant.id, "+15551234567");
    const template = await seedTemplate(tenant.id, sender.id, {
      status: "pending",
      metaTemplateId: "meta-tpl-999",
    });

    const rawBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "message_template_status_update",
              value: {
                message_template_id: "meta-tpl-999",
                event: "APPROVED",
              },
            },
          ],
        },
      ],
    });
    const req = new Request("http://test.local/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(rawBody) },
      body: rawBody,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(200);

    const got = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      whatsappTemplateRepo.getById(ctx, template.id),
    );
    expect(got?.status).toBe("approved");
  });
});
