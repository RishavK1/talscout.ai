import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  GET as listCampaignsGET,
  POST as createCampaignPOST,
} from "../../src/app/api/automated-campaigns/route";
import {
  GET as getCampaignGET,
  PATCH as patchCampaignPATCH,
  DELETE as deleteCampaignDELETE,
} from "../../src/app/api/automated-campaigns/[id]/route";
import { POST as pauseCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/pause/route";
import { POST as resumeCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/resume/route";
import { GET as listLeadsGET } from "../../src/app/api/automated-campaigns/[id]/leads/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { blueprints, senderAccounts } from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";
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
    .values({
      tenantId,
      name,
      status: "active",
      sections: MINIMAL_SECTIONS,
    })
    .returning();
  return row;
}

async function seedDraftBlueprint(tenantId: string, name = "Draft Offer") {
  const [row] = await adminDb()
    .insert(blueprints)
    .values({ tenantId, name, status: "draft" })
    .returning();
  return row;
}

async function seedGmailSender(
  tenantId: string,
  email: string,
  hasReadScope: boolean,
) {
  const [row] = await adminDb()
    .insert(senderAccounts)
    .values({
      tenantId,
      type: "gmail",
      label: email,
      email,
      gmailRefreshTokenEnc: encryptSecret("fake-refresh-token"),
      gmailHasReadScope: hasReadScope,
      isActive: true,
    })
    .returning();
  return row;
}

async function seedSmtpSenderRaw(tenantId: string, email: string) {
  const [row] = await adminDb()
    .insert(senderAccounts)
    .values({
      tenantId,
      type: "smtp",
      label: email,
      email,
      smtpHost: "smtp.test.local",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: email,
      smtpPasswordEnc: encryptSecret("pw"),
      isActive: true,
    })
    .returning();
  return row;
}

function baseCampaignBody(blueprintId: string, senderAccountId: string, overrides = {}) {
  return {
    name: "Austin Dentists",
    blueprintId,
    senderAccountId,
    discoveryQuery: { category: "dentist", location: { text: "Austin, TX" } },
    signatureName: "Jane Doe",
    signatureTitle: "Founder",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("automated campaign CRUD", () => {
  it("creates a campaign against an active blueprint + read-scope Gmail sender", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);

    const res = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id),
    });
    expect(res.status).toBe(201);
    expect(res.json.data.status).toBe("draft");
    expect(res.json.data.replyPollingEnabled).toBe(true);

    const listed = await call(listCampaignsGET, { token });
    expect(listed.json.data.campaigns).toHaveLength(1);
  });

  it("persists marketResearch from the wizard's Research step and lets it be updated later", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);

    const res = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id, {
        marketResearch: "Dentists in Austin rarely have modern websites.",
      }),
    });
    expect(res.status).toBe(201);
    expect(res.json.data.marketResearch).toBe("Dentists in Austin rarely have modern websites.");

    const patched = await call(patchCampaignPATCH, {
      token,
      method: "PATCH",
      routeCtx: params(res.json.data.id),
      body: { marketResearch: "Updated research." },
    });
    expect(patched.status).toBe(200);
    expect(patched.json.data.marketResearch).toBe("Updated research.");
  });

  it("rejects creation when the blueprint hasn't been generated (status != active)", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const draftBlueprint = await seedDraftBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);

    const res = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(draftBlueprint.id, sender.id),
    });
    expect(res.status).toBe(400);
  });

  it("rejects reply-polling campaigns on an SMTP sender", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedSmtpSenderRaw(tenant.id, "a@test.local");

    const res = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id, { replyPollingEnabled: true }),
    });
    expect(res.status).toBe(400);
  });

  it("allows a send-only campaign (replyPollingEnabled: false) on an SMTP sender", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedSmtpSenderRaw(tenant.id, "a@test.local");

    const res = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id, { replyPollingEnabled: false }),
    });
    expect(res.status).toBe(201);
    expect(res.json.data.replyPollingEnabled).toBe(false);
  });

  it("rejects reply-polling on a Gmail sender without read scope", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", false);

    const res = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id),
    });
    expect(res.status).toBe(400);
  });

  it("gets, pauses, and resumes a campaign", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);
    const created = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id),
    });
    const id = created.json.data.id;

    const activated = await call(resumeCampaignPOST, { token, method: "POST", routeCtx: params(id) });
    expect(activated.status).toBe(200);
    expect(activated.json.data.status).toBe("active");

    const paused = await call(pauseCampaignPOST, { token, method: "POST", routeCtx: params(id) });
    expect(paused.status).toBe(200);
    expect(paused.json.data.status).toBe("paused");

    const got = await call(getCampaignGET, { token, routeCtx: params(id) });
    expect(got.status).toBe(200);
    expect(got.json.data.status).toBe("paused");
  });

  it("updates campaign fields via PATCH", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);
    const created = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id),
    });
    const id = created.json.data.id;

    const patched = await call(patchCampaignPATCH, {
      token,
      method: "PATCH",
      body: { name: "Austin Dentists v2", maxLeadsPerRun: 10 },
      routeCtx: params(id),
    });
    expect(patched.status).toBe(200);
    expect(patched.json.data.name).toBe("Austin Dentists v2");
    expect(patched.json.data.maxLeadsPerRun).toBe(10);
  });

  it("hard-deletes a campaign, admin-only", async () => {
    const { tenant, token: adminToken } = await makeUser("admin");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);
    const created = await call(createCampaignPOST, {
      token: adminToken,
      body: baseCampaignBody(blueprint.id, sender.id),
    });
    const id = created.json.data.id;

    const { token: recruiterToken } = await makeUser("recruiter", { tenant });
    const forbidden = await call(deleteCampaignDELETE, {
      token: recruiterToken,
      method: "DELETE",
      routeCtx: params(id),
    });
    expect(forbidden.status).toBe(403);

    const deleted = await call(deleteCampaignDELETE, {
      token: adminToken,
      method: "DELETE",
      routeCtx: params(id),
    });
    expect(deleted.status).toBe(200);

    const got = await call(getCampaignGET, { token: adminToken, routeCtx: params(id) });
    expect(got.status).toBe(404);
  });

  it("is tenant-isolated: a foreign tenant cannot see or act on the campaign", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);
    const created = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id),
    });
    const id = created.json.data.id;

    const { token: otherToken } = await makeUser("recruiter");
    const foreignGet = await call(getCampaignGET, { token: otherToken, routeCtx: params(id) });
    expect(foreignGet.status).toBe(404);

    const foreignList = await call(listCampaignsGET, { token: otherToken });
    expect(foreignList.json.data.campaigns).toHaveLength(0);
  });

  it("lists leads for a campaign (empty until a discovery run happens)", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id, "a@test.local", true);
    const created = await call(createCampaignPOST, {
      token,
      body: baseCampaignBody(blueprint.id, sender.id),
    });
    const id = created.json.data.id;

    const leads = await call(listLeadsGET, { token, routeCtx: params(id) });
    expect(leads.status).toBe(200);
    expect(leads.json.data.leads).toHaveLength(0);
  });
});
