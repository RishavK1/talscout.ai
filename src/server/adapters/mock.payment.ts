import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/config/env";
import type {
  PaymentProvider,
  CheckoutArgs,
  CheckoutSession,
  WebhookEvent,
} from "@/server/ports";

const MOCK_WEBHOOK_SECRET = "whsec_mock_secret";

/** Deterministic mock payment provider. Webhook signatures are real HMACs over
 *  the raw body, so signature verification (PAY-01) is genuinely exercised.
 *  There's no real Stripe to redirect to, so the "checkout" URL lands
 *  straight back on /billing — billingService.createCheckout is responsible
 *  for simulating the checkout.session.completed webhook in mock mode, since
 *  nothing will ever POST to /api/webhooks/stripe otherwise. */
export class MockPaymentProvider implements PaymentProvider {
  private counter = 0;

  /** No real Stripe price catalog behind the mock — every plan/cycle combo
   *  is "available" since nothing is actually charged. */
  supportsBillingCycle(): boolean {
    return true;
  }

  async createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession> {
    const sessionId = `cs_mock_${args.tenantId}_${this.counter++}`;
    const base =
      args.appOrigin && /^https?:\/\//.test(args.appOrigin)
        ? args.appOrigin
        : getEnv().APP_URL;
    return {
      url: `${base}/billing?status=success&session_id=${sessionId}`,
      sessionId,
    };
  }

  verifyWebhook(rawBody: string, signature: string | null): WebhookEvent {
    if (!signature) throw new Error("missing signature");
    const expected = MockPaymentProvider.sign(rawBody);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("invalid signature");
    }
    return JSON.parse(rawBody) as WebhookEvent;
  }

  /** Exposed for tests to produce a valid signature for a raw body. */
  static sign(rawBody: string): string {
    return createHmac("sha256", MOCK_WEBHOOK_SECRET).update(rawBody).digest("hex");
  }
}
