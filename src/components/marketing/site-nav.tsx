"use client";

import Link from "next/link";
import { useAuth } from "@/components/app/auth-provider";

export function SiteNav() {
  const { user } = useAuth();
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border-low-alpha bg-surface/80 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-headline-lg text-headline-md tracking-tight text-primary"
          >
            TalScout
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/#features"
              className="font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
            >
              Product
            </Link>
            <Link
              href="/pricing"
              className="font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
            >
              Pricing
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary-container px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary active:scale-95"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden font-label-md text-label-md text-on-surface transition-colors hover:text-primary sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-primary-container px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary active:scale-95"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
