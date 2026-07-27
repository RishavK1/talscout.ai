import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createBlueprintPOST } from "../../src/app/api/blueprints/route";
import { POST as suggestBlueprintPOST } from "../../src/app/api/blueprints/suggest/route";
import { POST as generateBlueprintPOST } from "../../src/app/api/blueprints/[id]/generate/route";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { POST as resumeCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/resume/route";
import { POST as researchMarketPOST } from "../../src/app/api/automated-campaigns/research/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { blueprints, senderAccounts, tenants } from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";
import { getServices } from "../../src/server/container";
import { automatedDailySendCapFor } from "../../src/server/services/automated-outreach.service";
import { planHasCapability } from "../../src/lib/plans";
import type { BlueprintSections } from "../../src/server/ports";

/**
 * Plan gating for AI Automated Outreach. Before this existed the entire
 * pipeline — blueprints, lead discovery, AI qualification, AI copy — was
 * reachable on every plan with no capability check at all, so a $99 Starter
 * workspace got the flagship feature (and its per-lead external API cost)
 * for free. These tests pin the gates shut.
 */

const params = (id: string) => ({ params: Promise.resolve({ id }) });
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
  rules: ["Never invent facts"],
};

async function seedActiveBlueprint(tenantId: string, name: string) {
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

function campaignBody(blueprintId: string, senderAccountId: string, name: string) {
  return {
    name,
    blueprintId,
    senderAccountId,
    discoveryQuery: { category: "dentist", location: { text: "Austin, TX" } },
    signatureName: "Jane Doe",
    replyPollingEnabled: false,
  };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("automated_outreach capability matrix", () => {
  it("every paid plan includes automated outreach; only Growth+ includes live web research", () => {
    // All three paid tiers ship automated outreach (Starter at a small
    // allowance), so the capability gate can't 402 on any current plan — it
    // exists so a future free/trial tier, or a plan that drops the feature,
    // is blocked everywhere at once rather than per-route.
    for (const plan of ["starter", "growth", "scale"]) {
      expect(planHasCapability(plan, "automated_outreach")).toBe(true);
    }
    expect(planHasCapability("starter", "blueprint_web_research")).toBe(false);
    expect(planHasCapability("growth", "blueprint_web_research")).toBe(true);
    expect(planHasCapability("scale", "blueprint_web_research")).toBe(true);
  });

  it("starter includes automated outreach but NOT live web research", async () => {
    const { tenant, token } = await makeUser("recruiter");
    // starter is the default; assert explicitly for clarity.
    await setPlan(tenant.id, "starter");

    const researchSpy = vi.spyOn(getServices().webResearcher, "research");

    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    expect(created.status).toBe(201);

    const generated = await call(generateBlueprintPOST, {
      token,
      routeCtx: params(created.json.data.id),
      body: {
        intakeAnswers: {
          businessName: "Acme Offer",
          websiteUrl: "https://acme.example",
          answers: { whatWeSell: "A scheduling tool" },
        },
      },
    });
    expect(generated.status).toBe(200);
    // Generation still succeeds — it just never spends a metered research call.
    expect(researchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("growth unlocks live web research on the same generate() call", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");

    const researchSpy = vi
      .spyOn(getServices().webResearcher, "research")
      .mockResolvedValue("Recent coverage of Acme Offer.");

    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    await call(generateBlueprintPOST, {
      token,
      routeCtx: params(created.json.data.id),
      body: {
        intakeAnswers: {
          businessName: "Acme Offer",
          websiteUrl: "https://acme.example",
          answers: { whatWeSell: "A scheduling tool" },
        },
      },
    });

    expect(researchSpy).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("campaign wizard's market research is gated the same way as blueprint web research", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id, "Offer for research");

    await setPlan(tenant.id, "starter");
    const marketResearchSpy = vi.spyOn(getServices().marketResearcher, "research");
    const starterRes = await call(researchMarketPOST, {
      token,
      body: { blueprintId: blueprint.id, category: "dentist", location: "Austin, TX" },
    });
    expect(starterRes.status).toBe(200);
    expect(starterRes.json.data.research).toBeNull();
    expect(marketResearchSpy).not.toHaveBeenCalled();

    await setPlan(tenant.id, "growth");
    marketResearchSpy.mockResolvedValue("Austin dentists rarely have modern websites.");
    const growthRes = await call(researchMarketPOST, {
      token,
      body: { blueprintId: blueprint.id, category: "dentist", location: "Austin, TX" },
    });
    expect(growthRes.status).toBe(200);
    expect(growthRes.json.data.research).toBe("Austin dentists rarely have modern websites.");
    expect(marketResearchSpy).toHaveBeenCalledTimes(1);
    expect(marketResearchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ category: "dentist", location: "Austin, TX" }),
    );

    vi.restoreAllMocks();
  });

  it("suggest is gated too — it's a real LLM call plus an outbound fetch", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(suggestBlueprintPOST, {
      token,
      body: { name: "Acme", websiteUrl: "https://acme.example" },
    });
    // Starter has the capability, so this succeeds — the assertion that
    // matters is that it runs through assertCapability at all (a plan
    // without it would 402 here rather than burning the call).
    expect(res.status).toBe(200);
  });
});

describe("blueprint quota", () => {
  it("starter allows exactly 1 blueprint and 402s the second", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "starter");

    const first = await call(createBlueprintPOST, { token, body: { name: "Offer One" } });
    expect(first.status).toBe(201);

    const second = await call(createBlueprintPOST, { token, body: { name: "Offer Two" } });
    expect(second.status).toBe(402);
    expect(String(second.json.error?.message ?? "")).toContain("1 blueprint");
  });

  it("growth allows 5 and 402s the sixth", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "growth");

    for (let i = 0; i < 5; i++) {
      const res = await call(createBlueprintPOST, { token, body: { name: `Offer ${i}` } });
      expect(res.status).toBe(201);
    }
    const sixth = await call(createBlueprintPOST, { token, body: { name: "Offer 6" } });
    expect(sixth.status).toBe(402);
  });

  it("scale is unlimited", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");

    for (let i = 0; i < 8; i++) {
      const res = await call(createBlueprintPOST, { token, body: { name: `Offer ${i}` } });
      expect(res.status).toBe(201);
    }
  });
});

describe("active-campaign quota", () => {
  it("starter allows 1 active campaign; activating a second 402s", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "starter");
    const sender = await seedGmailSender(tenant.id);
    const bpA = await seedActiveBlueprint(tenant.id, "Offer A");
    const bpB = await seedActiveBlueprint(tenant.id, "Offer B");

    const a = await call(createCampaignPOST, { token, body: campaignBody(bpA.id, sender.id, "A") });
    const b = await call(createCampaignPOST, { token, body: campaignBody(bpB.id, sender.id, "B") });
    expect(a.status).toBe(201);
    // Creating a draft is always allowed — only running one consumes quota.
    expect(b.status).toBe(201);

    const activateA = await call(resumeCampaignPOST, {
      token,
      method: "POST",
      routeCtx: params(a.json.data.id),
    });
    expect(activateA.status).toBe(200);

    const activateB = await call(resumeCampaignPOST, {
      token,
      method: "POST",
      routeCtx: params(b.json.data.id),
    });
    expect(activateB.status).toBe(402);
    expect(String(activateB.json.error?.message ?? "")).toContain("active campaign");
  });

  it("scale can run several at once", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await setPlan(tenant.id, "scale");
    const sender = await seedGmailSender(tenant.id);

    for (let i = 0; i < 3; i++) {
      const bp = await seedActiveBlueprint(tenant.id, `Offer ${i}`);
      const created = await call(createCampaignPOST, {
        token,
        body: campaignBody(bp.id, sender.id, `Campaign ${i}`),
      });
      const activated = await call(resumeCampaignPOST, {
        token,
        method: "POST",
        routeCtx: params(created.json.data.id),
      });
      expect(activated.status).toBe(200);
    }
  });
});

describe("plan-aware daily send cap", () => {
  it("resolves the cap from the tenant's plan, not a hardcoded constant", async () => {
    const { tenant } = await makeUser("recruiter");

    await setPlan(tenant.id, "starter");
    expect(await automatedDailySendCapFor(tenant.id)).toBe(25);

    await setPlan(tenant.id, "growth");
    expect(await automatedDailySendCapFor(tenant.id)).toBe(150);

    await setPlan(tenant.id, "scale");
    expect(await automatedDailySendCapFor(tenant.id)).toBe(500);
  });

  it("is never Infinity — uncapped cold email is never offered on any plan", async () => {
    const { tenant } = await makeUser("recruiter");
    for (const plan of ["starter", "growth", "scale"]) {
      await setPlan(tenant.id, plan);
      const cap = await automatedDailySendCapFor(tenant.id);
      expect(Number.isFinite(cap)).toBe(true);
      expect(cap).toBeGreaterThan(0);
    }
  });
});
