import { withPublic } from "@/server/http/with-api";
import { billingService } from "@/server/services/billing.service";

/**
 * POST /api/webhooks/stripe — no session. We read the RAW body (signature is
 * computed over raw bytes) and verify it before trusting anything.
 */
export const POST = withPublic(async ({ req }) => {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  return { data: await billingService.handleWebhook(rawBody, signature) };
});
