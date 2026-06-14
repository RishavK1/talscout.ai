import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { MemoryRateLimiter } from "../../src/server/adapters/memory.ratelimit";
import { withPublic, withAuth } from "../../src/server/http/with-api";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { resetServices } from "../../src/server/container";
import { closePools } from "../../src/server/db/client";

beforeEach(() => {
  resetServices();
});

afterAll(async () => {
  await closePools();
});

describe("MemoryRateLimiter", () => {
  it("RL-04: restricts bursts and resets over time", async () => {
    const limiter = new MemoryRateLimiter();
    const key = "test-key";

    // First 2 requests succeed
    const r1 = await limiter.limit(key, 2, 1);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = await limiter.limit(key, 2, 1);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(0);

    // 3rd request fails (rate limited)
    const r3 = await limiter.limit(key, 2, 1);
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);

    // Wait 1.1s for reset
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Request succeeds again
    const r4 = await limiter.limit(key, 2, 1);
    expect(r4.success).toBe(true);
    expect(r4.remaining).toBe(1);
  });
});

describe("HTTP Rate Limiting", () => {
  it("RL-01: withPublic IP rate limiting returns 429 and Retry-After header", async () => {
    const handler = withPublic(
      async () => {
        return { data: { hello: "world" } };
      },
      {
        rateLimit: { limit: 2, windowSeconds: 5, keyPrefix: "public-test" },
      },
    );

    // Request 1 & 2 succeed
    const req1 = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });
    const res1 = await handler(req1);
    expect(res1.status).toBe(200);

    const req2 = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });
    const res2 = await handler(req2);
    expect(res2.status).toBe(200);

    // Request 3 from same IP fails
    const req3 = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });
    const res3 = await handler(req3);
    expect(res3.status).toBe(429);
    expect(res3.headers.get("Retry-After")).not.toBeNull();

    // Request from different IP succeeds (fairness)
    const req4 = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "192.168.1.2" },
    });
    const res4 = await handler(req4);
    expect(res4.status).toBe(200);
  });

  it("RL-02: withAuth tenant rate limiting returns 429", async () => {
    const { token } = await makeUser("recruiter");
    const other = await makeUser("recruiter"); // Tenant B

    const handler = withAuth(
      async () => {
        return { data: { success: true } };
      },
      {
        rateLimit: { limit: 1, windowSeconds: 10, keyPrefix: "auth-test" },
      },
    );

    // Tenant A Request 1 succeeds
    const res1 = await call(handler, { token });
    expect(res1.status).toBe(200);

    // Tenant A Request 2 fails (rate limited)
    const res2 = await call(handler, { token });
    expect(res2.status).toBe(429);

    // Tenant B Request succeeds (RL-02 fairness: other tenants unaffected)
    const resOther = await call(handler, { token: other.token });
    expect(resOther.status).toBe(200);
  });
});
