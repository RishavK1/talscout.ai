"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/app/auth-provider";

const LINKS = [
  { label: "AI Outreach", href: "/#outreach" },
  { label: "Talent", href: "/#talent" },
  { label: "Pricing", href: "/pricing" },
];

export function SiteNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border-low-alpha bg-surface/80 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container shadow-sm">
              <span className="material-symbols-outlined text-[20px]">travel_explore</span>
            </span>
            <span className="font-headline-lg text-headline-md tracking-tight text-primary">
              TalScout
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="font-label-md text-label-md text-on-surface-variant transition-colors hover:text-primary"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary-container px-5 py-2.5 font-label-md text-label-md text-on-primary-container shadow-sm transition-[filter] hover:brightness-110 active:scale-95"
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
                className="rounded-lg bg-primary-container px-5 py-2.5 font-label-md text-label-md text-on-primary-container shadow-sm transition-[filter] hover:brightness-110 active:scale-95"
              >
                Get started
              </Link>
            </>
          )}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container md:hidden"
          >
            <span className="material-symbols-outlined">{open ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden border-t border-border-low-alpha bg-surface-white/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {LINKS.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                >
                  {l.label}
                </Link>
              ))}
              {user ? (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
