import { whatsappWebhookService } from "@/server/services/whatsapp-webhook.service";
import { logger } from "@/server/observability/logger";

/**
 * GET /api/webhooks/whatsapp — Meta's one-time verification handshake. Must
 * echo back the raw `hub.challenge` value as plain text, not JSON — this
 * can't go through `withPublic` (always wraps in `okResponse`'s JSON
 * envelope), same reasoning as the Gmail OAuth callback route.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  let verified: boolean;
  try {
    verified = whatsappWebhookService.verifyHandshake(mode, token);
  } catch {
    return new Response("Not configured", { status: 503 });
  }

  if (!verified || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200 });
}

/**
 * POST /api/webhooks/whatsapp — no session (Meta calls this directly), so no
 * `withAuth`. Reads the RAW body (the `X-Hub-Signature-256` HMAC is computed
 * over raw bytes) and verifies it before trusting anything, same pattern as
 * the Stripe webhook. Always returns 200 quickly, even on a bad signature or
 * lookup miss for delivery-status events — Meta disables webhooks after
 * sustained non-200s, and a forged/replayed payload with a bad signature is
 * simply dropped rather than surfaced as an error to the caller.
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!whatsappWebhookService.verifySignature(rawBody, signature)) {
    logger.warn("whatsapp_webhook_invalid_signature");
    return new Response("Invalid signature", { status: 403 });
  }

  await whatsappWebhookService.handleEvent(rawBody);
  return new Response("EVENT_RECEIVED", { status: 200 });
}
