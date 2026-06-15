import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { POST as searchPOST } from "../../src/app/api/search/route";
import { resetDb, seedTenant, seedCandidate } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { tenants } from "../../src/server/db/schema";
import { eq } from "drizzle-orm";
import { MockEmbedder } from "../../src/server/adapters/mock.embedder";

// Advanced (structured) filters require a Growth+ plan.
const enableFilters = (tenantId: string) =>
  adminDb().update(tenants).set({ plan: "scale" }).where(eq(tenants.id, tenantId));

const embedder = new MockEmbedder();
const embed = (t: string) => embedder.embed(t);

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("semantic ranking", () => {
  it("SRCH-08: closest embedding ranks first, deterministically", async () => {
    const { tenant, token } = await makeUser("viewer");
    const a = await seedCandidate(tenant.id, {
      fullName: "Ada",
      summary: "React engineer with Node",
      embedding: await embed("React engineer with Node"),
    });
    await seedCandidate(tenant.id, {
      fullName: "Nina",
      summary: "Pediatric nurse",
      embedding: await embed("Pediatric nurse"),
    });

    const res = await call(searchPOST, {
      token,
      body: { q: "React engineer with Node" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.results[0].id).toBe(a.id);
    expect(res.json.data.results[0].score).toBeGreaterThan(0.99);
    // never returns the raw embedding
    expect(res.json.data.results[0].embedding).toBeUndefined();

    const again = await call(searchPOST, {
      token,
      body: { q: "React engineer with Node" },
    });
    expect(again.json.data.results.map((r: { id: string }) => r.id)).toEqual(
      res.json.data.results.map((r: { id: string }) => r.id),
    );
  });
});

describe("SRCH — edge cases", () => {
  it("SRCH-03: tenant with zero candidates → empty, 200", async () => {
    const { token } = await makeUser("viewer");
    const res = await call(searchPOST, { token, body: { q: "anything" } });
    expect(res.status).toBe(200);
    expect(res.json.data.count).toBe(0);
  });

  it("SRCH-04: processing candidates are excluded from results", async () => {
    const { tenant, token } = await makeUser("viewer");
    await seedCandidate(tenant.id, {
      status: "processing",
      summary: "React engineer",
      embedding: await embed("React engineer"),
    });
    const ready = await seedCandidate(tenant.id, {
      status: "ready",
      summary: "React engineer",
      embedding: await embed("React engineer"),
    });
    const res = await call(searchPOST, { token, body: { q: "React engineer" } });
    expect(res.json.data.results.map((r: { id: string }) => r.id)).toEqual([ready.id]);
  });

  it("SRCH-01: empty query → recent ready candidates (no error)", async () => {
    const { tenant, token } = await makeUser("viewer");
    await seedCandidate(tenant.id, { embedding: await embed("x") });
    const res = await call(searchPOST, { token, body: {} });
    expect(res.status).toBe(200);
    expect(res.json.data.count).toBe(1);
    expect(res.json.data.results[0].score).toBeNull();
  });

  it("SRCH-07: injection string in query is safe (no error, table intact)", async () => {
    const { tenant, token } = await makeUser("viewer");
    await seedCandidate(tenant.id, { embedding: await embed("safe") });
    const res = await call(searchPOST, {
      token,
      body: { q: "'; DROP TABLE candidates; --" },
    });
    expect(res.status).toBe(200);
    // table still works
    const again = await call(searchPOST, { token, body: { q: "safe" } });
    expect(again.status).toBe(200);
  });

  it("TEN-04: search never returns another tenant's candidates", async () => {
    const { token } = await makeUser("viewer");
    const other = await seedTenant("Other");
    await seedCandidate(other.id, {
      summary: "React engineer with Node",
      embedding: await embed("React engineer with Node"),
    });
    const res = await call(searchPOST, {
      token,
      body: { q: "React engineer with Node" },
    });
    expect(res.json.data.count).toBe(0);
  });

  it("SRCH-09: limit caps results", async () => {
    const { tenant, token } = await makeUser("viewer");
    for (let i = 0; i < 3; i++) {
      await seedCandidate(tenant.id, {
        summary: `dev ${i}`,
        embedding: await embed(`dev ${i}`),
      });
    }
    const res = await call(searchPOST, { token, body: { q: "dev", limit: 2 } });
    expect(res.json.data.results.length).toBe(2);
  });
});

describe("hybrid filters", () => {
  it("location filter narrows results", async () => {
    const { tenant, token } = await makeUser("viewer");
    await enableFilters(tenant.id);
    const austin = await seedCandidate(tenant.id, {
      location: "Austin, TX",
      summary: "nurse",
      embedding: await embed("nurse"),
    });
    await seedCandidate(tenant.id, {
      location: "Remote",
      summary: "nurse",
      embedding: await embed("nurse"),
    });
    const res = await call(searchPOST, {
      token,
      body: { q: "nurse", location: "Austin" },
    });
    expect(res.json.data.results.map((r: { id: string }) => r.id)).toEqual([austin.id]);
  });

  it("minExperience filter narrows results", async () => {
    const { tenant, token } = await makeUser("viewer");
    await enableFilters(tenant.id);
    const senior = await seedCandidate(tenant.id, {
      yearsExperience: 8,
      summary: "engineer",
      embedding: await embed("engineer"),
    });
    await seedCandidate(tenant.id, {
      yearsExperience: 1,
      summary: "engineer",
      embedding: await embed("engineer"),
    });
    const res = await call(searchPOST, {
      token,
      body: { q: "engineer", minExperience: 3 },
    });
    expect(res.json.data.results.map((r: { id: string }) => r.id)).toEqual([senior.id]);
  });

  it("RBAC: viewer can search → 200", async () => {
    const { token } = await makeUser("viewer");
    const res = await call(searchPOST, { token, body: { q: "x" } });
    expect(res.status).toBe(200);
  });
});
