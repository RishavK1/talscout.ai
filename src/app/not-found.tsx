import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-cream px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-low-alpha bg-surface-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container">
          <span className="material-symbols-outlined text-[24px]">search_off</span>
        </div>
        <h1 className="mt-4 font-headline-md text-headline-md text-on-surface">
          Page not found
        </h1>
        <p className="mt-2 font-body-md text-[14px] text-text-muted">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <Button variant="gradient" size="default" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
