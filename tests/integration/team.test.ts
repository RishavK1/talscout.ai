import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { GET as teamGET, POST as invitePOST } from "../../src/app/api/team/route";
import { DELETE as removeDELETE } from "../../src/app/api/team/[userId]/route";
import { resetDb, seedSubscription } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { closePools } from "../../src/server/db/client";

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
