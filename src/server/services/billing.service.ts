import { getServices } from "@/server/container";
import { subscriptionRepo } from "@/server/repositories/subscription.repo";
import { webhookRepo } from "@/server/repositories/webhook.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { userRepo } from "@/server/repositories/user.repo";
import { auditRepo } from "@/server/repositories/audit.repo";
import { PLAN_PRICES, type CheckoutBody } from "@/server/validation/billing";
import { BadRequest, PaymentRequired } from "@/server/http/errors";
import {
  planHasCapability,
  capabilitiesForPlan,
  CAPABILITY_LABEL,
  type Capability,
} from "@/lib/plans";
import type { TenantContext } from "@/server/db/tx";

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export const billingService = {
  async createCheckout(ctx: TenantContext, body: CheckoutBody) {
    const sub = await subscriptionRepo.getByTenant(ctx);
    
    // Validate that the request is a plan/seat upgrade (no downgrades allowed via self-serve checkout)
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    if (tenant) {
      const PLAN_RANK: Record<string, number> = { starter: 0, growth: 1, scale: 2 };
      const currentRank = PLAN_RANK[tenant.plan] ?? 0;
      const requestedRank = PLAN_RANK[body.plan] ?? 0;

      if (requestedRank < currentRank) {
        throw new BadRequest(`Downgrading to a smaller plan (${body.plan}) is not supported via self-serve. Please contact support.`);
      }

      if (requestedRank === currentRank && body.seats <= tenant.seatLimit) {
        throw new BadRequest(`You are already subscribed to the ${body.plan} plan with ${tenant.seatLimit} seats. To update, please select more seats.`);
      }
    }

    // Amount is computed from the server price book — never from the client.
    const amount = PLAN_PRICES[body.plan] * body.seats;
    const session = await getServices().payment.createCheckoutSession({
      tenantId: ctx.tenantId,
      plan: body.plan,
      seats: body.seats,
      amount,
      customerId: sub?.stripeCustomerId ?? undefined,
    });
    
    // Subscription state is ONLY set by the Stripe webhook (handleWebhook) after
    // payment is confirmed. Never activate here — even in development.
    // For local testing, run: stripe listen --forward-to localhost:3000/api/webhooks/stripe
    await auditRepo.log(ctx, { action: "billing.checkout", metadata: { plan: body.plan, seats: body.seats } });
    return { url: session.url };
  },

  /** Public path. Signature-verified, idempotent, reconciles to server truth. */
  async handleWebhook(rawBody: string, signature: string | null) {
    let event;
    try {
      event = getServices().payment.verifyWebhook(rawBody, signature);
    } catch {
      throw new BadRequest("Invalid webhook signature"); // PAY-01
    }

    const first = await webhookRepo.markProcessed(event.id);
    if (!first) return { received: true, duplicate: true }; // PAY-02

    const tenantId = event.data.tenantId;
    if (!tenantId) return { received: true, ignored: "no_tenant" };

    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const seats = event.data.seats ?? 1;
          await subscriptionRepo.upsertByTenantAdmin(tenantId, {
            status: (event.data.status as "active") ?? "active",
            seats,
            stripeCustomerId: event.data.stripeCustomerId,
            stripeSubId: event.data.stripeSubId,
            renewsAt: event.data.renewsAt ? new Date(event.data.renewsAt) : null,
            eventTimestamp: event.created ? new Date(event.created * 1000) : undefined,
          });
          await tenantRepo.updateAdmin(tenantId, {
            seatLimit: seats,
            plan: event.data.plan,
          });
          return { received: true };
        }
        case "customer.subscription.deleted": {
          await subscriptionRepo.upsertByTenantAdmin(tenantId, {
            status: "canceled",
            eventTimestamp: event.created ? new Date(event.created * 1000) : undefined,
          });
          return { received: true };
        }
        default:
          return { received: true, ignored: event.type }; // PAY-04
      }
    } catch (err) {
      // SEC-006: Delete processed marker on failure to allow Stripe to retry
      await webhookRepo.deleteProcessed(event.id);
      throw err;
    }
  },

  /** Capabilities the tenant's current plan unlocks. */
  async capabilities(ctx: TenantContext): Promise<Capability[]> {
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    return capabilitiesForPlan(tenant?.plan || "starter");
  },

  /** Hard gate: throw 402 if the tenant's plan doesn't include `cap`. */
  async assertCapability(ctx: TenantContext, cap: Capability) {
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    if (!planHasCapability(tenant?.plan || "starter", cap)) {
      throw new PaymentRequired(
        `${CAPABILITY_LABEL[cap]} isn't included in your plan — upgrade to use it.`,
      );
    }
  },

  /** PAY-05: privileged actions require a paid/trialing subscription. */
  async assertActiveSubscription(ctx: TenantContext) {
    const sub = await subscriptionRepo.getByTenant(ctx);
    if (!sub || !ACTIVE_STATUSES.has(sub.status)) {
      throw new PaymentRequired("An active subscription is required");
    }
    return sub;
  },

  /** PAY-06: cannot consume more seats than purchased. */
  async assertSeatAvailable(ctx: TenantContext) {
    const sub = await this.assertActiveSubscription(ctx);
    const used = await userRepo.countActiveSeats(ctx);
    if (used >= sub.seats) {
      throw new PaymentRequired("No seats available — increase your plan");
    }
  },
};
