import { outreachSendRepo } from "@/server/repositories/outreach.repo";
import { automatedSendRepo } from "@/server/repositories/automated-outreach.repo";
import { TRANSPARENT_GIF } from "@/server/lib/tracking-pixel";
import { logger } from "@/server/observability/logger";

const GIF_HEADERS = {
  "Content-Type": "image/gif",
  "Content-Length": String(TRANSPARENT_GIF.length),
  // Every fetch must reach the server (that's the whole point of a
  // tracking pixel) — a cached response would silently undercount opens.
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

/**
 * GET /api/track/open/[kind]/[id] — fetched directly by the recipient's mail
 * client when it renders the invisible `<img>` embedded in a sent email's
 * HTML body (see tracking-pixel.ts). No session, no tenant header — same
 * "arrives with zero auth context" shape as the WhatsApp delivery webhook,
 * so this bypasses withAuth/withPublic entirely.
 *
 * Always returns the pixel, even for an unknown/malformed id — a tracking
 * pixel that 404s is indistinguishable from a broken image to most mail
 * clients, but logging a 500 here would be pure noise (bots/proxies probe
 * these URLs constantly) and there is nothing sensitive to protect: the id
 * alone can only mark ONE existing send as opened, never read anything back.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
): Promise<Response> {
  const { kind, id } = await params;
  try {
    if (kind === "bf") {
      await outreachSendRepo.markOpenedAdmin(id);
    } else if (kind === "ao") {
      await automatedSendRepo.markOpenedAdmin(id);
    }
  } catch (err) {
    logger.warn({ err, kind, id }, "open_tracking_pixel_failed");
  }
  return new Response(TRANSPARENT_GIF, { status: 200, headers: GIF_HEADERS });
}
