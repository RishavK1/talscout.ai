import { withAuth } from "@/server/http/with-api";
import { billingService } from "@/server/services/billing.service";
import { checkoutSchema, type CheckoutBody } from "@/server/validation/billing";

/** POST /api/billing/checkout — create a checkout session. admin only. */
export const POST = withAuth<CheckoutBody>(
  async ({ ctx, body }) => ({ data: await billingService.createCheckout(ctx, body) }),
  { role: "admin", bodySchema: checkoutSchema },
);
