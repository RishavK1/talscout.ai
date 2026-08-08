import { NextResponse } from "next/server";
import { connectionsService } from "@/server/services/connections.service";
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
 */
export async function GET(req: Request) {
  const appOrigin = new URL(req.url).origin;
  const landingUrl = new URL("/settings#connected-apps", appOrigin);

  const state = new URL(req.url).searchParams.get("state");
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
