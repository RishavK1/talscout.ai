import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { POST as resumeCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/resume/route";
import { GET as listLeadsGET } from "../../src/app/api/automated-campaigns/[id]/leads/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { blueprints, senderAccounts, automatedLeads, automatedSends } from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";
import { withTenantTx } from "../../src/server/db/tx";
import {
  automatedLeadRepo,
  automatedSendRepo,
} from "../../src/server/repositories/automated-outreach.repo";
import { runAutomatedCampaigns } from "../../src/server/jobs/run-automated-campaign";
import { getServices } from "../../src/server/container";
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

async function seedActiveBlueprint(tenantId: string, name = "Acme Offer") {
  const [row] = await adminDb()
    .insert(blueprints)
    .values({ tenantId, name, status: "active", sections: MINIMAL_SECTIONS })
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

async function createActiveCampaign(
  token: string,
  blueprintId: string,
  senderAccountId: string,
  category: string,
) {
  const created = await call(createCampaignPOST, {
    token,
    body: {
      name: `Campaign ${category}`,
      blueprintId,
      senderAccountId,
      discoveryQuery: { category, location: { text: "Austin, TX" } },
      signatureName: "Jane Doe",
      replyPollingEnabled: false,
    },
  });
  const id = created.json.data.id as string;
  await call(resumeCampaignPOST, { token, method: "POST", routeCtx: params(id) });
  return id;
}

async function leadsForCampaign(campaignId: string) {
  return await adminDb().select().from(automatedLeads).where(eq(automatedLeads.campaignId, campaignId));
}
async function sendsForCampaign(campaignId: string) {
  return await adminDb().select().from(automatedSends).where(eq(automatedSends.campaignId, campaignId));
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("runAutomatedCampaigns — discover → enrich → generate → send", () => {
  it("discovers, enriches, writes copy, and sends for every eligible lead", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "dentist");

    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.status === "sent")).toBe(true);
    expect(leads.every((l) => l.email)).toBe(true);

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(5);
    expect(sends.every((s) => s.status === "sent")).toBe(true);
    expect(sends.every((s) => s.body.includes("Jane Doe"))).toBe(true); // signature appended
  });

  it("excludes leads with no findable email from the send pipeline entirely", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    // MockEmailFinder returns null whenever businessName contains %%NOEMAIL%% —
    // MockLeadDiscovery embeds `category` into every generated businessName.
    const campaignId = await createActiveCampaign(
      token,
      blueprint.id,
      sender.id,
      "restaurant %%NOEMAIL%%",
    );

    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.status === "no_email")).toBe(true);
    expect(leads.every((l) => !l.email)).toBe(true);

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(0);

    // The product-facing rule: a business with no findable email is never a
    // "lead" — it must never appear via the leads-table API, regardless of
    // status filter (the row still exists internally, dedup-only).
    const apiAllStatuses = await call(listLeadsGET, { token, routeCtx: params(campaignId) });
    expect(apiAllStatuses.json.data.leads).toHaveLength(0);
  });

  it("a discovered lead whose listing already carries an email is born ready (source: osm), skipping enrichment", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "bakery");

    const inserted = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      automatedLeadRepo.upsertDiscovered(ctx, campaignId, [
        {
          sourcePlaceId: "osm:node/999",
          name: "Listed Bakery",
          email: "hello@listedbakery.example.com",
        },
        { sourcePlaceId: "osm:node/1000", name: "Unlisted Bakery" },
      ]),
    );
    const listed = inserted.find((l) => l.sourcePlaceId === "osm:node/999");
    const unlisted = inserted.find((l) => l.sourcePlaceId === "osm:node/1000");
    expect(listed?.status).toBe("ready");
    expect(listed?.email).toBe("hello@listedbakery.example.com");
    expect(listed?.emailSource).toBe("osm");
    expect(unlisted?.status).toBe("discovered");

    // Enrichment must not re-process the born-ready lead.
    const pending = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      automatedLeadRepo.listPendingEnrichment(ctx, campaignId, 50),
    );
    expect(pending.map((l) => l.sourcePlaceId)).toEqual(["osm:node/1000"]);
  });

  it("dedups on a repeated run — no duplicate leads or double sends", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "cafe");

    await runAutomatedCampaigns(getServices());
    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5); // not 10

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(5); // not 10
  });

  it("enforces an independent 50/day cap — truncates the batch and leaves the rest for tomorrow", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "gym");

    // Pad today's automated-send count to 48 via a filler campaign, so only
    // 2 slots remain under the 50/day cap.
    const fillerBlueprint = await seedActiveBlueprint(tenant.id, "Filler Offer");
    const fillerCampaign = await call(createCampaignPOST, {
      token,
      body: {
        name: "Filler",
        blueprintId: fillerBlueprint.id,
        senderAccountId: sender.id,
        discoveryQuery: { category: "filler", location: { text: "Austin, TX" } },
        signatureName: "Jane Doe",
        replyPollingEnabled: false,
      },
    });
    const fillerCampaignId = fillerCampaign.json.data.id as string;

    await withTenantTx({ tenantId: tenant.id }, async (ctx) => {
      const fillerLeads = await automatedLeadRepo.upsertDiscovered(
        ctx,
        fillerCampaignId,
        Array.from({ length: 48 }, (_, i) => ({
          sourcePlaceId: `filler:${i}`,
          name: `Filler ${i}`,
        })),
      );
      await automatedSendRepo.bulkInsert(
        ctx,
        fillerLeads.map((l) => ({
          campaignId: fillerCampaignId,
          leadId: l.id,
          senderAccountId: sender.id,
          subject: "x",
          body: "x",
          scheduledAt: new Date(),
        })),
      );
    });

    await runAutomatedCampaigns(getServices());

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(2); // only what's left of the 50/day cap

    const leads = await leadsForCampaign(campaignId);
    const sentLeads = leads.filter((l) => l.status === "sent");
    const readyLeads = leads.filter((l) => l.status === "ready");
    expect(sentLeads).toHaveLength(2);
    expect(readyLeads).toHaveLength(3); // left for the next tick, not lost
  });
});
