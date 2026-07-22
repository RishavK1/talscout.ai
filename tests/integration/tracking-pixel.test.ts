import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as trackOpenGET } from "../../src/app/api/track/open/[kind]/[id]/route";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { outreachSends, automatedSends, blueprints, senderAccounts } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "../../src/server/repositories/outreach.repo";
import { automatedLeadRepo, automatedSendRepo } from "../../src/server/repositories/automated-outreach.repo";
import { encryptSecret } from "../../src/server/lib/secret-box";
import type { BlueprintSections } from "../../src/server/ports";

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

const params = (kind: string, id: string) => ({ params: Promise.resolve({ kind, id }) });

async function hit(kind: string, id: string) {
  const req = new Request(`http://test.local/api/track/open/${kind}/${id}`);
  return trackOpenGET(req, params(kind, id));
}

async function seedBulkFireSend(tenantId: string) {
  const sender = await withTenantTx({ tenantId }, (ctx) =>
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
  const campaign = await withTenantTx({ tenantId }, (ctx) => outreachCampaignRepo.create(ctx, "Campaign A"));
  const [lead] = await withTenantTx({ tenantId }, (ctx) =>
    outreachLeadRepo.bulkInsert(ctx, campaign.id, [{ name: "Lead 1", email: "l1@test.local" }]),
  );
  const [send] = await withTenantTx({ tenantId }, (ctx) =>
    outreachSendRepo.bulkSchedule(ctx, [
      { campaignId: campaign.id, leadId: lead.id, senderAccountId: sender.id, stepIndex: 0, scheduledAt: new Date() },
    ]),
  );
  await adminDb().update(outreachSends).set({ status: "sent", sentAt: new Date() }).where(eq(outreachSends.id, send.id));
  return send.id;
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("GET /api/track/open/[kind]/[id]", () => {
  it("marks a Bulk Fire send as opened and returns a valid GIF", async () => {
    const { tenant } = await makeUser("recruiter");
    const sendId = await seedBulkFireSend(tenant.id);

    const res = await hit("bf", sendId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 3).toString("ascii")).toBe("GIF");

    const [row] = await adminDb().select().from(outreachSends).where(eq(outreachSends.id, sendId));
    expect(row.openedAt).not.toBeNull();
  });

  it("first open wins — a second fetch never overwrites the original timestamp", async () => {
    const { tenant } = await makeUser("recruiter");
    const sendId = await seedBulkFireSend(tenant.id);

    await hit("bf", sendId);
    const [first] = await adminDb().select().from(outreachSends).where(eq(outreachSends.id, sendId));

    await new Promise((r) => setTimeout(r, 10));
    await hit("bf", sendId);
    const [second] = await adminDb().select().from(outreachSends).where(eq(outreachSends.id, sendId));

    expect(second.openedAt?.getTime()).toBe(first.openedAt?.getTime());
  });

  it("marks an automated-outreach send as opened via the 'ao' kind", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const [blueprint] = await adminDb()
      .insert(blueprints)
      .values({ tenantId: tenant.id, name: "Acme Offer", status: "active", sections: MINIMAL_SECTIONS })
      .returning();
    const [sender] = await adminDb()
      .insert(senderAccounts)
      .values({
        tenantId: tenant.id,
        type: "gmail",
        label: "a@test.local",
        email: "a@test.local",
        gmailRefreshTokenEnc: encryptSecret("fake-refresh-token"),
        gmailHasReadScope: true,
        isActive: true,
      })
      .returning();
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

    const sendId = await withTenantTx({ tenantId: tenant.id }, async (ctx) => {
      const [lead] = await automatedLeadRepo.upsertDiscovered(ctx, campaignId, [
        { sourcePlaceId: "osm:node/1", name: "Test Dentist", email: "hello@testdentist.example.com" },
      ]);
      const [send] = await automatedSendRepo.bulkInsert(ctx, [
        {
          campaignId,
          leadId: lead.id,
          senderAccountId: sender.id,
          stepIndex: 0,
          subject: "Quick question",
          body: "Hi there",
          scheduledAt: new Date(),
        },
      ]);
      return send.id;
    });
    await adminDb().update(automatedSends).set({ status: "sent", sentAt: new Date() }).where(eq(automatedSends.id, sendId));

    const res = await hit("ao", sendId);
    expect(res.status).toBe(200);
    const [updated] = await adminDb().select().from(automatedSends).where(eq(automatedSends.id, sendId));
    expect(updated.openedAt).not.toBeNull();
  });

  it("still returns a valid GIF for an unknown id instead of erroring", async () => {
    const res = await hit("bf", crypto.randomUUID());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
  });

  it("still returns a valid GIF for an unrecognized kind instead of erroring", async () => {
    const res = await hit("nope", crypto.randomUUID());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
  });
});
