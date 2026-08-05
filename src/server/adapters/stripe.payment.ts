import Stripe from "stripe";
import { getEnv } from "@/server/config/env";
import type {
  PaymentProvider,
  CheckoutArgs,
  CheckoutSession,
  WebhookEvent,
} from "@/server/ports";

function priceForPlan(plan: string, cycle: "monthly" | "annual"): string | undefined {
  const env = getEnv();
  if (cycle === "annual") {
    return {
      starter: env.STRIPE_PRICE_STARTER_ANNUAL,
      growth: env.STRIPE_PRICE_GROWTH_ANNUAL,
      scale: env.STRIPE_PRICE_SCALE_ANNUAL,
    }[plan];
  }
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

  supportsBillingCycle(plan: string, cycle: "monthly" | "annual"): boolean {
    return !!priceForPlan(plan, cycle);
  }

  async createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession> {
    const env = getEnv();
    const cycle = args.billingCycle ?? "monthly";
    const price = priceForPlan(args.plan, cycle);
    if (!price) throw new Error(`No Stripe ${cycle} price configured for plan ${args.plan}`);

    // Redirect base: prefer the initiating request's origin — correct on the
    // deployed domain, preview deployments AND any local dev port — falling
    // back to APP_URL (whose default is localhost) only when absent. This is
    // what keeps post-payment redirects off localhost in production.
    const base =
      args.appOrigin && /^https?:\/\//.test(args.appOrigin)
        ? args.appOrigin
        : env.APP_URL;

    const metadata = {
      tenantId: args.tenantId,
      plan: args.plan,
      seats: String(args.seats),
    };
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: args.seats }],
      customer: args.customerId,
      success_url: `${base}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing?status=cancelled`,
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
  const base = { id: event.id, type: event.type, created: event.created };

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
        renewsAt: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : undefined,
      },
    };
  }

  return { ...base, data: {} };
}
