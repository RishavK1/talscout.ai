import * as Sentry from "@sentry/nextjs";

/** Next.js calls this once per server instance before it starts handling
 *  requests. Required for Sentry to actually initialize on the server/edge
 *  runtimes — without it, `sentry.server.config.ts`/`sentry.edge.config.ts`
 *  are just unused files that nothing ever imports. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
