import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Generates a fresh, unpredictable nonce on every request and builds a
 * strict script-src around it ('strict-dynamic' + the nonce, no
 * 'unsafe-inline'/'unsafe-eval' in production) — closes the gap where a
 * future XSS bug could run arbitrary inline JS and read the Supabase auth
 * token out of localStorage. 'unsafe-eval' stays dev-only: React's
 * dev-mode error-stack reconstruction needs it; neither React nor Next.js
 * use eval in production.
 *
 * Set on BOTH the outgoing response (browser enforcement) and the
 * downstream request headers — Next.js reads the nonce back off the
 * request's CSP header during SSR to auto-nonce its own framework/page
 * script tags, so it has to be visible there too, not just on the response.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com data:;
    img-src 'self' data: blob: https://*.supabase.co;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.inngest.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
