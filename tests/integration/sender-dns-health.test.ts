import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const resolveTxt = vi.fn();
vi.mock("node:dns/promises", () => ({
  resolveTxt: (...args: unknown[]) => resolveTxt(...args),
}));

const { GET: dnsHealthGET } = await import(
  "../../src/app/api/outreach/senders/[id]/dns-health/route"
);
const { resetDb } = await import("../helpers/seed");
const { makeUser } = await import("../helpers/auth-fixtures");
const { call } = await import("../helpers/http");
const { withTenantTx } = await import("../../src/server/db/tx");
const { senderAccountRepo } = await import("../../src/server/repositories/outreach.repo");
const { closePools } = await import("../../src/server/db/client");

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function notFound(): NodeJS.ErrnoException {
  const err = new Error("queryTxt ENOTFOUND") as NodeJS.ErrnoException;
  err.code = "ENOTFOUND";
  return err;
}

async function seedSmtpSender(tenantId: string, email: string) {
  return await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.createSmtp(ctx, {
      label: email,
      email,
      smtpHost: "smtp.test.local",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: email,
      smtpPasswordEnc: "enc:test",
    }),
  );
}

beforeEach(async () => {
  await resetDb();
  resolveTxt.mockReset();
});
afterAll(async () => {
  await closePools();
});

describe("GET /api/outreach/senders/[id]/dns-health", () => {
  it("returns SPF/DKIM/DMARC results for a sender's custom domain", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSmtpSender(tenant.id, "hello@acme-outreach.example");
    resolveTxt.mockImplementation(async (host: string) => {
      if (host === "acme-outreach.example") return [["v=spf1 include:_spf.google.com ~all"]];
      if (host === "_dmarc.acme-outreach.example") return [["v=DMARC1; p=reject;"]];
      throw notFound();
    });

    const res = await call(dnsHealthGET, { token, routeCtx: params(sender.id) });
    expect(res.status).toBe(200);
    expect(res.json.data.domain).toBe("acme-outreach.example");
    expect(res.json.data.isConsumerProvider).toBe(false);
    expect(res.json.data.spf.status).toBe("present");
    expect(res.json.data.dmarc.status).toBe("present");
    expect(res.json.data.dkim.status).toBe("missing"); // no selector configured in the mock
  });

  it("a consumer webmail sender (gmail.com) is never DNS-checked", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const sender = await seedSmtpSender(tenant.id, "founder@gmail.com");

    const res = await call(dnsHealthGET, { token, routeCtx: params(sender.id) });
    expect(res.status).toBe(200);
    expect(res.json.data.isConsumerProvider).toBe(true);
    expect(res.json.data.spf).toBeUndefined();
    expect(resolveTxt).not.toHaveBeenCalled();
  });

  it("404s for a sender belonging to a different tenant", async () => {
    const a = await makeUser("recruiter");
    const b = await makeUser("recruiter");
    const senderA = await seedSmtpSender(a.tenant.id, "hello@tenant-a.example");

    const res = await call(dnsHealthGET, { token: b.token, routeCtx: params(senderA.id) });
    expect(res.status).toBe(404);
  });

  it("404s for an unknown sender id", async () => {
    const { token } = await makeUser("recruiter");
    const res = await call(dnsHealthGET, { token, routeCtx: params(crypto.randomUUID()) });
    expect(res.status).toBe(404);
  });
});
