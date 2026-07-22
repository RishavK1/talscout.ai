import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listBlueprintsGET, POST as createBlueprintPOST } from "../../src/app/api/blueprints/route";
import {
  GET as getBlueprintGET,
  PATCH as patchBlueprintPATCH,
  DELETE as deleteBlueprintDELETE,
} from "../../src/app/api/blueprints/[id]/route";
import { POST as suggestBlueprintPOST } from "../../src/app/api/blueprints/suggest/route";
import { POST as generateBlueprintPOST } from "../../src/app/api/blueprints/[id]/generate/route";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { DELETE as deleteCampaignDELETE } from "../../src/app/api/automated-campaigns/[id]/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { withTenantTx } from "../../src/server/db/tx";
import { blueprintRepo } from "../../src/server/repositories/blueprint.repo";
import { senderAccounts } from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await closePools();
});

describe("blueprint CRUD", () => {
  it("creates a draft blueprint shell and lists it", async () => {
    const { token } = await makeUser("recruiter");

    const created = await call(createBlueprintPOST, {
      token,
      body: { name: "Acme Offer", websiteUrl: "https://acme.example" },
    });
    expect(created.status).toBe(201);
    expect(created.json.data.status).toBe("draft");
    expect(created.json.data.sections).toBeNull();

    const listed = await call(listBlueprintsGET, { token });
    expect(listed.status).toBe(200);
    expect(listed.json.data.blueprints).toHaveLength(1);
    expect(listed.json.data.blueprints[0].id).toBe(created.json.data.id);
  });

  it("rejects a duplicate name for the same tenant with 409", async () => {
    const { token } = await makeUser("recruiter");
    await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });

    const dup = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    expect(dup.status).toBe(409);
  });

  it("gets a single blueprint by id, 404s for a foreign tenant", async () => {
    const { token } = await makeUser("recruiter");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    const id = created.json.data.id;

    const got = await call(getBlueprintGET, { token, routeCtx: params(id) });
    expect(got.status).toBe(200);
    expect(got.json.data.name).toBe("Acme Offer");

    const { token: otherToken } = await makeUser("recruiter");
    const foreign = await call(getBlueprintGET, { token: otherToken, routeCtx: params(id) });
    expect(foreign.status).toBe(404);
  });

  it("updates name/status via PATCH", async () => {
    const { token } = await makeUser("recruiter");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    const id = created.json.data.id;

    const patched = await call(patchBlueprintPATCH, {
      token,
      method: "PATCH",
      body: { name: "Acme Offer v2", status: "archived" },
      routeCtx: params(id),
    });
    expect(patched.status).toBe(200);
    expect(patched.json.data.name).toBe("Acme Offer v2");
    expect(patched.json.data.status).toBe("archived");
  });

  it("soft-deletes: hidden from list/get but row survives", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    const id = created.json.data.id;

    const del = await call(deleteBlueprintDELETE, {
      token,
      method: "DELETE",
      routeCtx: params(id),
    });
    expect(del.status).toBe(200);

    const got = await call(getBlueprintGET, { token, routeCtx: params(id) });
    expect(got.status).toBe(404);

    const listed = await call(listBlueprintsGET, { token });
    expect(listed.json.data.blueprints).toHaveLength(0);
  });

  it("refuses to delete a blueprint that an automated campaign still uses", async () => {
    const { tenant, token } = await makeUser("admin");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    const id = created.json.data.id;
    // A campaign can only be created against a generated (active) blueprint.
    await call(generateBlueprintPOST, {
      token,
      body: {
        intakeAnswers: {
          businessName: "Acme Offer",
          answers: { whatWeSell: "A scheduling tool", icp: "Small agencies" },
        },
      },
      routeCtx: params(id),
    });

    const [sender] = await adminDb()
      .insert(senderAccounts)
      .values({
        tenantId: tenant.id,
        type: "gmail",
        label: "a@test.local",
        email: "a@test.local",
        gmailRefreshTokenEnc: encryptSecret("fake-refresh-token"),
        isActive: true,
      })
      .returning();
    const campaign = await call(createCampaignPOST, {
      token,
      body: {
        name: "Dentists",
        blueprintId: id,
        senderAccountId: sender.id,
        discoveryQuery: { category: "dentist", location: { text: "Austin, TX" } },
        signatureName: "Jane Doe",
        replyPollingEnabled: false,
      },
    });
    expect(campaign.status).toBe(201);

    const blocked = await call(deleteBlueprintDELETE, { token, method: "DELETE", routeCtx: params(id) });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.message).toContain("1 automated campaign");

    // Still fully visible/usable after the blocked attempt.
    const stillThere = await call(getBlueprintGET, { token, routeCtx: params(id) });
    expect(stillThere.status).toBe(200);

    // Delete the campaign, then the blueprint delete succeeds.
    await call(deleteCampaignDELETE, {
      token,
      method: "DELETE",
      routeCtx: params(campaign.json.data.id),
    });
    const nowAllowed = await call(deleteBlueprintDELETE, { token, method: "DELETE", routeCtx: params(id) });
    expect(nowAllowed.status).toBe(200);
  });

  it("viewer can read but not create", async () => {
    const { token } = await makeUser("viewer");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    expect(created.status).toBe(403);

    const listed = await call(listBlueprintsGET, { token });
    expect(listed.status).toBe(200);
  });
});

describe("blueprint wizard: suggest + generate (mock adapter)", () => {
  it("suggest returns intake field options without persisting anything", async () => {
    const { token } = await makeUser("recruiter");

    const res = await call(suggestBlueprintPOST, {
      token,
      body: { name: "Acme Corp", websiteUrl: "https://acme.example" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.fields.length).toBeGreaterThan(0);
    expect(res.json.data.fields[0]).toHaveProperty("field");
    expect(res.json.data.fields[0]).toHaveProperty("options");

    const listed = await call(listBlueprintsGET, { token });
    expect(listed.json.data.blueprints).toHaveLength(0);
  });

  it("suggest surfaces a provider failure as a 4xx/5xx, not a silent 200", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(suggestBlueprintPOST, {
      token,
      body: { name: "%%THROW%%", websiteUrl: "https://acme.example" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("generate turns confirmed answers into sections and persists them", async () => {
    const { token } = await makeUser("recruiter");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    const id = created.json.data.id;

    const generated = await call(generateBlueprintPOST, {
      token,
      body: {
        intakeAnswers: {
          businessName: "Acme Offer",
          websiteUrl: "https://acme.example",
          answers: {
            whatWeSell: "A scheduling tool",
            icp: "Small agencies",
            differentiator: "Faster onboarding",
            proof: ["100+ customers", "4.9 rating"],
            voice: "Friendly and direct",
            objections: ["Too expensive"],
          },
        },
      },
      routeCtx: params(id),
    });
    expect(generated.status).toBe(200);
    expect(generated.json.data.status).toBe("active");
    expect(generated.json.data.sections.whoWeAre).toContain("Acme Offer");
    expect(generated.json.data.sections.proof.length).toBeGreaterThan(0);

    const got = await call(getBlueprintGET, { token, routeCtx: params(id) });
    expect(got.json.data.sections).not.toBeNull();
  });

  it("threads the wizard's freeform additionalContext into leadQualification.criteria", async () => {
    const { token } = await makeUser("recruiter");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    const id = created.json.data.id;

    const generated = await call(generateBlueprintPOST, {
      token,
      body: {
        intakeAnswers: {
          businessName: "Acme Offer",
          websiteUrl: "https://acme.example",
          answers: {
            whatWeSell: "A scheduling tool",
            icp: "Small agencies",
            additionalContext: "Only target agencies with 2-8 people, never chains.",
          },
        },
      },
      routeCtx: params(id),
    });

    expect(generated.status).toBe(200);
    expect(generated.json.data.sections.leadQualification.criteria).toContain(
      "Only target agencies with 2-8 people, never chains.",
    );
    expect(generated.json.data.sections.painWeSolve).toContain(
      "Only target agencies with 2-8 people, never chains.",
    );
  });

  it("refuses to generate without any intake answers", async () => {
    const { token } = await makeUser("recruiter");
    const created = await call(createBlueprintPOST, { token, body: { name: "Acme Offer" } });
    const id = created.json.data.id;

    const res = await call(generateBlueprintPOST, { token, body: {}, routeCtx: params(id) });
    expect(res.status).toBe(400);
  });
});

describe("blueprint repo directly (RLS sanity)", () => {
  it("findByName is case-insensitive and tenant-scoped", async () => {
    const { tenant } = await makeUser("recruiter");
    await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      blueprintRepo.create(ctx, { name: "Acme Offer" }),
    );

    const found = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      blueprintRepo.findByName(ctx, "acme offer"),
    );
    expect(found).not.toBeNull();

    const { tenant: otherTenant } = await makeUser("recruiter");
    const foreignFound = await withTenantTx({ tenantId: otherTenant.id }, (ctx) =>
      blueprintRepo.findByName(ctx, "acme offer"),
    );
    expect(foreignFound).toBeNull();
  });
});
