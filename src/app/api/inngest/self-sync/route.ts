import { NextRequest, NextResponse } from "next/server";

/**
 * Keeps Inngest Cloud's function registry in sync with whatever this
 * deployment's actual serving domain is, on a schedule (see vercel.json's
 * `crons` entry) — without ever hardcoding a domain that can go stale.
 *
 * Root cause this exists for: Inngest only learns about new/changed
 * functions (new cron triggers, new event handlers) via a PUT to
 * /api/inngest. That sync has to be re-run by hand after every deploy that
 * changes the function set, targeted at whatever the CURRENT canonical
 * domain is — a preview-branch alias used for a one-off manual sync earlier
 * silently expired (Vercel recycles those), which pointed Inngest Cloud's
 * registered callback URL at a domain that started 404ing. Every cron tick
 * after that failed at the HTTP layer, before ever reaching application
 * code — so campaigns just sat "active" doing nothing, with no error
 * anywhere to notice. This self-syncs against `request.url`'s own origin
 * (same-deployment, same-request, so it's whatever real domain Vercel just
 * invoked this route on — never a remembered/hardcoded one that can rot).
 */
export async function GET(request: NextRequest) {
  const syncUrl = new URL("/api/inngest", request.url);
  const res = await fetch(syncUrl, { method: "PUT" });
  const body = await res.text();
  return NextResponse.json(
    { syncedAgainst: syncUrl.origin, status: res.status, body },
    { status: res.ok ? 200 : 502 },
  );
}
