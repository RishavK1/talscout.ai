import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq, asc } from "drizzle-orm";
import { POST as firePOST } from "../../src/app/api/outreach/campaigns/[id]/fire/route";
import { POST as createCampaignPOST } from "../../src/app/api/outreach/campaigns/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import {
  outreachCampaigns,
  outreachSends,
  tenants,
} from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import { outreachService } from "../../src/server/services/outreach.service";
import {
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "../../src/server/repositories/outreach.repo";
import { sendOutreachEmail } from "../../src/server/jobs/send-outreach-email";
import { fireScheduledCampaign } from "../../src/server/jobs/fire-scheduled-campaign";
import { getServices } from "../../src/server/container";
import { encryptSecret } from "../../src/server/lib/secret-box";
import type { MockOutreachMailer } from "../../src/server/adapters/mock.outreach-mailer";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const DAY_MS = 24 * 60 * 60 * 1000;

const SEQUENCE = [
  { stepIndex: 0, dayOffset: 0, subjectTemplate: "Quick intro", bodyTemplate: "Hi there" },
  { stepIndex: 1, dayOffset: 3, subjectTemplate: "Following up", bodyTemplate: "Bumping this" },
  { stepIndex: 2, dayOffset: 7, subjectTemplate: "Last check-in", bodyTemplate: "One more try" },
];

async function createReadyCampaign(tenantId: string, token: string) {
  await adminDb().update(tenants).set({ plan: "scale" }).where(eq(tenants.id, tenantId));
  const created = await call(createCampaignPOST, {
    token,
    body: { name: "Follow-up Campaign" },
  });
  const campaignId = created.json.data.id as string;
  await adminDb()
    .update(outreachCampaigns)
    .set({ status: "ready", sequence: SEQUENCE })
    .where(eq(outreachCampaigns.id, campaignId));
  return campaignId;
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
      smtpPasswordEnc: encryptSecret("test-password"),
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

async function sendsForCampaign(campaignId: string) {
  return await adminDb()
    .select()
    .from(outreachSends)
    .where(eq(outreachSends.campaignId, campaignId))
    .orderBy(asc(outreachSends.stepIndex), asc(outreachSends.scheduledAt));
}

function mockMailer(): MockOutreachMailer {
  return getServices().outreachMailer as MockOutreachMailer;
}

beforeEach(async () => {
  await resetDb();
  mockMailer().threadReplyState = "no_reply";
});
afterAll(async () => {
  await closePools();
});

describe("Day 3/Day 7 follow-up cascade", () => {
  it("cascade fire creates Day 3 and Day 7 rows at exactly +3/+7 days, same sender as Day 0", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 2);

    const res = await call(firePOST, {
      token,
      body: { stepIndex: 0, cascadeFollowups: true },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);
    expect(res.json.data.scheduled).toBe(2);
    expect(res.json.data.followupsScheduled).toBe(4); // 2 leads × (day3 + day7)

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(6);

    for (const lead of new Set(sends.map((s) => s.leadId))) {
      const day0 = sends.find((s) => s.leadId === lead && s.stepIndex === 0)!;
      const day3 = sends.find((s) => s.leadId === lead && s.stepIndex === 1)!;
      const day7 = sends.find((s) => s.leadId === lead && s.stepIndex === 2)!;
      // Exact +3/+7 days, same clock time as the lead's own Day 0 slot.
      expect(day3.scheduledAt.getTime() - day0.scheduledAt.getTime()).toBe(3 * DAY_MS);
      expect(day7.scheduledAt.getTime() - day0.scheduledAt.getTime()).toBe(7 * DAY_MS);
      // Same mailbox — a Gmail thread only continues from the account that
      // started it.
      expect(day3.senderAccountId).toBe(day0.senderAccountId);
      expect(day7.senderAccountId).toBe(day0.senderAccountId);
      expect(day3.status).toBe("scheduled");
      expect(day7.status).toBe("scheduled");
    }
  });

  it("does NOT cascade without the opt-in flag", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 2);

    const res = await call(firePOST, {
      token,
      body: { stepIndex: 0 },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(2);
    expect(sends.every((s) => s.stepIndex === 0)).toBe(true);
  });

  it("a scheduled fire persists the cascade flag and honors it at wake-up", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const campaignId = await createReadyCampaign(tenant.id, token);
    await seedSender(tenant.id, "a@test.local");
    await seedLeadsWithEmail(tenant.id, campaignId, 1);

    const scheduledFireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    // Direct service call, afterCommit deliberately not run — reproduces the
    // "still waiting" state (see outreach-schedule-fire.test.ts's helper).
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachService.scheduleFire(
        ctx,
        campaignId,
        0,
        new Date(scheduledFireAt),
        undefined,
        { cascadeFollowups: true },
      ),
    );

    const [row] = await adminDb()
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, campaignId));
    expect(row.scheduledFireCascade).toBe(true);

    await fireScheduledCampaign(
      { tenantId: tenant.id, campaignId, scheduledFireAt },
      getServices(),
    );

    const sends = await sendsForCampaign(campaignId);
    expect(sends.map((s) => s.stepIndex).sort()).toEqual([0, 1, 2]);
  });
});

describe("follow-up threading (same conversation as Day 0)", () => {
  async function fireWithCascade(
    tenantId: string,
    token: string,
    senderEmail = "a@test.local",
  ) {
    const campaignId = await createReadyCampaign(tenantId, token);
    await seedSender(tenantId, senderEmail);
    await seedLeadsWithEmail(tenantId, campaignId, 1);
    const res = await call(firePOST, {
      token,
      body: { stepIndex: 0, cascadeFollowups: true },
      routeCtx: params(campaignId),
    });
    expect(res.status).toBe(200);
    const sends = await sendsForCampaign(campaignId);
    return {
      campaignId,
      day0: sends.find((s) => s.stepIndex === 0)!,
      day3: sends.find((s) => s.stepIndex === 1)!,
    };
  }

  it("Day 0 stores its threading anchors; Day 3 sends as an in-thread reply", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { day0, day3 } = await fireWithCascade(tenant.id, token);

    await sendOutreachEmail({ tenantId: tenant.id, sendId: day0.id }, getServices());

    const day0After = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, day0.id),
    );
    expect(day0After?.status).toBe("sent");
    expect(day0After?.rfc822MessageId).toMatch(/^<.+@test\.local>$/);
    expect(day0After?.gmailThreadId).toBeTruthy();
    expect(day0After?.sentSubject).toBe("Quick intro");

    await sendOutreachEmail({ tenantId: tenant.id, sendId: day3.id }, getServices());

    const day3Mail = mockMailer().sent.at(-1)!.message;
    // The reply rides the Day 0 anchors — same thread, never a new mail.
    expect(day3Mail.inReplyTo).toBe(day0After!.rfc822MessageId);
    expect(day3Mail.gmailThreadId).toBe(day0After!.gmailThreadId);
    expect(day3Mail.subject).toBe("Re: Quick intro");

    const day3After = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, day3.id),
    );
    expect(day3After?.status).toBe("sent");
    // Follow-up inherits the Day 0 thread id, not a new one.
    expect(day3After?.gmailThreadId).toBe(day0After!.gmailThreadId);
  });

  it("skips the follow-up when Day 0 failed (no thread to reply into)", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { day0, day3 } = await fireWithCascade(tenant.id, token);

    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.markFailed(ctx, day0.id, "bounced"),
    );

    await sendOutreachEmail({ tenantId: tenant.id, sendId: day3.id }, getServices());

    const day3After = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, day3.id),
    );
    expect(day3After?.status).toBe("skipped");
    expect(day3After?.errorReason).toBe("day0_not_sent");
  });

  it("reply-stop: skips the follow-up when the lead already replied; fails open on unknown", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const { day0, day3 } = await fireWithCascade(tenant.id, token);
    await sendOutreachEmail({ tenantId: tenant.id, sendId: day0.id }, getServices());

    mockMailer().threadReplyState = "replied";
    await sendOutreachEmail({ tenantId: tenant.id, sendId: day3.id }, getServices());
    const day3After = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, day3.id),
    );
    expect(day3After?.status).toBe("skipped");
    expect(day3After?.errorReason).toBe("lead_replied");

    // "unknown" (send-only token / SMTP / API hiccup) must fail OPEN — a
    // second campaign proves the send still goes out.
    mockMailer().threadReplyState = "unknown";
    const second = await fireWithCascade(tenant.id, token, "b@test.local");
    await sendOutreachEmail({ tenantId: tenant.id, sendId: second.day0.id }, getServices());
    await sendOutreachEmail({ tenantId: tenant.id, sendId: second.day3.id }, getServices());
    const secondDay3 = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      outreachSendRepo.getById(ctx, second.day3.id),
    );
    expect(secondDay3?.status).toBe("sent");
  });
});
