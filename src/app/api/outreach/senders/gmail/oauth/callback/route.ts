import { NextResponse } from "next/server";
import { gmailOauthCallbackSchema } from "@/server/validation/outreach";
import { outreachService } from "@/server/services/outreach.service";
import { AppError } from "@/server/http/errors";

/**
 * GET /api/outreach/senders/gmail/oauth/callback — Google lands the browser
 * here directly (plain navigation, no Authorization header), so this can't
 * go through `withAuth`/`withPublic` — both always serialize a JSON body,
 * but the user needs to end up back in the app, not looking at raw JSON.
 * `state` (see `oauth-state.ts`) is what lets `completeGmailOAuth` recover
 * the tenant/user without a session.
 */
export async function GET(req: Request) {
  const appOrigin = new URL(req.url).origin;
  const landingUrl = new URL("/outreach/bulk-fire", appOrigin);

  const query = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = gmailOauthCallbackSchema.safeParse(query);
  if (!parsed.success) {
    landingUrl.searchParams.set("gmail", "error");
    landingUrl.searchParams.set("message", "Missing or invalid OAuth response from Google");
    return NextResponse.redirect(landingUrl);
  }

  try {
    const sender = await outreachService.completeGmailOAuth({
      code: parsed.data.code,
      state: parsed.data.state,
      appOrigin,
    });
    landingUrl.searchParams.set("gmail", "connected");
    landingUrl.searchParams.set("email", sender.email);
  } catch (err) {
    landingUrl.searchParams.set("gmail", "error");
    landingUrl.searchParams.set(
      "message",
      err instanceof AppError ? err.message : "Failed to connect Gmail account",
    );
  }
  return NextResponse.redirect(landingUrl);
}
