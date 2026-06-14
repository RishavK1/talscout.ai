"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { easeDrawer } from "@/lib/motion";
import { Modal } from "@/components/ui/modal";

type Item = { href: string; icon: string; label: string };

const mainNav: Item[] = [
  { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "/search", icon: "search", label: "Search" },
  { href: "/candidates", icon: "group", label: "Candidates" },
  { href: "/upload", icon: "upload_file", label: "Upload" },
  { href: "/shortlists", icon: "star", label: "Shortlists" },
];

const footerNav: Item[] = [
  { href: "/team", icon: "groups", label: "Team & seats" },
  { href: "/billing", icon: "credit_card", label: "Billing" },
  { href: "/settings", icon: "settings", label: "Settings" },
  { href: "/audit", icon: "receipt_long", label: "Audit log" },
];

function NavLink({
  item,
  active,
  onClick,
}: {
  item: Item;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={
        "flex items-center gap-3 rounded-lg p-3 transition-all duration-200 ease-in-out " +
        (active
          ? "bg-white text-primary shadow-sm font-semibold"
          : "text-on-surface-variant hover:bg-white/50 hover:text-primary")
      }
    >
      <span
        className="material-symbols-outlined"
        {...(active ? { "data-weight": "fill" } : {})}
      >
        {item.icon}
      </span>
      <span className="font-label-md text-label-md">{item.label}</span>
    </Link>
  );
}

function SidebarContent({
  onNavigate,
  onInvite,
}: {
  onNavigate?: () => void;
  onInvite?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col p-6">
      {/* Brand */}
      <Link href="/dashboard" onClick={onNavigate} className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary">
          <span className="material-symbols-outlined">work</span>
        </div>
        <div>
          <h2 className="font-headline-md text-headline-md text-primary">Acme Corp</h2>
          <p className="font-label-md text-label-md text-on-surface-variant">
            Recruitment Team
          </p>
        </div>
      </Link>

      {/* Main nav */}
      <div className="flex-1 space-y-1">
        {mainNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            onClick={onNavigate}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto space-y-1 border-t border-border-low-alpha pt-4">
        <button
          type="button"
          onClick={onInvite}
          className="mb-4 w-full rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
        >
          Invite Team
        </button>
        {footerNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            onClick={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed/20 text-tertiary-container">
          <span className="material-symbols-outlined">check_circle</span>
        </div>
        <p className="font-headline-md text-[18px] text-primary serif-text">Invitations sent</p>
        <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
          Your teammates will get an email to join Acme Corp.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          placeholder="name@company.com"
          className="flex-1 min-w-0 rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          defaultValue="Recruiter"
          className="rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option>Admin</option>
          <option>Recruiter</option>
          <option>Viewer</option>
        </select>
      </div>
      <p className="font-body-md text-[13px] text-on-surface-variant">
        They&apos;ll receive an email invite. You have 3 seats remaining.
      </p>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
        >
          Send invitation
        </button>
      </div>
    </form>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-dvh bg-bg-cream">
      {/* Desktop sidebar */}
      <nav className="fixed left-0 top-0 z-40 hidden h-full w-[280px] bg-bg-secondary lg:block">
        <SidebarContent onInvite={() => setInvite(true)} />
      </nav>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-low-alpha bg-surface/90 px-4 backdrop-blur-md lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-bg-cream active:scale-95"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-on-primary">
            <span className="material-symbols-outlined text-[18px]">work</span>
          </div>
          <span className="font-headline-md text-[18px] text-primary">Acme Corp</span>
        </Link>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-[#221a19]/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.nav
              className="fixed left-0 top-0 z-50 h-full w-[280px] bg-bg-secondary lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.32, ease: easeDrawer }}
            >
              <SidebarContent
                onNavigate={() => setOpen(false)}
                onInvite={() => {
                  setOpen(false);
                  setInvite(true);
                }}
              />
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="lg:pl-[280px]">{children}</div>

      {/* Invite team modal */}
      <Modal
        open={invite}
        onClose={() => setInvite(false)}
        title="Invite your team"
        subtitle="Add recruiters to your Acme Corp workspace."
      >
        <InviteForm onDone={() => setInvite(false)} />
      </Modal>
    </div>
  );
}
