"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

/** Last-resort boundary: fires only when an error escapes even the root
 *  layout (so every provider above `error.tsx` may be broken) — this file
 *  replaces the ENTIRE document, which is why it defines its own <html>/<body>
 *  instead of relying on layout.tsx. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg-cream text-on-surface antialiased">
        <div className="flex min-h-dvh items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-border-low-alpha bg-surface-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h1 className="text-[20px] font-semibold text-on-surface">
              Something went wrong
            </h1>
            <p className="mt-2 text-[14px] text-text-muted">
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary-container px-5 text-[14px] font-semibold text-on-primary-container hover:brightness-110"
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
