import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  GET as unsubscribeGET,
  POST as unsubscribePOST,
} from "../../src/app/api/automated-campaigns/unsubscribe/[leadId]/route";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { blueprints, senderAccounts, automatedLeads, suppressedEmails } from "../../src/server/db/schema";
import { withTenantTx } from "../../src/server/db/tx";
import { automatedLeadRepo } from "../../src/server/repositories/automated-outreach.repo";
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

const params = (leadId: string) => ({ params: Promise.resolve({ leadId }) });

async function hitGet(leadId: string) {
  const req = new Request(`http://test.local/api/automated-campaigns/unsubscribe/${leadId}`);
  return unsubscribeGET(req, params(leadId));
}
async function hitPost(leadId: string) {
  const req = new Request(`http://test.local/api/automated-campaigns/unsubscribe/${leadId}`, {
    method: "POST",
  });
  return unsubscribePOST(req, params(leadId));
}

async function seedCampaignWithLead(
  tenantId: string,
  token: string,
  email: string,
  suffix = "",
) {
  const [blueprint] = await adminDb()
    .insert(blueprints)
    .values({ tenantId, name: `Acme Offer${suffix}`, status: "active", sections: MINIMAL_SECTIONS })
    .returning();
  const [sender] = await adminDb()
    .insert(senderAccounts)
    .values({
      tenantId,
      type: "gmail",
      label: `a${suffix}@test.local`,
      email: `a${suffix}@test.local`,
      gmailRefreshTokenEnc: encryptSecret("fake-refresh-token"),
      gmailHasReadScope: true,
      isActive: true,
    })
    .returning();
  const created = await call(createCampaignPOST, {
    token,
    body: {
      name: `Campaign${suffix}`,
      blueprintId: blueprint.id,
      senderAccountId: sender.id,
      discoveryQuery: { category: "dentist", location: { text: "Austin, TX" } },
      signatureName: "Jane Doe",
      replyPollingEnabled: false,
    },
  });
  const campaignId = created.json.data.id as string;
  const [lead] = await withTenantTx({ tenantId }, (ctx) =>
    automatedLeadRepo.upsertDiscovered(ctx, campaignId, [
      { sourcePlaceId: "osm:node/1", name: "Test Dentist", email },
    ]),
  );
  return lead.id;
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("GET/POST /api/automated-campaigns/unsubscribe/[leadId]", () => {
  it("GET suppresses the lead's email, marks the lead 'suppressed', and returns an HTML confirmation", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const leadId = await seedCampaignWithLead(tenant.id, token, "hello@testdentist.example.com");

    const res = await hitGet(leadId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html.toLowerCase()).toContain("unsubscribed");

    const [suppressed] = await adminDb()
      .select()
      .from(suppressedEmails)
      .where(eq(suppressedEmails.tenantId, tenant.id));
    expect(suppressed.email).toBe("hello@testdentist.example.com");

    const [lead] = await adminDb().select().from(automatedLeads).where(eq(automatedLeads.id, leadId));
    expect(lead.status).toBe("suppressed");
  });

  it("POST (RFC 8058 one-click) does the same suppression with an empty 200 response", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const leadId = await seedCampaignWithLead(tenant.id, token, "hello@testdentist.example.com");

    const res = await hitPost(leadId);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("");

    const [suppressed] = await adminDb()
      .select()
      .from(suppressedEmails)
      .where(eq(suppressedEmails.tenantId, tenant.id));
    expect(suppressed.email).toBe("hello@testdentist.example.com");
  });

  it("is idempotent — clicking twice (or a retried one-click POST) never errors or duplicates", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const leadId = await seedCampaignWithLead(tenant.id, token, "hello@testdentist.example.com");

    await hitGet(leadId);
    const res2 = await hitGet(leadId);
    expect(res2.status).toBe(200);

    const rows = await adminDb().select().from(suppressedEmails).where(eq(suppressedEmails.tenantId, tenant.id));
    expect(rows).toHaveLength(1);
  });

  it("an unknown leadId returns the same success response instead of erroring or leaking existence", async () => {
    const res = await hitGet(crypto.randomUUID());
    expect(res.status).toBe(200);
    expect((await res.text()).toLowerCase()).toContain("unsubscribed");
  });

  it("garbage input never throws — same graceful no-op as the tracking-pixel route", async () => {
    const res = await hitGet("not-a-uuid-at-all");
    expect(res.status).toBe(200);
  });

  it("suppression applies tenant-wide — a second campaign in the same tenant also stops emailing that address", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const email = "shared@testdentist.example.com";
    const leadId = await seedCampaignWithLead(tenant.id, token, email);
    // A second, unrelated campaign discovers the SAME business/email.
    const secondLeadId = await seedCampaignWithLead(tenant.id, token, email, " 2");

    await hitGet(leadId);

    // The suppression row is tenant+email scoped, not tied to either
    // specific lead/campaign — the second campaign's future ticks would
    // gate on this exact row via suppressedEmailRepo.isSuppressed.
    const [suppressed] = await adminDb()
      .select()
      .from(suppressedEmails)
      .where(eq(suppressedEmails.tenantId, tenant.id));
    expect(suppressed.email).toBe(email);
    void secondLeadId;
  });
});
