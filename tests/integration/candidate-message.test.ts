import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { POST as messagePOST } from "../../src/app/api/candidates/[id]/message/route";
import { resetDb, seedTenant, seedCandidate } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { auditLogs } from "../../src/server/db/schema";
import { getServices, resetServices } from "../../src/server/container";
import { MockMailer } from "../../src/server/adapters/mock.mailer";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await resetDb();
  resetServices();
});
afterAll(async () => {
  await closePools();
});

describe("POST /api/candidates/:id/message", () => {
  it("sends a real email via the mailer with reply-to the recruiter", async () => {
    const { tenant, user, token } = await makeUser("recruiter");
    const candidate = await seedCandidate(tenant.id, {
      fullName: "Jane Doe",
      emails: ["jane@example.com"],
    });

    const res = await call(messagePOST, {
      token,
      body: { subject: "Opportunity at Acme", message: "Hi Jane, interested?" },
      routeCtx: params(candidate.id),
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.sent).toBe(true);

    const mailer = getServices().mailer as MockMailer;
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("jane@example.com");
    expect(mailer.sent[0].subject).toBe("Opportunity at Acme");
    expect(mailer.sent[0].replyTo).toBe(user.email);

    // The send is audited, with the REAL client IP folded into metadata.
    const rows = await adminDb()
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.tenantId, tenant.id), eq(auditLogs.action, "candidate.message")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].targetId).toBe(candidate.id);
    expect((rows[0].metadata as { ip?: string })?.ip).toBe("203.0.113.7");
  });

  it("400s when the candidate has no email on file (and sends nothing)", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const candidate = await seedCandidate(tenant.id); // no emails
    const res = await call(messagePOST, {
      token,
      body: { subject: "Hello", message: "Hi" },
      routeCtx: params(candidate.id),
    });
    expect(res.status).toBe(400);
    expect((getServices().mailer as MockMailer).sent).toHaveLength(0);
  });

  it("RBAC: viewer cannot message → 403", async () => {
    const { tenant, token } = await makeUser("viewer");
    const candidate = await seedCandidate(tenant.id, { emails: ["x@y.com"] });
    const res = await call(messagePOST, {
      token,
      body: { subject: "Hello", message: "Hi" },
      routeCtx: params(candidate.id),
    });
    expect(res.status).toBe(403);
  });

  it("TEN: cannot message another tenant's candidate → 404, nothing sent", async () => {
    const { token } = await makeUser("recruiter");
    const other = await seedTenant("Other Co");
    const candidate = await seedCandidate(other.id, { emails: ["x@y.com"] });
    const res = await call(messagePOST, {
      token,
      body: { subject: "Hello", message: "Hi" },
      routeCtx: params(candidate.id),
    });
    expect(res.status).toBe(404);
    expect((getServices().mailer as MockMailer).sent).toHaveLength(0);
  });

  it("VAL: empty subject/message → 422", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const candidate = await seedCandidate(tenant.id, { emails: ["x@y.com"] });
    const res = await call(messagePOST, {
      token,
      body: { subject: "", message: "" },
      routeCtx: params(candidate.id),
    });
    expect(res.status).toBe(422);
  });
});
