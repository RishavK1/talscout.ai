"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { easeDrawer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { InviteMemberForm } from "@/components/team/invite-member-form";

const SIDEBAR_EXPANDED = 280;
const SIDEBAR_COLLAPSED = 84;
const SIDEBAR_COLLAPSE_KEY = "sidebar-collapsed";

type Item = { href: string; icon: string; label: string; capability?: string };

const mainNav: Item[] = [
  { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "/search", icon: "search", label: "Search" },
  { href: "/candidates", icon: "group", label: "Candidates" },
  { href: "/upload", icon: "upload_file", label: "Upload" },
  { href: "/shortlists", icon: "star", label: "Shortlists" },
  { href: "/outreach/bulk-fire", icon: "send", label: "Bulk Fire" },
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
  collapsed,
  onClick,
}: {
  item: Item;
  active: boolean;
  locked?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  // Locked (plan doesn't include it): route to billing/upgrade, show a lock.
  if (locked) {
    return (
      <Link
        href="/billing"
        onClick={onClick}
        title={collapsed ? `${item.label} — upgrade to unlock` : "Upgrade your plan to use this feature"}
        className={cn(
          "relative flex items-center rounded-lg p-3 text-on-surface-variant/50 transition-all duration-200 ease-in-out hover:bg-white/40",
          collapsed ? "justify-center" : "gap-3",
        )}
      >
        <span className="material-symbols-outlined">{item.icon}</span>
        <span
          className={cn(
            "font-label-md text-label-md overflow-hidden whitespace-nowrap transition-all duration-200",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
          )}
        >
          {item.label}
        </span>
        <span
          className={cn(
            "material-symbols-outlined text-[16px] text-on-surface-variant/50 transition-all duration-200",
            collapsed
              ? "absolute -right-1 -top-1 rounded-full bg-bg-secondary text-[12px]"
              : "ml-auto",
          )}
        >
          lock
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-lg p-3 transition-all duration-200 ease-in-out",
        collapsed ? "justify-center" : "gap-3",
        active
          ? "bg-white text-primary shadow-sm font-semibold"
          : "text-on-surface-variant hover:bg-white/50 hover:text-primary",
      )}
    >
      <span
        className="material-symbols-outlined shrink-0"
        {...(active ? { "data-weight": "fill" } : {})}
      >
        {item.icon}
      </span>
      <span
        className={cn(
          "font-label-md text-label-md overflow-hidden whitespace-nowrap transition-all duration-200",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
  onInvite,
}: {
  collapsed?: boolean;
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
      <Link
        href="/dashboard"
        onClick={onNavigate}
        title={collapsed ? workspaceName || "Workspace" : undefined}
        className={cn("mb-8 flex items-center gap-3", collapsed && "justify-center")}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="h-10 w-10 shrink-0 rounded object-cover border border-border-low-alpha" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary text-on-primary">
            <span className="material-symbols-outlined">work</span>
          </div>
        )}
        <div
          className={cn(
            "overflow-hidden whitespace-nowrap transition-all duration-200",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
          )}
        >
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
            collapsed={collapsed}
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
            title={collapsed ? "Invite Team" : undefined}
            className={cn(
              "mb-4 flex w-full items-center justify-center rounded-lg bg-primary font-label-md text-label-md text-on-primary transition-all duration-200 hover:bg-primary-container active:scale-[0.98]",
              collapsed ? "px-0 py-2" : "gap-2 px-4 py-2",
            )}
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-200",
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
              )}
            >
              Invite Team
            </span>
          </button>
        )}
        {footerNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            locked={item.capability ? !can(item.capability) : false}
            collapsed={collapsed}
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
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [invite, setInvite] = useState(false);
  const [seatInfo, setSeatInfo] = useState<{ remainingSeats: number; plan: string } | null>(null);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const pathname = usePathname();

  // Runs before the browser paints, so the persisted collapsed state is
  // applied without a visible flash of the (server-rendered) expanded default.
  // The width/padding transitions are suppressed until this fires (via
  // sidebarReady) so this correction itself never animates.
  useLayoutEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "true");
    setSidebarReady(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next));
      return next;
    });
  };

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
      <nav
        style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-full bg-bg-secondary lg:block",
          sidebarReady && "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <SidebarContent collapsed={collapsed} onInvite={openInvite} />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border-low-alpha bg-white text-on-surface-variant shadow-[0_2px_8px_rgba(44,35,34,0.12)] transition-colors hover:text-primary"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[16px] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              collapsed && "rotate-180",
            )}
          >
            chevron_left
          </span>
        </button>
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
      <div
        style={{ "--sidebar-w": `${collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED}px` } as React.CSSProperties}
        className={cn(
          "lg:pl-[var(--sidebar-w)]",
          sidebarReady && "transition-[padding-left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        {children}
      </div>

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
