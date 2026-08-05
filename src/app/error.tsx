"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Route-segment error boundary — Next.js wraps every page under the root
 *  layout in this automatically, so an unhandled throw anywhere (a bad API
 *  response, a `.map` on an unexpected null, an invalid RegExp from user
 *  input) renders this instead of unmounting to a blank white page. */
export default function Error({
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
    <div className="flex min-h-dvh items-center justify-center bg-bg-cream px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-low-alpha bg-surface-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <span className="material-symbols-outlined text-[24px]">error</span>
        </div>
        <h1 className="mt-4 font-headline-md text-headline-md text-on-surface">
          Something went wrong
        </h1>
        <p className="mt-2 font-body-md text-[14px] text-text-muted">
          This page hit an unexpected error. Your data is safe — try again, or
          head back to the dashboard.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="default" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button variant="gradient" size="default" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
