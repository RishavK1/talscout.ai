import { withAuth } from "@/server/http/with-api";
import { subscriptionRepo } from "@/server/repositories/subscription.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { userRepo } from "@/server/repositories/user.repo";
import { PLAN_PRICES } from "@/server/validation/billing";
import { getEnv } from "@/server/config/env";
import Stripe from "stripe";

function mapStripeStatus(s: string): "trialing" | "active" | "past_due" | "canceled" | "incomplete" {
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  if (s === "past_due") return "past_due";
  if (s === "canceled" || s === "unpaid") return "canceled";
  return "incomplete";
}

/** GET /api/billing — get active subscription, seats limit and usage. */
export const GET = withAuth(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  let sub = await subscriptionRepo.getByTenant(ctx);
  let tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);

  const env = getEnv();
  if (env.APP_MODE === "live" && env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      let stripeSubId: string | null = null;
      let seatsCount = 1;
      let planName = "starter";
      let stripeCustomerId: string | null = null;
      let renewsAt: Date | null = null;
      let subStatus: "trialing" | "active" | "past_due" | "canceled" | "incomplete" = "active";

      if (sessionId && sessionId.startsWith("cs_")) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.metadata?.tenantId === ctx.tenantId) {
          stripeCustomerId = session.customer as string;
          if (session.subscription) {
            stripeSubId = session.subscription as string;
            const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
            const item = stripeSub.items.data[0];
            seatsCount = item.quantity ?? 1;
            planName = stripeSub.metadata.plan || (session.metadata.plan as string) || "starter";
            renewsAt = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
            subStatus = mapStripeStatus(stripeSub.status);
          }
        }
      }

      // Retrieve existing subscription directly if we don't have a session ID.
      // This bypasses the Stripe search indexing delay completely.
      if (!stripeSubId && sub?.stripeSubId) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId);
          if (stripeSub.metadata?.tenantId === ctx.tenantId) {
            stripeSubId = stripeSub.id;
            const item = stripeSub.items.data[0];
            seatsCount = item.quantity ?? 1;
            planName = stripeSub.metadata.plan || "starter";
            stripeCustomerId = stripeSub.customer as string;
            renewsAt = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
            subStatus = mapStripeStatus(stripeSub.status);
          }
        } catch (err) {
          console.warn(`Failed to retrieve subscription ${sub.stripeSubId} directly:`, err);
        }
      }

      // Fallback search only if we still don't have a subscription ID
      if (!stripeSubId) {
        const searchRes = await stripe.subscriptions.search({
          query: `metadata['tenantId']:'${ctx.tenantId}'`,
        });

        // Find the newest active/trialing subscription first, or fallback to the newest canceled/incomplete one
        const sorted = [...searchRes.data].sort((a, b) => b.created - a.created);
        const activeSub = sorted.find(s => ["active", "trialing"].includes(s.status)) || sorted[0];

        if (activeSub) {
          const item = activeSub.items.data[0];
          stripeSubId = activeSub.id;
          seatsCount = item.quantity ?? 1;
          planName = activeSub.metadata.plan || "starter";
          stripeCustomerId = activeSub.customer as string;
          renewsAt = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
          subStatus = mapStripeStatus(activeSub.status);
        }
      }

      if (stripeSubId) {
        await subscriptionRepo.upsertByTenantAdmin(ctx.tenantId, {
          status: subStatus,
          seats: seatsCount,
          stripeCustomerId: stripeCustomerId || undefined,
          stripeSubId,
          renewsAt,
        });

        await tenantRepo.updateAdmin(ctx.tenantId, {
          plan: planName,
          seatLimit: seatsCount,
        });

        sub = await subscriptionRepo.getByTenant(ctx);
        tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
      }
    } catch (err) {
      console.error("Failed to sync billing state from Stripe:", err);
    }
  }

  const seatsUsed = await userRepo.countActiveSeats(ctx);

  const plan = tenant?.plan || "starter";
  const pricePerSeat = PLAN_PRICES[plan] || 9900;

  // Real invoice history from Stripe (live mode with a known customer).
  // No customer / mock mode → empty list; the UI already renders that state.
  const invoices: { id: string; date: string; amount: string; status: string; plan?: string; seats?: number }[] = [];
  if (env.APP_MODE === "live" && env.STRIPE_SECRET_KEY && sub?.stripeCustomerId) {
    try {
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      const list = await stripe.invoices.list({
        customer: sub.stripeCustomerId,
        limit: 12,
      });
      for (const inv of list.data) {
        const cents = inv.amount_paid || inv.amount_due || 0;
        const status = inv.status
          ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1)
          : "Open";
        invoices.push({
          id: inv.number || inv.id || "—",
          date: new Date(inv.created * 1000).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          amount: `$${(cents / 100).toLocaleString()}`,
          status,
        });
      }
    } catch (err) {
      console.error("Failed to fetch Stripe invoices:", err);
    }
  }

  return {
    data: {
      plan,
      pricePerSeat: pricePerSeat / 100, // major currency unit
      status: sub?.status || "trialing",
      seats: sub?.seats || tenant?.seatLimit || 1,
      seatsUsed,
      renewsAt: sub?.renewsAt || null,
      invoices,
    },
  };
});
