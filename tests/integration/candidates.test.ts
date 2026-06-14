import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  GET as listGET,
  POST as createPOST,
} from "../../src/app/api/candidates/route";
import {
  GET as getGET,
  PATCH as patchPATCH,
  DELETE as delDELETE,
} from "../../src/app/api/candidates/[id]/route";
import { resetDb, seedTenant, seedCandidate } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { auditLogs } from "../../src/server/db/schema";

const BASE = "http://test.local/api/candidates";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("POST /candidates — create + RBAC + validation", () => {
  it("recruiter creates a candidate → 201, server-set status & tenant", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const res = await call(createPOST, {
      token,
      body: { fullName: "Jane Doe", currentTitle: "Engineer" },
    });
    expect(res.status).toBe(201);
    expect(res.json.data.tenantId).toBe(tenant.id);
    expect(res.json.data.status).toBe("ready");
  });

  it("RBAC-01: viewer cannot create → 403", async () => {
    const { token } = await makeUser("viewer");
    const res = await call(createPOST, { token, body: { fullName: "X" } });
    expect(res.status).toBe(403);
  });

  it("VAL-06: negative yearsExperience → 422", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(createPOST, {
      token,
      body: { fullName: "X", yearsExperience: -5 },
    });
    expect(res.status).toBe(422);
  });

  it("VAL-03: mass-assignment of protected fields is ignored", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const res = await call(createPOST, {
      token,
      body: {
        fullName: "Mallory",
        tenantId: "00000000-0000-0000-0000-000000000999",
        id: "fixed-id-123",
        status: "error",
        role: "admin",
        createdBy: "someone",
      },
    });
    expect(res.status).toBe(201);
    expect(res.json.data.tenantId).toBe(tenant.id); // not the injected one
    expect(res.json.data.status).toBe("ready"); // not "error"
    expect(res.json.data.id).not.toBe("fixed-id-123"); // server-generated
  });

  it("VAL-10: SQL-injection string is stored as literal data", async () => {
    const { token } = await makeUser("recruiter");
    const evil = "'; DROP TABLE candidates; --";
    const first = await call(createPOST, { token, body: { fullName: evil } });
    expect(first.status).toBe(201);
    expect(first.json.data.fullName).toBe(evil);
    // table still exists: a second insert + list succeed
    const second = await call(createPOST, { token, body: { fullName: "OK" } });
    expect(second.status).toBe(201);
    const list = await call(listGET, { token, url: BASE });
    expect(list.json.data.total).toBe(2);
  });

  it("VAL-11: XSS payload stored and returned verbatim (escaped on render)", async () => {
    const { token } = await makeUser("recruiter");
    const xss = "<script>alert(1)</script>";
    const res = await call(createPOST, { token, body: { fullName: xss } });
    expect(res.status).toBe(201);
    expect(res.json.data.fullName).toBe(xss);
  });

  it("VAL-08: non-JSON content type → 400", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(createPOST, {
      token,
      body: { fullName: "X" },
      contentType: "text/plain",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /candidates — list, pagination, tenant scope", () => {
  it("TEN-03: list returns only the caller tenant's candidates + total", async () => {
    const { tenant, token } = await makeUser("viewer");
    await seedCandidate(tenant.id, { fullName: "Mine 1" });
    await seedCandidate(tenant.id, { fullName: "Mine 2" });
    const other = await seedTenant("Other");
    await seedCandidate(other.id, { fullName: "Theirs" });

    const res = await call(listGET, { token, url: BASE });
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(2);
    expect(
      res.json.data.candidates.every(
        (c: { tenantId: string }) => c.tenantId === tenant.id,
      ),
    ).toBe(true);
  });

  it("PAGE: limit caps page size but total reflects all", async () => {
    const { tenant, token } = await makeUser("viewer");
    for (let i = 0; i < 3; i++) await seedCandidate(tenant.id, { fullName: `C${i}` });

    const limited = await call(listGET, { token, url: `${BASE}?limit=2` });
    expect(limited.json.data.candidates.length).toBe(2);
    expect(limited.json.data.total).toBe(3);

    // PAGE-02: absurd limit clamps (no error), returns all 3
    const huge = await call(listGET, { token, url: `${BASE}?limit=99999` });
    expect(huge.status).toBe(200);
    expect(huge.json.data.candidates.length).toBe(3);

    // PAGE-03: garbage limit falls back to default (no error)
    const garbage = await call(listGET, { token, url: `${BASE}?limit=abc` });
    expect(garbage.status).toBe(200);
    expect(garbage.json.data.candidates.length).toBe(3);
  });
});

describe("GET /candidates/:id — read + IDOR", () => {
  it("reads own candidate → 200", async () => {
    const { tenant, token } = await makeUser("viewer");
    const c = await seedCandidate(tenant.id, { fullName: "Mine" });
    const res = await call(getGET, { token, routeCtx: params(c.id) });
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(c.id);
  });

  it("TEN-01: cross-tenant read → 404", async () => {
    const { token } = await makeUser("viewer");
    const other = await seedTenant("Other");
    const theirs = await seedCandidate(other.id, { fullName: "Theirs" });
    const res = await call(getGET, { token, routeCtx: params(theirs.id) });
    expect(res.status).toBe(404);
  });

  it("invalid uuid → 404 (not 500)", async () => {
    const { token } = await makeUser("viewer");
    const res = await call(getGET, { token, routeCtx: params("not-a-uuid") });
    expect(res.status).toBe(404);
  });

  it("nonexistent uuid → 404", async () => {
    const { token } = await makeUser("viewer");
    const res = await call(getGET, {
      token,
      routeCtx: params("00000000-0000-0000-0000-0000000000aa"),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /candidates/:id — update + RBAC + IDOR", () => {
  it("recruiter updates own → 200", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const c = await seedCandidate(tenant.id, { fullName: "Old" });
    const res = await call(patchPATCH, {
      token,
      method: "PATCH",
      body: { fullName: "New" },
      routeCtx: params(c.id),
    });
    expect(res.status).toBe(200);
    expect(res.json.data.fullName).toBe("New");
  });

  it("RBAC-01: viewer cannot update → 403", async () => {
    const { tenant, token } = await makeUser("viewer");
    const c = await seedCandidate(tenant.id);
    const res = await call(patchPATCH, {
      token,
      method: "PATCH",
      body: { fullName: "New" },
      routeCtx: params(c.id),
    });
    expect(res.status).toBe(403);
  });

  it("TEN-02: cross-tenant update → 404 (no mutation)", async () => {
    const { token } = await makeUser("recruiter");
    const other = await seedTenant("Other");
    const theirs = await seedCandidate(other.id, { fullName: "Theirs" });
    const res = await call(patchPATCH, {
      token,
      method: "PATCH",
      body: { fullName: "HACKED" },
      routeCtx: params(theirs.id),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /candidates/:id — admin only + IDOR", () => {
  it("admin deletes own → 200, then gone", async () => {
    const { tenant, token } = await makeUser("admin");
    const c = await seedCandidate(tenant.id);
    const del = await call(delDELETE, {
      token,
      method: "DELETE",
      routeCtx: params(c.id),
    });
    expect(del.status).toBe(200);
    const after = await call(getGET, { token, routeCtx: params(c.id) });
    expect(after.status).toBe(404);
  });

  it("RBAC-02: recruiter cannot delete → 403", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const c = await seedCandidate(tenant.id);
    const res = await call(delDELETE, {
      token,
      method: "DELETE",
      routeCtx: params(c.id),
    });
    expect(res.status).toBe(403);
  });

  it("TEN-02: admin cannot delete another tenant's candidate → 404", async () => {
    const { token } = await makeUser("admin");
    const other = await seedTenant("Other");
    const theirs = await seedCandidate(other.id);
    const res = await call(delDELETE, {
      token,
      method: "DELETE",
      routeCtx: params(theirs.id),
    });
    expect(res.status).toBe(404);
  });
});

describe("DATA-07: sensitive actions are audited", () => {
  it("creating a candidate writes an audit row", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await call(createPOST, { token, body: { fullName: "Audited" } });
    const rows = await adminDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenant.id),
          eq(auditLogs.action, "candidate.create"),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0].targetType).toBe("candidate");
  });
});
