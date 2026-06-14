import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as sessionGET } from "../../src/app/api/auth/session/route";
import { POST as signupPOST } from "../../src/app/api/auth/signup/route";
import { resetDb, seedTenant, seedUser } from "../helpers/seed";
import { call } from "../helpers/http";
import {
  mintToken,
  mintExpired,
  mintWrongSecret,
  makeAlgNone,
} from "../helpers/jwt";
import { adminDb, closePools } from "../../src/server/db/client";
import { tenants, users } from "../../src/server/db/schema";
import { provisionWorkspace } from "../../src/server/services/auth.service";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

const AUTH_ID = "11111111-1111-1111-1111-111111111111";

describe("AUTH — token rejection (fail closed, generic 401)", () => {
  it("AUTH-01: missing token → 401", async () => {
    const res = await call(sessionGET);
    expect(res.status).toBe(401);
    expect(res.json.ok).toBe(false);
  });

  it("AUTH-02: malformed token → 401", async () => {
    const res = await call(sessionGET, { token: "not.a.jwt" });
    expect(res.status).toBe(401);
  });

  it("AUTH-03: wrong signature → 401", async () => {
    const token = await mintWrongSecret(AUTH_ID, "x@y.com");
    const res = await call(sessionGET, { token });
    expect(res.status).toBe(401);
  });

  it("AUTH-04: expired token → 401", async () => {
    const token = await mintExpired(AUTH_ID, "x@y.com");
    const res = await call(sessionGET, { token });
    expect(res.status).toBe(401);
  });

  it("AUTH-07: alg:none token → 401", async () => {
    const token = makeAlgNone(AUTH_ID, "x@y.com");
    const res = await call(sessionGET, { token });
    expect(res.status).toBe(401);
  });

  it("AUTH-05: valid signature but no provisioned user → 401", async () => {
    const token = await mintToken(AUTH_ID, { email: "ghost@y.com" });
    const res = await call(sessionGET, { token });
    expect(res.status).toBe(401);
  });

  it("error body never leaks internals", async () => {
    const res = await call(sessionGET, { token: "not.a.jwt" });
    expect(JSON.stringify(res.json)).not.toMatch(/secret|stack|jose|postgres/i);
  });
});

describe("AUTH — session resolution from DB truth", () => {
  it("happy path: provisioned user → 200 with DB role/tenant", async () => {
    const tenant = await seedTenant("Acme");
    await seedUser(tenant.id, {
      authUserId: AUTH_ID,
      role: "viewer",
      email: "real@acme.com",
    });
    const token = await mintToken(AUTH_ID, { email: "real@acme.com" });
    const res = await call(sessionGET, { token });
    expect(res.status).toBe(200);
    expect(res.json.data.tenantId).toBe(tenant.id);
    // AUTH-08: role comes from DB (viewer), not from any token claim
    expect(res.json.data.role).toBe("viewer");
  });

  it("AUTH-06: suspended tenant → 403", async () => {
    const tenant = await seedTenant("Suspended Co");
    await seedUser(tenant.id, { authUserId: AUTH_ID, email: "a@s.com" });
    await adminDb()
      .update(tenants)
      .set({ status: "suspended" })
      .where(eq(tenants.id, tenant.id));
    const token = await mintToken(AUTH_ID, { email: "a@s.com" });
    const res = await call(sessionGET, { token });
    expect(res.status).toBe(403);
  });

  it("RBAC-04: removed member's token stops working → 403", async () => {
    const tenant = await seedTenant("Acme");
    const user = await seedUser(tenant.id, {
      authUserId: AUTH_ID,
      email: "gone@acme.com",
    });
    await adminDb()
      .update(users)
      .set({ status: "removed" })
      .where(eq(users.id, user.id));
    const token = await mintToken(AUTH_ID, { email: "gone@acme.com" });
    const res = await call(sessionGET, { token });
    expect(res.status).toBe(403);
  });
});

describe("AUTH — signup / provisioning", () => {
  it("creates tenant + admin user → 201, then session works", async () => {
    const token = await mintToken(AUTH_ID, { email: "founder@acme.com" });
    const signup = await call(signupPOST, {
      token,
      body: { workspaceName: "Acme Staffing" },
    });
    expect(signup.status).toBe(201);
    expect(signup.json.data.role).toBe("admin");

    const session = await call(sessionGET, { token });
    expect(session.status).toBe(200);
    expect(session.json.data.tenantId).toBe(signup.json.data.tenantId);
    expect(session.json.data.role).toBe("admin");
  });

  it("AUTH-11: repeat signup is idempotent → 200, same tenant", async () => {
    const token = await mintToken(AUTH_ID, { email: "founder@acme.com" });
    const first = await call(signupPOST, {
      token,
      body: { workspaceName: "Acme" },
    });
    const second = await call(signupPOST, {
      token,
      body: { workspaceName: "Acme Again" },
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.data.tenantId).toBe(first.json.data.tenantId);
  });

  it("AUTH-11: concurrent signup creates exactly one tenant", async () => {
    const input = {
      authUserId: AUTH_ID,
      email: "race@acme.com",
      workspaceName: "Race Co",
    };
    const [a, b] = await Promise.all([
      provisionWorkspace(input),
      provisionWorkspace(input),
    ]);
    expect(a.tenantId).toBe(b.tenantId);
    const rows = await adminDb()
      .select()
      .from(users)
      .where(eq(users.authUserId, AUTH_ID));
    expect(rows.length).toBe(1);
  });

  it("signup without email claim → 400", async () => {
    const token = await mintToken(AUTH_ID); // no email
    const res = await call(signupPOST, {
      token,
      body: { workspaceName: "Acme" },
    });
    expect(res.status).toBe(400);
  });

  it("VAL: signup with too-short workspace name → 422", async () => {
    const token = await mintToken(AUTH_ID, { email: "f@a.com" });
    const res = await call(signupPOST, { token, body: { workspaceName: "A" } });
    expect(res.status).toBe(422);
  });

  it("signup without token → 401", async () => {
    const res = await call(signupPOST, { body: { workspaceName: "Acme" } });
    expect(res.status).toBe(401);
  });
});
