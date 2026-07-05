import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DELETE as workspaceDELETE } from "../../src/app/api/workspace/route";
import { POST as uploadsPOST } from "../../src/app/api/uploads/route";
import { POST as completePOST } from "../../src/app/api/uploads/complete/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import {
  tenants,
  users,
  candidates,
  subscriptions,
  resumeFiles,
} from "../../src/server/db/schema";
import { getServices, resetServices } from "../../src/server/container";

beforeEach(async () => {
  await resetDb();
  resetServices();
});
afterAll(async () => {
  await closePools();
});

describe("DELETE /api/workspace", () => {
  it("RBAC: non-admin cannot delete the workspace → 403", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(workspaceDELETE, {
      token,
      method: "DELETE",
      body: { confirm: "DELETE" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a missing/incorrect confirmation string → 422", async () => {
    const { token } = await makeUser("admin");
    const wrong = await call(workspaceDELETE, {
      token,
      method: "DELETE",
      body: { confirm: "delete" },
    });
    expect(wrong.status).toBe(422);

    const missing = await call(workspaceDELETE, { token, method: "DELETE", body: {} });
    expect(missing.status).toBe(422);
  });

  it("admin deletes the workspace → tenant + all cascaded rows are gone", async () => {
    const { tenant, token } = await makeUser("admin");

    // Give the tenant a résumé file with real bytes in storage.
    const upload = await call(uploadsPOST, {
      token,
      body: { filename: "cv.pdf", contentType: "application/pdf", sizeBytes: 20 },
    });
    const { candidateId, fileKey } = upload.json.data;
    await getServices().storage.putObject(fileKey, Buffer.from("%PDF-1.4\nx"), "application/pdf");
    await call(completePOST, { token, body: { candidateId, fileKey } });

    expect(await getServices().storage.exists(fileKey)).toBe(true);

    const res = await call(workspaceDELETE, {
      token,
      method: "DELETE",
      body: { confirm: "DELETE" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.deleted).toBe(true);

    const [tenantRow] = await adminDb().select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(tenantRow).toBeUndefined();

    const remainingUsers = await adminDb().select().from(users).where(eq(users.tenantId, tenant.id));
    expect(remainingUsers).toHaveLength(0);

    const remainingCandidates = await adminDb()
      .select()
      .from(candidates)
      .where(eq(candidates.tenantId, tenant.id));
    expect(remainingCandidates).toHaveLength(0);

    const remainingFiles = await adminDb()
      .select()
      .from(resumeFiles)
      .where(eq(resumeFiles.tenantId, tenant.id));
    expect(remainingFiles).toHaveLength(0);

    const remainingSubs = await adminDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenant.id));
    expect(remainingSubs).toHaveLength(0);

    // Storage object was purged too (best-effort cleanup).
    expect(await getServices().storage.exists(fileKey)).toBe(false);
  });

  it("never touches another tenant's data", async () => {
    const { token: victimToken, tenant: victim } = await makeUser("admin");
    const { token: attackerToken } = await makeUser("admin");

    const res = await call(workspaceDELETE, {
      token: attackerToken,
      method: "DELETE",
      body: { confirm: "DELETE" },
    });
    expect(res.status).toBe(200);

    // The victim tenant (a different admin's workspace) must be untouched.
    const [victimRow] = await adminDb().select().from(tenants).where(eq(tenants.id, victim.id));
    expect(victimRow).toBeDefined();

    // Sanity: the victim's own token still resolves a session.
    const stillWorks = await call(workspaceDELETE, {
      token: victimToken,
      method: "DELETE",
      body: { confirm: "delete" }, // wrong confirm on purpose — just checking auth still resolves
    });
    expect(stillWorks.status).toBe(422); // not 401/403 — session still valid
  });
});
