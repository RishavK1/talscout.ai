import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withAuth } from "../../src/server/http/with-api";
import { resetDb, seedTenant, seedUser } from "../helpers/seed";
import { call } from "../helpers/http";
import { mintToken } from "../helpers/jwt";
import { adminDb, closePools } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";
import type { Role } from "../../src/server/auth/rbac";

// Minimal protected handlers, one per required role.
const ok = async () => ({ data: { ok: true } });
const adminOnly = withAuth(ok, { role: "admin" });
const recruiterOnly = withAuth(ok, { role: "recruiter" });
const viewerOnly = withAuth(ok, { role: "viewer" });

let tokenSeq = 0;
async function userWithRole(role: Role) {
  const tenant = await seedTenant(`T-${role}`);
  const authUserId = crypto.randomUUID();
  const user = await seedUser(tenant.id, {
    role,
    authUserId,
    email: `${role}-${tokenSeq++}@x.com`,
  });
  const token = await mintToken(authUserId, { email: user.email });
  return { tenant, user, token };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("RBAC-01: viewer is blocked from higher actions", () => {
  it("viewer → admin-only → 403", async () => {
    const { token } = await userWithRole("viewer");
    expect((await call(adminOnly, { token })).status).toBe(403);
  });
  it("viewer → recruiter-only → 403", async () => {
    const { token } = await userWithRole("viewer");
    expect((await call(recruiterOnly, { token })).status).toBe(403);
  });
  it("viewer → viewer-only → 200", async () => {
    const { token } = await userWithRole("viewer");
    expect((await call(viewerOnly, { token })).status).toBe(200);
  });
});

describe("RBAC-02: recruiter cannot do admin actions", () => {
  it("recruiter → admin-only → 403", async () => {
    const { token } = await userWithRole("recruiter");
    expect((await call(adminOnly, { token })).status).toBe(403);
  });
  it("recruiter → recruiter-only → 200", async () => {
    const { token } = await userWithRole("recruiter");
    expect((await call(recruiterOnly, { token })).status).toBe(200);
  });
});

describe("admin can do everything", () => {
  it("admin → admin/recruiter/viewer → all 200", async () => {
    const { token } = await userWithRole("admin");
    expect((await call(adminOnly, { token })).status).toBe(200);
    expect((await call(recruiterOnly, { token })).status).toBe(200);
    expect((await call(viewerOnly, { token })).status).toBe(200);
  });
});

describe("RBAC-05: role changes take effect immediately (read from DB each request)", () => {
  it("promoting recruiter → admin unlocks admin routes with the same token", async () => {
    const { user, token } = await userWithRole("recruiter");
    expect((await call(adminOnly, { token })).status).toBe(403);

    await adminDb()
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, user.id));

    expect((await call(adminOnly, { token })).status).toBe(200);
  });
});
