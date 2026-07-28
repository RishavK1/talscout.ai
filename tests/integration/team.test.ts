import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as teamGET, POST as invitePOST } from "../../src/app/api/team/route";
import { DELETE as removeDELETE } from "../../src/app/api/team/[userId]/route";
import { POST as signupPOST } from "../../src/app/api/auth/signup/route";
import { resetDb, seedSubscription } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { mintToken } from "../helpers/jwt";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";
import { getServices } from "../../src/server/container";

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePools();
});

describe("PAY-05: entitlement gating", () => {
  it("no subscription → invite blocked (402)", async () => {
    const { token } = await makeUser("admin", { withSubscription: false }); // no subscription seeded
    const res = await call(invitePOST, {
      token,
      body: { email: "new@x.com", role: "recruiter" },
    });
    expect(res.status).toBe(402);
  });

  it("canceled subscription → invite blocked (402)", async () => {
    const { tenant, token } = await makeUser("admin", { withSubscription: false });
    await seedSubscription(tenant.id, { status: "canceled", seats: 10 });
    const res = await call(invitePOST, {
      token,
      body: { email: "new@x.com", role: "recruiter" },
    });
    expect(res.status).toBe(402);
  });
});

describe("PAY-06 / PAY-07: seat math", () => {
  it("PAY-06: inviting beyond purchased seats → 402", async () => {
    const { tenant, token } = await makeUser("admin"); // admin uses 1 seat
    await seedSubscription(tenant.id, { status: "active", seats: 1 });
    const res = await call(invitePOST, {
      token,
      body: { email: "new@x.com", role: "recruiter" },
    });
    expect(res.status).toBe(402);
  });

  it("invite succeeds when seats are available", async () => {
    const { tenant, token } = await makeUser("admin");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    const res = await call(invitePOST, {
      token,
      body: { email: "new@x.com", role: "recruiter" },
    });
    expect(res.status).toBe(201);
    const list = await call(teamGET, { token });
    expect(list.json.data.length).toBe(2);
  });

  it("duplicate invite email → 409", async () => {
    const { tenant, token } = await makeUser("admin");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    await call(invitePOST, { token, body: { email: "dup@x.com", role: "viewer" } });
    const again = await call(invitePOST, {
      token,
      body: { email: "dup@x.com", role: "viewer" },
    });
    expect(again.status).toBe(409);
  });

  it("PAY-07: removing a member frees a seat", async () => {
    const { tenant, token } = await makeUser("admin"); // 1 seat used
    await seedSubscription(tenant.id, { status: "active", seats: 2 });
    const first = await call(invitePOST, {
      token,
      body: { email: "a@x.com", role: "recruiter" },
    }); // now 2/2 full
    const blocked = await call(invitePOST, {
      token,
      body: { email: "b@x.com", role: "recruiter" },
    });
    expect(blocked.status).toBe(402);

    const del = await call(removeDELETE, {
      method: "DELETE",
      token,
      routeCtx: params(first.json.data.id),
    });
    expect(del.status).toBe(200);

    const retry = await call(invitePOST, {
      token,
      body: { email: "b@x.com", role: "recruiter" },
    });
    expect(retry.status).toBe(201); // seat freed
  });
});

describe("RBAC-03: last-admin lockout", () => {
  it("cannot remove the last active admin → 409", async () => {
    const { tenant, token, user } = await makeUser("admin");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    const res = await call(removeDELETE, {
      method: "DELETE",
      token,
      routeCtx: params(user.id),
    });
    expect(res.status).toBe(409);
  });

  it("can remove a non-admin member → 200", async () => {
    const { tenant, token } = await makeUser("admin");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    const invited = await call(invitePOST, {
      token,
      body: { email: "r@x.com", role: "recruiter" },
    });
    const res = await call(removeDELETE, {
      method: "DELETE",
      token,
      routeCtx: params(invited.json.data.id),
    });
    expect(res.status).toBe(200);
  });
});

describe("RBAC + IDOR on team endpoints", () => {
  it("recruiter cannot list or invite → 403", async () => {
    const { tenant, token } = await makeUser("recruiter");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    expect((await call(teamGET, { token })).status).toBe(403);
    expect(
      (await call(invitePOST, { token, body: { email: "x@x.com", role: "viewer" } })).status,
    ).toBe(403);
  });

  it("cannot remove a user from another tenant → 404", async () => {
    const a = await makeUser("admin");
    await seedSubscription(a.tenant.id, { status: "active", seats: 5 });
    const b = await makeUser("admin"); // different tenant
    const res = await call(removeDELETE, {
      method: "DELETE",
      token: a.token,
      routeCtx: params(b.user.id),
    });
    expect(res.status).toBe(404);
  });
});

describe("invite delivery + acceptance", () => {
  it("actually emails the invitee, and reports it back", async () => {
    const { tenant, token } = await makeUser("admin");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    const mailSpy = vi.spyOn(getServices().mailer, "send");

    const res = await call(invitePOST, {
      token,
      body: { email: "newhire@x.com", role: "recruiter" },
    });

    expect(res.status).toBe(201);
    expect(res.json.data.emailSent).toBe(true);
    // The whole point: an invite that sends nothing is the bug this covers.
    expect(mailSpy).toHaveBeenCalledTimes(1);
    const message = mailSpy.mock.calls[0][0];
    expect(message.to).toBe("newhire@x.com");
    expect(message.text).toContain("/signup");
    vi.restoreAllMocks();
  });

  it("a failing mail provider still creates the member, reported honestly", async () => {
    const { tenant, token } = await makeUser("admin");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    vi.spyOn(getServices().mailer, "send").mockRejectedValue(new Error("provider down"));

    const res = await call(invitePOST, {
      token,
      body: { email: "newhire@x.com", role: "recruiter" },
    });

    // The seat is already reserved — a mail hiccup must not fail the invite,
    // but it must not be reported as a sent email either.
    expect(res.status).toBe(201);
    expect(res.json.data.emailSent).toBe(false);
    expect(res.json.data.signupUrl).toContain("/signup");
    vi.restoreAllMocks();
  });

  it("signing up with an invited email JOINS that workspace instead of creating a new one", async () => {
    const { tenant, token } = await makeUser("admin");
    await seedSubscription(tenant.id, { status: "active", seats: 5 });
    await call(invitePOST, { token, body: { email: "invitee@x.com", role: "recruiter" } });

    const inviteeToken = await mintToken("22222222-2222-2222-2222-222222222222", {
      email: "invitee@x.com",
    });
    const signup = await call(signupPOST, {
      token: inviteeToken,
      body: { workspaceName: "Ignored — they were invited" },
    });

    // 200 (joined), never 201 (created) — and the SAME tenant as the inviter.
    expect(signup.status).toBe(200);
    expect(signup.json.data.tenantId).toBe(tenant.id);
    expect(signup.json.data.role).toBe("recruiter");

    // No stray second tenant, and the invite row is now active, not orphaned.
    const rows = await adminDb().select().from(users).where(eq(users.email, "invitee@x.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    expect(rows[0].tenantId).toBe(tenant.id);
  });

  it("an email with no invite still gets its own workspace (regression guard)", async () => {
    const strangerToken = await mintToken("33333333-3333-3333-3333-333333333333", {
      email: "stranger@x.com",
    });
    const signup = await call(signupPOST, {
      token: strangerToken,
      body: { workspaceName: "Stranger Co" },
    });
    expect(signup.status).toBe(201);
    expect(signup.json.data.role).toBe("admin");
  });
});
