import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as auditGET } from "../../src/app/api/audit/route";
import { POST as searchPOST } from "../../src/app/api/search/route";
import { resetDb, seedCandidate } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { tenants } from "../../src/server/db/schema";
import { MockEmbedder } from "../../src/server/adapters/mock.embedder";

const embedder = new MockEmbedder();
const setPlan = (id: string, plan: string) =>
  adminDb().update(tenants).set({ plan }).where(eq(tenants.id, id));

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("Audit log is gated to the Scale plan", () => {
  it("starter admin → 402 (locked)", async () => {
    const { token } = await makeUser("admin"); // default starter
    const res = await call(auditGET, { token });
    expect(res.status).toBe(402);
  });

  it("scale admin → 200 (unlocked)", async () => {
    const { tenant, token } = await makeUser("admin");
    await setPlan(tenant.id, "scale");
    const res = await call(auditGET, { token });
    expect(res.status).toBe(200);
  });
});

describe("Advanced search filters are gated to Growth+", () => {
  it("starter: structured filters are IGNORED (lock), semantic still works", async () => {
    const { tenant, token } = await makeUser("viewer"); // starter
    await seedCandidate(tenant.id, {
      location: "Austin, TX",
      summary: "nurse",
      embedding: await embedder.embed("nurse"),
    });
    await seedCandidate(tenant.id, {
      location: "Remote",
      summary: "nurse",
      embedding: await embedder.embed("nurse"),
    });
    const res = await call(searchPOST, {
      token,
      body: { q: "nurse", location: "Austin" },
    });
    expect(res.status).toBe(200);
    // filter ignored on starter → both candidates returned
    expect(res.json.data.count).toBe(2);
    expect(res.json.data.advancedFilters).toBe(false);
  });

  it("growth: filters apply", async () => {
    const { tenant, token } = await makeUser("viewer");
    await setPlan(tenant.id, "growth");
    const austin = await seedCandidate(tenant.id, {
      location: "Austin, TX",
      summary: "nurse",
      embedding: await embedder.embed("nurse"),
    });
    await seedCandidate(tenant.id, {
      location: "Remote",
      summary: "nurse",
      embedding: await embedder.embed("nurse"),
    });
    const res = await call(searchPOST, {
      token,
      body: { q: "nurse", location: "Austin" },
    });
    expect(res.json.data.advancedFilters).toBe(true);
    expect(res.json.data.results.map((r: { id: string }) => r.id)).toEqual([austin.id]);
  });
});
