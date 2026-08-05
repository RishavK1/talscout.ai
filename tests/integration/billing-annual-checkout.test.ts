import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Regression coverage for the bug where onboarding/plan advertised a 20%
 *  annual discount that `createCheckout` never actually applied — Stripe
 *  checkout only ever used the fixed monthly Price object, so annual
 *  customers were silently charged the full monthly amount. Runs in its own
 *  forked process (vitest `pool: "forks"` isolates per file), so each test
 *  gets a clean `getEnv()` module cache via `vi.resetModules()`. */

/** APP_MODE=live pulls in a superRefine requiring these regardless of what
 *  this test actually exercises — stub the full set so `getEnv()` validates. */
function stubLiveEnv(extra: Record<string, string>) {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_x");
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_monthly");
  vi.stubEnv("STRIPE_PRICE_GROWTH", "price_growth_monthly");
  vi.stubEnv("STRIPE_PRICE_SCALE", "price_scale_monthly");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("annual billing cycle gating", () => {
  it("monthly checkout is supported when only the monthly price is configured", async () => {
    stubLiveEnv({});

    const { StripePaymentProvider } = await import("../../src/server/adapters/stripe.payment");
    const provider = new StripePaymentProvider();
    expect(provider.supportsBillingCycle("starter", "monthly")).toBe(true);
  });

  it("annual checkout is NOT supported when no annual price is configured — matches today's .env.live", async () => {
    stubLiveEnv({});
    // Deliberately NOT setting STRIPE_PRICE_STARTER_ANNUAL etc.

    const { StripePaymentProvider } = await import("../../src/server/adapters/stripe.payment");
    const provider = new StripePaymentProvider();
    expect(provider.supportsBillingCycle("starter", "annual")).toBe(false);
    expect(provider.supportsBillingCycle("growth", "annual")).toBe(false);
    expect(provider.supportsBillingCycle("scale", "annual")).toBe(false);
  });

  it("annual checkout IS supported once an annual price is configured for that plan", async () => {
    stubLiveEnv({ STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual" });

    const { StripePaymentProvider } = await import("../../src/server/adapters/stripe.payment");
    const provider = new StripePaymentProvider();
    expect(provider.supportsBillingCycle("starter", "annual")).toBe(true);
    // Growth still isn't configured for annual — must not accidentally pass.
    expect(provider.supportsBillingCycle("growth", "annual")).toBe(false);
  });

  it("createCheckoutSession selects the annual Price id (not the monthly one) when billingCycle is annual", async () => {
    stubLiveEnv({
      STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
      APP_URL: "https://app.example.com",
    });

    const created: { price: string; quantity: number }[] = [];
    vi.doMock("stripe", () => ({
      default: class MockStripe {
        checkout = {
          sessions: {
            create: async (args: { line_items: { price: string; quantity: number }[] }) => {
              created.push(args.line_items[0]);
              return { id: "cs_test_1", url: "https://checkout.stripe.com/cs_test_1" };
            },
          },
        };
      },
    }));

    const { StripePaymentProvider } = await import("../../src/server/adapters/stripe.payment");
    const provider = new StripePaymentProvider();
    await provider.createCheckoutSession({
      tenantId: "tenant_1",
      plan: "starter",
      seats: 3,
      amount: 23760, // 99 * 0.8 * 3 seats, minor units — matches the discounted amount
      billingCycle: "annual",
    });

    expect(created).toHaveLength(1);
    expect(created[0].price).toBe("price_starter_annual");
    expect(created[0].quantity).toBe(3);
  });
});
