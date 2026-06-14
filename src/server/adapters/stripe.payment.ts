import Stripe from "stripe";
import { getEnv } from "@/server/config/env";
import type {
  PaymentProvider,
  CheckoutArgs,
  CheckoutSession,
  WebhookEvent,
} from "@/server/ports";

function priceForPlan(plan: string): string | undefined {
  const env = getEnv();
  return {
    starter: env.STRIPE_PRICE_STARTER,
    growth: env.STRIPE_PRICE_GROWTH,
    scale: env.STRIPE_PRICE_SCALE,
  }[plan];
}

function mapStatus(s: string): string {
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  if (s === "past_due") return "past_due";
  if (s === "canceled" || s === "unpaid") return "canceled";
  return "incomplete";
}

export class StripePaymentProvider implements PaymentProvider {
  private stripe: Stripe;
  constructor() {
    this.stripe = new Stripe(getEnv().STRIPE_SECRET_KEY ?? "");
  }

  async createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession> {
    const env = getEnv();
    const price = priceForPlan(args.plan);
    if (!price) throw new Error(`No Stripe price configured for plan ${args.plan}`);

    const metadata = {
      tenantId: args.tenantId,
      plan: args.plan,
      seats: String(args.seats),
    };
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: args.seats }],
      customer: args.customerId,
      success_url: `${env.APP_URL}/billing?status=success`,
      cancel_url: `${env.APP_URL}/billing?status=cancelled`,
      metadata,
      subscription_data: { metadata },
    });
    return { url: session.url ?? "", sessionId: session.id };
  }

  verifyWebhook(rawBody: string, signature: string | null): WebhookEvent {
    const env = getEnv();
    if (!signature) throw new Error("missing signature");
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET ?? "",
    );
    return translate(event);
  }
}

function translate(event: Stripe.Event): WebhookEvent {
  const base = { id: event.id, type: event.type };

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const m = s.metadata ?? {};
    return {
      ...base,
      data: {
        tenantId: m.tenantId,
        plan: m.plan,
        seats: m.seats ? Number(m.seats) : undefined,
        status: "active",
        stripeCustomerId:
          typeof s.customer === "string" ? s.customer : (s.customer?.id ?? undefined),
        stripeSubId:
          typeof s.subscription === "string"
            ? s.subscription
            : (s.subscription?.id ?? undefined),
      },
    };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const m = sub.metadata ?? {};
    const item = sub.items?.data?.[0];
    return {
      ...base,
      data: {
        tenantId: m.tenantId,
        plan: m.plan,
        seats: item?.quantity ?? (m.seats ? Number(m.seats) : undefined),
        status:
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : mapStatus(sub.status),
        stripeCustomerId:
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
        stripeSubId: sub.id,
      },
    };
  }

  return { ...base, data: {} };
}
