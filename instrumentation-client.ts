import * as Sentry from "@sentry/nextjs";

// Replaces sentry.client.config.ts, which silently stops being loaded under
// Turbopack (Next.js 16's default) — see the file-convention docs at
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client.
// Runs before hydration, so client-side errors are captured from first paint.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
