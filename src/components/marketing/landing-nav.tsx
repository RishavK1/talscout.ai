"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/app/auth-provider";
import { ThemeToggle } from "@/components/app/theme-toggle";

const LINKS = [
  { label: "AI Outreach", href: "/#outreach" },
  { label: "Bulk Fire", href: "/#bulk-fire" },
  { label: "Talent", href: "/#talent" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-border-low-alpha bg-surface-white/95 backdrop-blur-lg"
          : "border-b border-border-low-alpha bg-surface-white/90 backdrop-blur-lg"
      }`}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-[1240px] items-center justify-between px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
            <span className="material-symbols-outlined text-[18px]">travel_explore</span>
          </span>
          <span className="text-[18px] font-semibold tracking-[-0.02em] text-on-surface">
            TalScout
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-[13px] font-medium text-text-muted transition-colors duration-200 hover:text-on-surface"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle className="size-10" />
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-lg bg-primary-container px-4 text-[13px] font-semibold text-on-primary-container transition-colors hover:bg-primary hover:text-on-primary"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-[13px] font-medium text-text-muted transition-colors hover:text-on-surface sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-10 items-center rounded-lg bg-primary-container px-4 text-[13px] font-semibold text-on-primary-container transition-colors hover:bg-primary hover:text-on-primary"
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
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  {l.label}
                </a>
              ))}
              {user ? (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-container hover:text-on-surface"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-container hover:text-on-surface"
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
