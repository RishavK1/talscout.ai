import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { POST as resumeCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/resume/route";
import { GET as listLeadsGET } from "../../src/app/api/automated-campaigns/[id]/leads/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { blueprints, senderAccounts, automatedLeads, automatedSends, automatedCampaigns } from "../../src/server/db/schema";
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

async function seedQualifyingBlueprint(
  tenantId: string,
  websiteRequirement: "no_or_weak_site" | "has_site",
  name: string,
) {
  const [row] = await adminDb()
    .insert(blueprints)
    .values({
      tenantId,
      name,
      status: "active",
      sections: { ...MINIMAL_SECTIONS, leadQualification: { websiteRequirement, criteria: [] } },
    })
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

describe("runAutomatedCampaigns — discover → enrich → generate → schedule", () => {
  it("discovers, enriches, and writes staggered-send copy for every eligible lead", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "dentist");

    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    // "queued", not "sent" — the actual send is a separately-scheduled,
    // paced job (see send-automated-email.test.ts), never fired inline here.
    expect(leads.every((l) => l.status === "queued")).toBe(true);
    expect(leads.every((l) => l.email)).toBe(true);

    // Day 0/3/7 sequencing — 3 sends per lead (5 leads × 3 steps).
    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(15);
    expect(sends.every((s) => s.status === "scheduled")).toBe(true);
    expect(sends.every((s) => s.body.includes("Jane Doe"))).toBe(true); // signature appended
    expect(sends.filter((s) => s.stepIndex === 0)).toHaveLength(5);
    expect(sends.filter((s) => s.stepIndex === 1)).toHaveLength(5);
    expect(sends.filter((s) => s.stepIndex === 2)).toHaveLength(5);

    // Day 3/7 land ~3/~7 days after their own lead's Day 0 — same sender,
    // for Gmail thread continuity.
    for (const day0 of sends.filter((s) => s.stepIndex === 0)) {
      const day3 = sends.find((s) => s.leadId === day0.leadId && s.stepIndex === 1);
      const day7 = sends.find((s) => s.leadId === day0.leadId && s.stepIndex === 2);
      expect(day3!.senderAccountId).toBe(day0.senderAccountId);
      expect(day7!.senderAccountId).toBe(day0.senderAccountId);
      const day3OffsetMs = day3!.scheduledAt.getTime() - day0.scheduledAt.getTime();
      const day7OffsetMs = day7!.scheduledAt.getTime() - day0.scheduledAt.getTime();
      expect(day3OffsetMs).toBe(3 * 24 * 60 * 60 * 1000);
      expect(day7OffsetMs).toBe(7 * 24 * 60 * 60 * 1000);
    }

    // The whole point of this change: Day 0 sends must NOT all land in the
    // same minute (the exact bug that got 12 emails fired back-to-back and
    // put the sending mailbox at spam risk). Block+jitter scheduling (the
    // same algorithm Bulk Fire uses) spreads 5 Day-0 sends across ~4 pacing
    // blocks.
    const day0Times = sends
      .filter((s) => s.stepIndex === 0)
      .map((s) => s.scheduledAt.getTime())
      .sort((a, b) => a - b);
    const spanMs = day0Times[day0Times.length - 1] - day0Times[0];
    expect(spanMs).toBeGreaterThan(3 * 60_000); // well over "all in one minute"
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
    expect(sends).toHaveLength(15); // 5 leads × 3 steps, not 30
  });

  it("enforces an independent 50/day cap — truncates the batch and leaves the rest for tomorrow", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);

    // Pad today's automated-send count to 48 via a filler campaign BEFORE
    // activating the real campaign below — activation now triggers an
    // immediate run (resumeCampaign's afterCommit), so the cap must already
    // be in place for THAT run to be the one that gets truncated to the 2
    // slots left, rather than the explicit sweep at the end of this test.
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
          stepIndex: 0 as const,
          subject: "x",
          body: "x",
          scheduledAt: new Date(),
        })),
      );
    });

    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "gym");

    // A subsequent sweep must not double-process what activation's
    // immediate run already handled.
    await runAutomatedCampaigns(getServices());

    // The cap gates how many LEADS start a new sequence today (2 of the
    // remaining 50/day slots), not raw row count — each surviving lead still
    // gets its full Day 0/3/7 sequence, mirroring Bulk Fire's own
    // cascadeFollowups precedent (see scheduleAndEnqueue's doc comment).
    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(6); // 2 leads × 3 steps

    const leads = await leadsForCampaign(campaignId);
    const queuedLeads = leads.filter((l) => l.status === "queued");
    const readyLeads = leads.filter((l) => l.status === "ready");
    expect(queuedLeads).toHaveLength(2);
    expect(readyLeads).toHaveLength(3); // left for the next tick, not lost
  });
});

describe("runAutomatedCampaigns — blueprint becomes unusable mid-flight", () => {
  it("flips the campaign to a visible 'error' status instead of silently doing nothing forever", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "gym");

    // Simulate the blueprint losing its sections after the campaign was
    // already active — same effective state a run-time null-check must
    // survive (archived without ever generating, a bug in some other write
    // path, etc.), not just the blueprint-delete guard's own path.
    await adminDb().update(blueprints).set({ sections: null }).where(eq(blueprints.id, blueprint.id));

    await expect(runAutomatedCampaigns(getServices())).resolves.not.toThrow();

    const [campaign] = await adminDb()
      .select()
      .from(automatedCampaigns)
      .where(eq(automatedCampaigns.id, campaignId));
    expect(campaign.status).toBe("error");
    expect(campaign.errorReason).toContain("blueprint");
  });
});

describe("runAutomatedCampaigns — regenerating a blueprint mid-campaign never mutates already-generated sends", () => {
  it("already-scheduled Day 0/3/7 copy is frozen at generation time, unaffected by a later blueprint regenerate", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "vet");

    await runAutomatedCampaigns(getServices());

    const sendsBefore = await sendsForCampaign(campaignId);
    expect(sendsBefore).toHaveLength(15); // 5 leads x 3 steps
    // The mock copywriter embeds whatWeOffer/differentiator verbatim, so this
    // confirms the original copy really does reflect the ORIGINAL sections.
    expect(sendsBefore.every((s) => s.body.includes("A scheduling tool"))).toBe(true);

    // Regenerate the SAME blueprint row with entirely different sections —
    // exactly what the wizard's "regenerate" flow does mid-campaign.
    await adminDb()
      .update(blueprints)
      .set({
        sections: {
          ...MINIMAL_SECTIONS,
          whatWeOffer: "A brand-new completely different offer",
          differentiator: "Totally rewritten pitch",
        },
      })
      .where(eq(blueprints.id, blueprint.id));

    // The already-generated rows must be byte-for-byte unchanged — the
    // pipeline snapshots subject/body into automated_sends at generation
    // time and never re-reads the blueprint for a row that already has copy.
    const sendsAfter = await sendsForCampaign(campaignId);
    expect(sendsAfter).toHaveLength(15);
    for (const before of sendsBefore) {
      const after = sendsAfter.find((s) => s.id === before.id);
      expect(after?.subject).toBe(before.subject);
      expect(after?.body).toBe(before.body);
      expect(after?.body.includes("A scheduling tool")).toBe(true);
      expect(after?.body.includes("A brand-new completely different offer")).toBe(false);
    }

    // ...but a FRESH lead entering the pipeline after the regenerate really
    // does get copy from the new sections — proving the "unchanged" check
    // above isn't a coincidence of the mock always returning identical text.
    const campaignId2 = await createActiveCampaign(token, blueprint.id, sender.id, "vet clinic");
    await runAutomatedCampaigns(getServices());
    const newSends = await sendsForCampaign(campaignId2);
    expect(newSends.length).toBeGreaterThan(0);
    expect(newSends.every((s) => s.body.includes("A brand-new completely different offer"))).toBe(true);
  });
});

describe("runAutomatedCampaigns — lead qualification gate", () => {
  it("regression: a blueprint with no leadQualification (or websiteRequirement 'any') behaves exactly as before — every enriched lead reaches ready", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id); // MINIMAL_SECTIONS has no leadQualification
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "florist");

    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.status === "queued")).toBe(true);
  });

  it("'no_or_weak_site' + no website found → auto-qualifies without a qualifier call", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedQualifyingBlueprint(tenant.id, "no_or_weak_site", "Website Builder Offer");
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "plumber %%NOWEBSITE%%");

    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.status === "queued")).toBe(true);
    expect(leads.every((l) => !l.website)).toBe(true);
  });

  it("'has_site' + no website found → auto-disqualified, never reaches copy/send", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedQualifyingBlueprint(tenant.id, "has_site", "SEO Audit Offer");
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "salon %%NOWEBSITE%%");

    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.status === "disqualified")).toBe(true);
    expect(leads.every((l) => l.notes?.includes("targets businesses with an existing site"))).toBe(true);

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(0);

    // Disqualified leads never surface via the leads-table API — same as
    // "no_email"/"discovered", they're internal pipeline bookkeeping, not a
    // "lead" the product shows (LISTABLE_STATUSES is an inclusion list).
    const apiLeads = await call(listLeadsGET, { token, routeCtx: params(campaignId) });
    expect(apiLeads.json.data.leads).toHaveLength(0);
    expect(apiLeads.json.data.total).toBe(0);
  });

  it("'no_or_weak_site' + website present → routes through the lead qualifier, both outcomes land the right status + reason", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedQualifyingBlueprint(tenant.id, "no_or_weak_site", "Web Design Offer");
    const sender = await seedGmailSender(tenant.id);
    // MockLeadDiscovery embeds a %%POLISHED%% marker in every generated
    // website when the category sentinel is present — MockLeadQualifier
    // reads that as "already has a great site" (disqualified).
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "dentist %%POLISHED%%");

    await runAutomatedCampaigns(getServices());

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.website)).toBe(true);
    expect(leads.every((l) => l.status === "disqualified")).toBe(true);
    expect(leads.every((l) => l.notes?.includes("polished"))).toBe(true);

    // Same setup WITHOUT the polish marker — the qualifier should let it through.
    const campaignId2 = await createActiveCampaign(token, blueprint.id, sender.id, "dentist");
    await runAutomatedCampaigns(getServices());
    const leads2 = await leadsForCampaign(campaignId2);
    expect(leads2).toHaveLength(5);
    expect(leads2.every((l) => l.status === "queued")).toBe(true);
  });
});
