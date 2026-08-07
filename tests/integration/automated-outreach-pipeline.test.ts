import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { POST as resumeCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/resume/route";
import { GET as listLeadsGET } from "../../src/app/api/automated-campaigns/[id]/leads/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import {
  blueprints,
  senderAccounts,
  automatedLeads,
  automatedSends,
  automatedCampaigns,
  tenants,
} from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";
import { withTenantTx } from "../../src/server/db/tx";
import {
  automatedLeadRepo,
  automatedSendRepo,
  suppressedEmailRepo,
} from "../../src/server/repositories/automated-outreach.repo";
import { runAutomatedCampaigns } from "../../src/server/jobs/run-automated-campaign";
import { sendAutomatedEmail } from "../../src/server/jobs/send-automated-email";
import { getServices } from "../../src/server/container";
import type { BlueprintSections } from "../../src/server/ports";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Tenants default to the starter plan (1 active campaign, 25 sends/day).
 *  Tests that exercise pipeline behavior rather than billing limits move to
 *  a plan with enough headroom so a quota never masks what's under test. */
const setPlan = (tenantId: string, plan: string) =>
  adminDb().update(tenants).set({ plan }).where(eq(tenants.id, tenantId));

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
  overrides: Record<string, unknown> = {},
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
      ...overrides,
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
    // Activating below already triggers one real, full discover→enrich→
    // generate→schedule run via resumeCampaign's afterCommit hook (see
    // createActiveCampaign) — no separate runAutomatedCampaigns() call here,
    // that would be a second, genuinely distinct tick (see the "dedups on a
    // repeated run" test below for what that looks like).
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "dentist");

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    // "queued", not "sent" — the actual send is a separately-scheduled,
    // paced job (see send-automated-email.test.ts), never fired inline here.
    expect(leads.every((l) => l.status === "queued")).toBe(true);
    expect(leads.every((l) => l.email)).toBe(true);

    // ONLY Day 0 is written up front — one send per lead. Day 3/7 copy is
    // deferred until Day 0 has actually sent (see followUpPhase): writing all
    // three immediately tripled every tick's AI calls for follow-ups that
    // frequently never send, which exhausted free-tier quotas before even
    // Day 0 could be committed.
    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(5);
    expect(sends.every((s) => s.status === "scheduled")).toBe(true);
    expect(sends.every((s) => s.body.includes("Jane Doe"))).toBe(true); // signature appended
    expect(sends.every((s) => s.stepIndex === 0)).toBe(true);

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

  it("threads the campaign's saved marketResearch into every generated email", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const research = "Austin dentists rarely run paid ads and mostly rely on referrals.";
    // Spy BEFORE creating/activating — activation's afterCommit hook
    // enqueues an immediate run-now job that InProcessQueue (mock/test mode)
    // executes inline and synchronously, so by the time createActiveCampaign
    // resolves the whole discover→enrich→generate→schedule cycle has often
    // already happened once.
    const generateSpy = vi.spyOn(getServices().outreachCopywriter, "generateEmail");
    await createActiveCampaign(token, blueprint.id, sender.id, "dentist", {
      marketResearch: research,
    });
    await runAutomatedCampaigns(getServices());

    expect(generateSpy).toHaveBeenCalled();
    for (const call of generateSpy.mock.calls) {
      expect(call[0].marketResearch).toBe(research);
    }
    vi.restoreAllMocks();
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

  it("a repeated tick finds NEW businesses instead of re-fetching the same page forever", async () => {
    // Regression test for the actual production incident: two real campaigns
    // ran their first tick fine, then sat "active" with lastDiscoveryRunAt
    // updating every 6 hours while producing zero new leads — forever. Root
    // cause was discovery being stateless across runs: every tick asked the
    // same provider the same question, got the same capped, stable-ordered
    // page of results back, and dedup discarded 100% of it as already-known.
    // The campaign LOOKED alive (lastDiscoveryRunAt kept advancing) while
    // being permanently stuck. Fixed by threading known sourcePlaceIds into
    // discovery (see LeadDiscoveryQuery.excludeSourcePlaceIds) so a repeat
    // run pages PAST what it already has.
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    // Activating already runs tick #1 (5 leads — one MOCK_PAGE_SIZE page, see
    // mock.lead-discovery.ts). MockLeadDiscovery's universe is 12 total, so
    // it takes 3 pages of 5 to exhaust: 5, then 5 more, then the last 2.
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "cafe");
    const afterTick1 = await leadsForCampaign(campaignId);
    expect(afterTick1).toHaveLength(5);

    // Tick #2 — a later cron sweep with no code change since. Must reach a
    // genuinely NEW page (5 more), not re-discover the same 5 and find
    // "nothing new" again — that exact silent stall is the production bug.
    await runAutomatedCampaigns(getServices());
    const afterTick2 = await leadsForCampaign(campaignId);
    expect(afterTick2).toHaveLength(10); // not stuck at 5
    expect(new Set(afterTick2.map((l) => l.sourcePlaceId)).size).toBe(10); // no dupes

    // Tick #3 — reaches the last 2 remaining businesses. The universe is now
    // fully exhausted.
    await runAutomatedCampaigns(getServices());
    const afterTick3 = await leadsForCampaign(campaignId);
    expect(afterTick3).toHaveLength(12);
    expect(new Set(afterTick3.map((l) => l.sourcePlaceId)).size).toBe(12);

    // Tick #4 — nothing left to find. Must not error, must not fabricate
    // leads, must not touch what's already there.
    await runAutomatedCampaigns(getServices());
    expect(await leadsForCampaign(campaignId)).toHaveLength(12);

    // Every business still gets its Day 0 exactly once — the original dedup
    // guarantee this test covers, still true. (Day 3/7 are written later, by
    // followUpPhase, only once Day 0 has actually sent.)
    const sends = await sendsForCampaign(campaignId);
    const byLead = new Map<string, number>();
    for (const s of sends) byLead.set(s.leadId, (byLead.get(s.leadId) ?? 0) + 1);
    expect(byLead.size).toBe(12);
    for (const count of byLead.values()) expect(count).toBe(1);
  });

  it("enforces the plan's independent daily cap — truncates the batch and leaves the rest for tomorrow", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);

    // Tenants default to the starter plan, whose automated cap is 25/day
    // (see automatedDailySendCap in lib/plans.ts). Pad today's count to 23
    // via a filler campaign BEFORE activating the real campaign below —
    // activation triggers an immediate run (resumeCampaign's afterCommit),
    // so the cap must already be in place for THAT run to be the one
    // truncated to the 2 remaining slots, rather than the explicit sweep at
    // the end of this test.
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
        Array.from({ length: 23 }, (_, i) => ({
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

    // Activating triggers the one real run this test is about — no separate
    // runAutomatedCampaigns() call, that would be a genuinely later tick and
    // (now that discovery pages forward — see the "repeated tick" test above)
    // would pull in a new page of leads that has nothing to do with cap
    // truncation.
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "gym");

    // The cap gates how many LEADS start a new sequence today (the 2
    // remaining slots of the plan's 25). Each gets its Day 0 now; follow-ups
    // are written later by followUpPhase once Day 0 has sent.
    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(2); // 2 leads × Day 0 only

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
    await setPlan(tenant.id, "scale"); // two concurrently-active campaigns below
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "vet");

    const sendsBefore = await sendsForCampaign(campaignId);
    expect(sendsBefore).toHaveLength(5); // 5 leads x Day 0 (follow-ups deferred)
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
    expect(sendsAfter).toHaveLength(5);
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

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.status === "queued")).toBe(true);
  });

  it("'no_or_weak_site' + no website found → auto-qualifies without a qualifier call", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedQualifyingBlueprint(tenant.id, "no_or_weak_site", "Website Builder Offer");
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "plumber %%NOWEBSITE%%");

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
    await setPlan(tenant.id, "scale"); // two concurrently-active campaigns below
    const blueprint = await seedQualifyingBlueprint(tenant.id, "no_or_weak_site", "Web Design Offer");
    const sender = await seedGmailSender(tenant.id);
    // MockLeadDiscovery embeds a %%POLISHED%% marker in every generated
    // website when the category sentinel is present — MockLeadQualifier
    // reads that as "already has a great site" (disqualified).
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "dentist %%POLISHED%%");

    const leads = await leadsForCampaign(campaignId);
    expect(leads).toHaveLength(5);
    expect(leads.every((l) => l.website)).toBe(true);
    expect(leads.every((l) => l.status === "disqualified")).toBe(true);
    expect(leads.every((l) => l.notes?.includes("polished"))).toBe(true);

    // Same setup WITHOUT the polish marker — the qualifier should let it through.
    const campaignId2 = await createActiveCampaign(token, blueprint.id, sender.id, "dentist");
    const leads2 = await leadsForCampaign(campaignId2);
    expect(leads2).toHaveLength(5);
    expect(leads2.every((l) => l.status === "queued")).toBe(true);
  });
});

describe("runAutomatedCampaigns — MX-check gate (email-verification sprint)", () => {
  it("an address whose domain has no MX/A/AAAA record never reaches 'ready' — treated as no_email", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    // MockEmailFinder derives the email from businessName's slug —
    // MockEmailVerifier treats any address containing "invalidmx" as having
    // no valid MX/A/AAAA (see mock.email-verifier.ts).
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "plumber %%INVALIDMX%%");

    // Terminal "no_email" is hidden bookkeeping (matches a genuine
    // email-finder miss) — never surfaced as a visible lead.
    const leads = await leadsForCampaign(campaignId);
    expect(leads.every((l) => l.status === "no_email")).toBe(true);
    expect(leads.every((l) => l.notes?.includes("MX"))).toBe(true);

    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(0);
  });

  it("an OSM listing's own tagged email is also MX-checked, not just waterfall-found ones", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    // %%OSMEMAIL%% gives the first discovered business an email straight
    // from "OSM" (born ready, bypassing enrichBatch — see
    // mock.lead-discovery.ts), and %%INVALIDMX%% makes that email's domain
    // fail the MX check specifically on THIS path.
    const campaignId = await createActiveCampaign(
      token,
      blueprint.id,
      sender.id,
      "bakery %%OSMEMAIL%% %%INVALIDMX%%",
    );

    const leads = await leadsForCampaign(campaignId);
    const osmLead = leads.find((l) => l.emailSource === "osm");
    expect(osmLead).toBeTruthy();
    // Overridden from its initial "ready" (set at insert time) by the same
    // MX gate the waterfall path uses — proving discoverPhase's OWN loop
    // (not just enrichBatch) applies it.
    expect(osmLead?.status).toBe("no_email");
  });
});

describe("runAutomatedCampaigns — email-identity gate (wrong-person incident fix)", () => {
  it("an email whose domain has no relation to the business is rejected, not sent, even though every other gate would pass it", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);

    // Real production shape: a plausible, deliverable, non-suppressed email
    // that simply belongs to someone else entirely (the web agency's
    // address, scraped off the client's site footer).
    const findSpy = vi
      .spyOn(getServices().emailFinder, "find")
      .mockResolvedValueOnce({ email: "contact@totallyunrelatedvendor.com", source: "site_scrape" });

    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "dentist");

    const leads = await leadsForCampaign(campaignId);
    const bad = leads.find((l) => l.email === "contact@totallyunrelatedvendor.com");
    expect(bad).toBeUndefined(); // never persisted as a live email at all

    const rejected = leads.find((l) => l.status === "no_email" && l.notes?.includes("Email domain"));
    expect(rejected).toBeTruthy();

    // Never reached the send pipeline.
    const sends = await sendsForCampaign(campaignId);
    expect(sends.some((s) => s.leadId === rejected!.id)).toBe(false);

    findSpy.mockRestore();
  });
});

describe("runAutomatedCampaigns — suppression gate (unsubscribe sprint)", () => {
  it("a suppressed email is never qualified or emailed — visible as 'suppressed', not silently dropped", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    // Pre-suppress every address this run will find — MockEmailFinder's
    // slug for category "florist" always resolves to the same domain, so
    // suppressing that exact address up front reliably hits the gate.
    await suppressedEmailRepo.addAdmin(tenant.id, "contact@florist-business-1.example.com", "test setup");

    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "florist");

    const leads = await leadsForCampaign(campaignId);
    const suppressed = leads.find((l) => l.email === "contact@florist-business-1.example.com");
    expect(suppressed?.status).toBe("suppressed");
    expect(suppressed?.notes).toContain("unsubscribed");
    // The other 4 (not suppressed) still went through normally.
    expect(leads.filter((l) => l.status === "queued")).toHaveLength(4);

    // Only the 4 non-suppressed leads got a Day 0/3/7 sequence — the
    // suppressed one was never scheduled at all.
    const sends = await sendsForCampaign(campaignId);
    expect(sends).toHaveLength(4); // 4 leads × Day 0, not 5 — the suppressed one never scheduled
    expect(sends.some((s) => s.leadId === suppressed!.id)).toBe(false);
  });

  it("suppression is re-checked at SEND time — a later unsubscribe stops a follow-up already scheduled before it happened", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "vet");

    // Day 0 goes out fine — nothing suppressed yet.
    const day0 = (await sendsForCampaign(campaignId)).find((s) => s.stepIndex === 0)!;
    await sendAutomatedEmail({ tenantId: tenant.id, sendId: day0.id }, getServices());
    const sentDay0 = await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedSendRepo.getById(ctx, day0.id));
    expect(sentDay0?.status).toBe("sent");

    // Day 3/7 copy is written by a LATER tick, once Day 0 has actually sent
    // (see followUpPhase) — not up front alongside Day 0.
    await runAutomatedCampaigns(getServices());
    const followUps = (await sendsForCampaign(campaignId)).filter(
      (s) => s.leadId === day0.leadId && s.stepIndex > 0,
    );
    expect(followUps).toHaveLength(2);

    // The recipient unsubscribes (e.g. clicked the link in that Day 0 email)
    // sometime before Day 3 is due to fire.
    const lead = await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedLeadRepo.getById(ctx, day0.leadId));
    await suppressedEmailRepo.addAdmin(tenant.id, lead!.email!, "unsubscribed via email link");

    const day3 = followUps.find((s) => s.stepIndex === 1)!;
    await sendAutomatedEmail({ tenantId: tenant.id, sendId: day3.id }, getServices());

    const sentDay3 = await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedSendRepo.getById(ctx, day3.id));
    expect(sentDay3?.status).toBe("skipped");
    expect(sentDay3?.errorReason).toBe("suppressed_unsubscribed");

    const updatedLead = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      automatedLeadRepo.getById(ctx, day0.leadId),
    );
    expect(updatedLead?.status).toBe("suppressed");
  });
});

describe("runAutomatedCampaigns — per-lead personalization (website content + named greeting)", () => {
  it("greets a named contact by first name and grounds the email in that lead's own website content", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    // %%SITETEXT%% (MockLeadDiscovery) gives the lead a website whose
    // MockSiteTextFetcher fixture text is distinctive fixed content;
    // %%PERSONEMAIL%% (MockEmailFinder) resolves to a named-person address
    // (jane.doe@...), which assessContact tiers as "person".
    const campaignId = await createActiveCampaign(
      token,
      blueprint.id,
      sender.id,
      "school %%SITETEXT%% %%PERSONEMAIL%%",
    );

    const leads = await leadsForCampaign(campaignId);
    expect(leads.every((l) => l.contactTier === "person")).toBe(true);

    const sends = await sendsForCampaign(campaignId);
    const day0 = sends.filter((s) => s.stepIndex === 0);
    expect(day0.length).toBeGreaterThan(0);
    // MockOutreachCopywriter echoes recipientFirstName into the greeting and
    // websiteExcerpt into the body when the pipeline actually threads them
    // through — this is the end-to-end proof, not just a unit-level check.
    expect(day0.every((s) => s.body.startsWith("Hi Jane,"))).toBe(true);
    expect(day0.every((s) => s.body.includes("robotics enrichment program"))).toBe(true);
  });

  it("does not fabricate a greeting name or website content for a generic/no-website lead", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "bakery");

    const sends = await sendsForCampaign(campaignId);
    const day0 = sends.filter((s) => s.stepIndex === 0);
    expect(day0.length).toBeGreaterThan(0);
    expect(day0.every((s) => s.body.includes(" team,"))).toBe(true); // generic "Hi X team," greeting
    expect(day0.every((s) => !s.body.includes("robotics enrichment program"))).toBe(true);
  });
});

describe("runAutomatedCampaigns — deferred follow-up generation", () => {
  it("writes NO follow-up copy until Day 0 has actually sent, then writes both offset from the real send time", async () => {
    // Regression for a real production stall: generating Day 0/3/7 up front
    // meant 53 ready leads cost 159 AI generations in one tick, which
    // exhausted every free-tier writer (Gemini quota + OpenRouter 429s) before
    // a single email could be committed — the campaign wrote ZERO emails for
    // hours while appearing healthy.
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "gym");

    // Day 0 only, even after a second full tick — an unsent Day 0 must never
    // trigger follow-up generation.
    await runAutomatedCampaigns(getServices());
    let sends = await sendsForCampaign(campaignId);
    expect(sends.every((s) => s.stepIndex === 0)).toBe(true);

    const day0 = sends.find((s) => s.stepIndex === 0)!;
    await sendAutomatedEmail({ tenantId: tenant.id, sendId: day0.id }, getServices());

    // Now that Day 0 genuinely sent, the next tick writes its follow-ups.
    await runAutomatedCampaigns(getServices());
    sends = await sendsForCampaign(campaignId);
    const mine = sends.filter((s) => s.leadId === day0.leadId);
    const day3 = mine.find((s) => s.stepIndex === 1)!;
    const day7 = mine.find((s) => s.stepIndex === 2)!;
    expect(day3).toBeTruthy();
    expect(day7).toBeTruthy();

    // Offsets are measured from the ACTUAL send time, not the original
    // schedule — same sender, for Gmail thread continuity.
    const sentAt = (
      await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedSendRepo.getById(ctx, day0.id))
    )!.sentAt!;
    expect(day3.scheduledAt.getTime() - sentAt.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(day7.scheduledAt.getTime() - sentAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(day3.senderAccountId).toBe(day0.senderAccountId);
    expect(day7.senderAccountId).toBe(day0.senderAccountId);

    // Idempotent: a further tick must not write duplicate follow-ups.
    await runAutomatedCampaigns(getServices());
    const after = (await sendsForCampaign(campaignId)).filter((s) => s.leadId === day0.leadId);
    expect(after).toHaveLength(3);
  });
});

describe("runAutomatedCampaigns — AI-driven discovery gate (aiDiscoveryEnabled)", () => {
  it("aiDiscoveryEnabled absent (the DB default) → zero ai:-prefixed leads, even though the mock sentinel path is available", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    // No aiDiscoveryEnabled override — createActiveCampaign's default body
    // omits it, so the repo's `?? false` default applies, same as every
    // pre-existing campaign row.
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "spa");

    const leads = await leadsForCampaign(campaignId);
    expect(leads.length).toBeGreaterThan(0);
    expect(leads.some((l) => l.sourcePlaceId.startsWith("ai:"))).toBe(false);
  });

  it("aiDiscoveryEnabled: true → AI-sourced candidates appear and flow through the SAME qualify/enrich/verify gates as everything else", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "spa", {
      aiDiscoveryEnabled: true,
    });

    const leads = await leadsForCampaign(campaignId);
    const aiLeads = leads.filter((l) => l.sourcePlaceId.startsWith("ai:mock:"));
    expect(aiLeads.length).toBeGreaterThan(0);

    // No shortcut around the normal pipeline: AI-sourced leads get enriched
    // (an email found), qualified, and scheduled exactly like an ordinary
    // discovered lead — reaching "queued" with a real Day 0/3/7 sequence.
    expect(aiLeads.every((l) => l.status === "queued")).toBe(true);
    expect(aiLeads.every((l) => l.email)).toBe(true);

    const sends = await sendsForCampaign(campaignId);
    for (const aiLead of aiLeads) {
      expect(sends.filter((s) => s.leadId === aiLead.id)).toHaveLength(1);
    }
  });

  it("aiDiscoveryEnabled: false explicitly set behaves identically to absent — no ai:-prefixed leads", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveCampaign(token, blueprint.id, sender.id, "spa", {
      aiDiscoveryEnabled: false,
    });

    const leads = await leadsForCampaign(campaignId);
    expect(leads.some((l) => l.sourcePlaceId.startsWith("ai:"))).toBe(false);
  });
});

describe("runAutomatedCampaigns — no_email retry boundary conditions", () => {
  it("retries a no_email lead only once attempts < 3 AND the 24h cooldown has passed; leaves attempts>=3 or too-recent leads excluded", async () => {
    const { tenant } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);

    // A campaign row is needed as the FK target, but we drive
    // listPendingEnrichment directly rather than through the full job, so
    // boundary conditions can be set with exact precision.
    const [campaign] = await adminDb()
      .insert(automatedCampaigns)
      .values({
        tenantId: tenant.id,
        blueprintId: blueprint.id,
        senderAccountId: sender.id,
        name: "Boundary Test",
        discoveryQuery: { category: "gym", location: { text: "Austin, TX" } },
        signatureName: "Jane Doe",
        status: "active",
      })
      .returning();

    const inserted = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      automatedLeadRepo.upsertDiscovered(ctx, campaign.id, [
        { sourcePlaceId: "b:still-discovered", name: "Still Discovered" },
        { sourcePlaceId: "b:eligible", name: "Eligible Retry" },
        { sourcePlaceId: "b:maxed-out", name: "Maxed Out" },
        { sourcePlaceId: "b:too-recent", name: "Too Recent" },
      ]),
    );
    const byPlaceId = new Map(inserted.map((l) => [l.sourcePlaceId, l]));

    const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

    // "b:still-discovered" stays status "discovered" — always eligible,
    // untouched below.

    // Eligible: 2 attempts (< 3), last attempt 25h ago (> 24h cooldown).
    await adminDb()
      .update(automatedLeads)
      .set({ status: "no_email", enrichmentAttempts: 2, enrichedAt: hoursAgo(25) })
      .where(eq(automatedLeads.id, byPlaceId.get("b:eligible")!.id));

    // Maxed out: 3 attempts (== NO_EMAIL_MAX_RETRY_ATTEMPTS), even though the
    // cooldown has long passed — attempt count alone must exclude it.
    await adminDb()
      .update(automatedLeads)
      .set({ status: "no_email", enrichmentAttempts: 3, enrichedAt: hoursAgo(100) })
      .where(eq(automatedLeads.id, byPlaceId.get("b:maxed-out")!.id));

    // Too recent: 1 attempt (well under the cap), but only 1h since the last
    // attempt — the SAME tick's later batch must not immediately re-try it.
    await adminDb()
      .update(automatedLeads)
      .set({ status: "no_email", enrichmentAttempts: 1, enrichedAt: hoursAgo(1) })
      .where(eq(automatedLeads.id, byPlaceId.get("b:too-recent")!.id));

    const pending = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      automatedLeadRepo.listPendingEnrichment(ctx, campaign.id, 50),
    );
    const pendingPlaceIds = new Set(pending.map((l) => l.sourcePlaceId));
    expect(pendingPlaceIds).toEqual(new Set(["b:still-discovered", "b:eligible"]));
  });

  it("markNoEmail increments enrichmentAttempts each time it's called", async () => {
    const { tenant } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const [campaign] = await adminDb()
      .insert(automatedCampaigns)
      .values({
        tenantId: tenant.id,
        blueprintId: blueprint.id,
        senderAccountId: sender.id,
        name: "Attempt Counter Test",
        discoveryQuery: { category: "gym", location: { text: "Austin, TX" } },
        signatureName: "Jane Doe",
        status: "active",
      })
      .returning();
    const [lead] = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      automatedLeadRepo.upsertDiscovered(ctx, campaign.id, [
        { sourcePlaceId: "c:retry-me", name: "Retry Me" },
      ]),
    );

    await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedLeadRepo.markNoEmail(ctx, lead.id));
    await withTenantTx({ tenantId: tenant.id }, (ctx) => automatedLeadRepo.markNoEmail(ctx, lead.id));

    const [row] = await adminDb().select().from(automatedLeads).where(eq(automatedLeads.id, lead.id));
    expect(row.enrichmentAttempts).toBe(2);
  });
});
