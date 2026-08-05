import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Regression coverage for CFG-02: APP_MODE defaults to "mock" for a
 *  friction-free local dev bootstrap, but that same default would let a
 *  production deploy boot silently in mock mode (free plans via the mock
 *  payment provider's source-visible webhook secret) if the env var were
 *  ever left unset. Runs in its own forked process (vitest `pool: "forks"`
 *  isolates per file), so each test gets a clean `getEnv()` module cache
 *  via `vi.resetModules()`. */

const REQUIRED_BASE = {
  DATABASE_URL: "postgresql://user:pw@localhost:5432/db",
  SUPABASE_JWT_SECRET: "test-jwt-secret-0123456789abcdef0123456789",
  OUTREACH_ENCRYPTION_KEY: "vPZoqfOXC0VVWjvLFROFfSkhw281WDI1zxORqIVzCUU=",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-whatsapp-verify-token",
  WHATSAPP_APP_SECRET: "test-whatsapp-app-secret",
};

function stubBaseEnv() {
  for (const [k, v] of Object.entries(REQUIRED_BASE)) vi.stubEnv(k, v);
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("APP_MODE production guard", () => {
  it("refuses to boot when NODE_ENV=production and APP_MODE resolves to mock", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_MODE", "mock"); // vitest's own env block already defaults this — made explicit here

    const { getEnv } = await import("../../src/server/config/env");
    expect(() => getEnv()).toThrow(/APP_MODE must be explicitly set to "live" in production/);
  });

  it("boots fine when NODE_ENV=production and APP_MODE=live with the required live keys present", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_x");
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

    const { getEnv } = await import("../../src/server/config/env");
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().APP_MODE).toBe("live");
  });

  it("still allows mock mode outside production (local dev)", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_MODE", "mock");

    const { getEnv } = await import("../../src/server/config/env");
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().APP_MODE).toBe("mock");
  });
});
