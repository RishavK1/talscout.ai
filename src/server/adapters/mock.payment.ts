import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentProvider,
  CheckoutArgs,
  CheckoutSession,
  WebhookEvent,
} from "@/server/ports";

const MOCK_WEBHOOK_SECRET = "whsec_mock_secret";

/** Deterministic mock payment provider. Webhook signatures are real HMACs over
 *  the raw body, so signature verification (PAY-01) is genuinely exercised. */
export class MockPaymentProvider implements PaymentProvider {
  private counter = 0;

  async createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession> {
    const sessionId = `cs_mock_${args.tenantId}_${this.counter++}`;
    return { url: `mock://checkout/${sessionId}`, sessionId };
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
