import { NextResponse } from "next/server";
import { connectionsService } from "@/server/services/connections.service";
import { verifyConnectState } from "@/server/lib/connection-state";
import { AppError } from "@/server/http/errors";

/**
 * GET /api/connections/callback — Composio lands the browser here directly
 * after the user authorizes (or cancels), a plain navigation with no
 * Authorization header, so — same reasoning as the existing Gmail OAuth
 * callback — this can't go through `withAuth`. The signed `state` param
 * (connection-state.ts) is what lets `completeCallback` recover the tenant
 * without a session, and the actual connected/not-connected outcome is
 * always re-verified server-side against Composio itself, never trusted
 * from redirect query params (which are attacker-visible/editable in the
 * browser's network tab).
 *
 * Landing page depends on WHERE the connection was started (state's
 * `returnTo`) — Settings' own connect flow still lands back on Settings,
 * but the agent's connect_app tool now sends the browser back to the AI
 * Agent chat instead. Previously EVERY connection, including ones started
 * mid-conversation, landed on Settings with no way back to the chat the
 * user was just in — confusing on its own, and worse once it turned out
 * Settings' curated card doesn't even recognize a non-curated toolkit
 * (see connect_app's own doc comment on the "calendar" bug this shipped
 * alongside). Decoded here (not just inside completeCallback) so even a
 * failure path — state valid but something else went wrong — still sends
 * the user back to where they actually were, not always to Settings.
 */
export async function GET(req: Request) {
  const appOrigin = new URL(req.url).origin;
  const state = new URL(req.url).searchParams.get("state");
  const decoded = state ? verifyConnectState(state) : null;
  const landingPath =
    decoded?.returnTo === "chat"
      ? decoded.conversationId
        ? `/agent?c=${decoded.conversationId}`
        : "/agent"
      : "/settings#connected-apps";
  const landingUrl = new URL(landingPath, appOrigin);

  if (!state) {
    landingUrl.searchParams.set("connection", "error");
    landingUrl.searchParams.set("message", "Missing connection request");
    return NextResponse.redirect(landingUrl);
  }

  try {
    const result = await connectionsService.completeCallback(state);
    landingUrl.searchParams.set("connection", result.connected ? "connected" : "error");
    landingUrl.searchParams.set("toolkit", result.toolkitSlug);
  } catch (err) {
    landingUrl.searchParams.set("connection", "error");
    landingUrl.searchParams.set(
      "message",
      err instanceof AppError ? err.message : "Failed to connect app",
    );
  }
  return NextResponse.redirect(landingUrl);
}
