import { withAuth } from "@/server/http/with-api";
import { billingService } from "@/server/services/billing.service";
import { checkoutSchema, type CheckoutBody } from "@/server/validation/billing";

/** POST /api/billing/checkout — create a checkout session. admin only. */
export const POST = withAuth<CheckoutBody>(
  async ({ ctx, body, req }) => ({
    // Pass the request origin so Stripe's success/cancel redirects return to
    // the domain the user is actually on (deployed or local), not APP_URL's
    // localhost default.
    data: await billingService.createCheckout(ctx, body, new URL(req.url).origin),
  }),
  { role: "admin", bodySchema: checkoutSchema },
);
