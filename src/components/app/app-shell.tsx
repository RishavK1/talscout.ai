"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { easeDrawer } from "@/lib/motion";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { InviteMemberForm } from "@/components/team/invite-member-form";

type Item = { href: string; icon: string; label: string; capability?: string };

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
  { href: "/audit", icon: "receipt_long", label: "Audit log", capability: "audit_log" },
];

function NavLink({
  item,
  active,
  locked,
  onClick,
}: {
  item: Item;
  active: boolean;
  locked?: boolean;
  onClick?: () => void;
}) {
  // Locked (plan doesn't include it): route to billing/upgrade, show a lock.
  if (locked) {
    return (
      <Link
        href="/billing"
        onClick={onClick}
        title="Upgrade your plan to use this feature"
        className="flex items-center gap-3 rounded-lg p-3 text-on-surface-variant/50 transition-colors hover:bg-white/40"
      >
        <span className="material-symbols-outlined">{item.icon}</span>
        <span className="font-label-md text-label-md">{item.label}</span>
        <span className="material-symbols-outlined ml-auto text-[16px] text-on-surface-variant/50">lock</span>
      </Link>
    );
  }
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
  const { workspaceName, profile, can } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const logoUrl = profile?.logo;

  return (
    <div className="flex h-full flex-col p-6">
      {/* Brand */}
      <Link href="/dashboard" onClick={onNavigate} className="mb-8 flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded object-cover border border-border-low-alpha" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary">
            <span className="material-symbols-outlined">work</span>
          </div>
        )}
        <div>
          <h2 className="font-headline-md text-headline-md text-primary truncate max-w-[160px]">{workspaceName || "Workspace"}</h2>
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
        {profile?.role === "admin" && (
          <button
            type="button"
            onClick={onInvite}
            className="mb-4 w-full rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
          >
            Invite Team
          </button>
        )}
        {footerNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            locked={item.capability ? !can(item.capability) : false}
            onClick={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { workspaceName, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const [seatInfo, setSeatInfo] = useState<{ remainingSeats: number; plan: string } | null>(null);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const pathname = usePathname();

  const logoUrl = profile?.logo;

  // Seat/plan data is only needed for the rarely-opened invite modal, so it's
  // fetched on demand (not on every AppShell mount, which wraps every page).
  const openInvite = async () => {
    setInvite(true);
    setLoadingSeats(true);
    try {
      const res = await api.get<{ plan: string; seats: number; seatsUsed: number }>(
        "/api/billing",
      );
      setSeatInfo({
        remainingSeats: Math.max(0, res.seats - res.seatsUsed),
        plan: res.plan,
      });
    } catch {
      toast.error("Failed to load seat information");
      setInvite(false);
    } finally {
      setLoadingSeats(false);
    }
  };

  // Close the drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: close drawer on navigation
    setOpen((prev) => (prev ? false : prev));
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
        <SidebarContent onInvite={openInvite} />
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
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded object-cover border border-border-low-alpha" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-on-primary">
              <span className="material-symbols-outlined text-[18px]">work</span>
            </div>
          )}
          <span className="font-headline-md text-[18px] text-primary truncate max-w-[120px]">{workspaceName || "Workspace"}</span>
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
                  openInvite();
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
        subtitle={`Add recruiters to your ${workspaceName || "Workspace"} workspace.`}
      >
        {loadingSeats || !seatInfo ? (
          <div className="py-8 text-center flex flex-col items-center gap-2">
            <span className="material-symbols-outlined animate-spin text-primary">sync</span>
            <p className="font-body-md text-[14px] text-on-surface-variant">Loading seat information...</p>
          </div>
        ) : (
          <InviteMemberForm
            remainingSeats={seatInfo.remainingSeats}
            plan={seatInfo.plan}
            onDone={() => setInvite(false)}
          />
        )}
      </Modal>
    </div>
  );
}
