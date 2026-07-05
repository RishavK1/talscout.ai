import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { GET as resumeGET } from "../../src/app/api/candidates/[id]/resume/route";
import { POST as uploadsPOST } from "../../src/app/api/uploads/route";
import { POST as completePOST } from "../../src/app/api/uploads/complete/route";
import { POST as createPOST } from "../../src/app/api/candidates/route";
import { resetDb, seedTenant, seedCandidate } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { closePools } from "../../src/server/db/client";
import { getServices, resetServices } from "../../src/server/container";

const PDF = (body: string) => `%PDF-1.4\n${body}`;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await resetDb();
  resetServices();
});
afterAll(async () => {
  await closePools();
});

async function uploadAndParse(token: string, content: string, filename = "resume.pdf") {
  const reqRes = await call(uploadsPOST, {
    token,
    body: { filename, contentType: "application/pdf", sizeBytes: Buffer.byteLength(content) },
  });
  const { candidateId, fileKey } = reqRes.json.data;
  await getServices().storage.putObject(fileKey, Buffer.from(content), "application/pdf");
  await call(completePOST, { token, body: { candidateId, fileKey } });
  return candidateId as string;
}

describe("GET /api/candidates/:id/resume", () => {
  it("downloads the exact bytes that were uploaded, base64-encoded", async () => {
    const { token } = await makeUser("recruiter");
    const content = PDF("Name: Jane Doe\nTitle: Engineer");
    const candidateId = await uploadAndParse(token, content);

    const res = await call(resumeGET, { token, method: "GET", routeCtx: params(candidateId) });
    expect(res.status).toBe(200);
    expect(res.json.data.mimeType).toBe("application/pdf");
    expect(res.json.data.filename).toMatch(/\.pdf$/);
    const decoded = Buffer.from(res.json.data.base64, "base64").toString("utf8");
    expect(decoded).toBe(content);
  });

  it("viewer role is sufficient (role floor is viewer)", async () => {
    const { token } = await makeUser("viewer");
    // Seed a candidate with no résumé file — RBAC should still pass through to
    // the 404-for-missing-file branch, not a 403.
    const { tenant } = await makeUser("recruiter");
    const candidate = await seedCandidate(tenant.id);
    const res = await call(resumeGET, { token, method: "GET", routeCtx: params(candidate.id) });
    // Different tenant than the viewer → tenant-scoped 404, not 403.
    expect(res.status).toBe(404);
  });

  it("404s when the candidate has no uploaded résumé file (manually created)", async () => {
    const { token } = await makeUser("recruiter");
    const created = await call(createPOST, { token, body: { fullName: "Manual Entry" } });
    const res = await call(resumeGET, {
      token,
      method: "GET",
      routeCtx: params(created.json.data.id),
    });
    expect(res.status).toBe(404);
  });

  it("TEN — never serves another tenant's résumé (IDOR)", async () => {
    const { token } = await makeUser("recruiter");
    const other = await seedTenant("Other Co");
    const otherCandidate = await seedCandidate(other.id);
    const res = await call(resumeGET, {
      token,
      method: "GET",
      routeCtx: params(otherCandidate.id),
    });
    expect(res.status).toBe(404);
  });

  it("404s for an unknown candidate id", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(resumeGET, {
      token,
      method: "GET",
      routeCtx: params("00000000-0000-0000-0000-000000000000"),
    });
    expect(res.status).toBe(404);
  });
});
