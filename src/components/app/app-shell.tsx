"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/components/app/auth-provider";

/** Persisted independently of shadcn's own cookie-based default (see
 *  SidebarProvider's `open`/`onOpenChange` below) — keeps the exact
 *  persistence key this app already shipped with. */
const SIDEBAR_COLLAPSE_KEY = "sidebar-collapsed";
/** Overrides shadcn's smaller defaults (16rem/3rem) to match this app's
 *  existing expanded/collapsed dimensions exactly. */
const SIDEBAR_WIDTH = "280px";
const SIDEBAR_WIDTH_ICON = "84px";

type Item = { href: string; icon: string; label: string; capability?: string };

const mainNav: Item[] = [
  { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "/search", icon: "search", label: "Search" },
  { href: "/candidates", icon: "group", label: "Candidates" },
  { href: "/upload", icon: "upload_file", label: "Upload" },
  { href: "/shortlists", icon: "star", label: "Shortlists" },
  { href: "/analytics", icon: "insights", label: "Analytics" },
  { href: "/outreach/bulk-fire", icon: "send", label: "Bulk Fire" },
  { href: "/blueprints", icon: "description", label: "Blueprints" },
  { href: "/automated-outreach", icon: "auto_awesome", label: "Automated Outreach" },
  { href: "/automated-outreach/replies", icon: "forum", label: "Reply Review" },
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
}: {
  item: Item;
  active: boolean;
  locked?: boolean;
}) {
  // Locked (plan doesn't include it): route to billing/upgrade, show a lock.
  if (locked) {
    return (
      <SidebarMenuButton
        asChild
        size="lg"
        tooltip={`${item.label} — upgrade to unlock`}
        className="text-sidebar-foreground/50"
      >
        <Link href="/billing">
          <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
          <span>{item.label}</span>
          <span className="material-symbols-outlined ml-auto text-[16px] text-sidebar-foreground/50">
            lock
          </span>
        </Link>
      </SidebarMenuButton>
    );
  }
  return (
    <SidebarMenuButton
      asChild
      size="lg"
      isActive={active}
      tooltip={item.label}
      className="text-sidebar-foreground"
    >
      <Link href={item.href}>
        <span
          className="material-symbols-outlined shrink-0 text-[20px]"
          {...(active ? { "data-weight": "fill" } : {})}
        >
          {item.icon}
        </span>
        <span>{item.label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

/** Small floating chevron toggle, matching this app's original affordance —
 *  kept alongside shadcn's own `<SidebarRail />` (drag/click edge-strip) for
 *  desktop users who expect a discoverable button rather than a thin strip. */
function SidebarCollapseToggle() {
  const { toggleSidebar, state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="absolute -right-3 top-20 z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-border-low-alpha bg-white text-on-surface-variant shadow-ambient transition-colors hover:text-primary md:flex"
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
  );
}

/** Mobile-only top bar (hamburger + brand) — `useSidebar()` requires a
 *  descendant of SidebarProvider, so this can't live in AppShell directly. */
function MobileTopBar() {
  const { toggleSidebar } = useSidebar();
  const { workspaceName, profile } = useAuth();
  const logoUrl = profile?.logo;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-low-alpha bg-surface-white px-4 lg:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={toggleSidebar}
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
        <span className="font-headline-md text-[18px] text-primary truncate max-w-[120px]">
          {workspaceName || "Workspace"}
        </span>
      </Link>
    </header>
  );
}

function AppSidebar() {
  const { workspaceName, profile, can, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const logoUrl = profile?.logo;

  return (
    <Sidebar collapsible="icon" className="border-r border-border-low-alpha bg-surface-white">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <Link
          href="/dashboard"
          title={workspaceName || "Workspace"}
          className="flex items-center gap-3 overflow-hidden"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="h-10 w-10 shrink-0 rounded object-cover border border-border-low-alpha group-data-[collapsible=icon]:size-8"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary group-data-[collapsible=icon]:size-8">
              <span className="material-symbols-outlined">work</span>
            </div>
          )}
          <div className="overflow-hidden whitespace-nowrap group-data-[collapsible=icon]:hidden">
            <h2 className="font-headline-md text-headline-md text-primary truncate max-w-[160px]">
              {workspaceName || "Workspace"}
            </h2>
            <p className="font-label-md text-label-md text-on-surface-variant">Recruitment Team</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="uppercase tracking-wider">Main</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {mainNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <NavLink item={item} active={isActive(item.href)} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border-low-alpha px-2 py-3">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="uppercase tracking-wider">Workspace</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {footerNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <NavLink
                  item={item}
                  active={isActive(item.href)}
                  locked={item.capability ? (authLoading ? false : !can(item.capability)) : false}
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
      <SidebarCollapseToggle />
      <SidebarRail />
    </Sidebar>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "true";
  });

  const handleOpenChange = (open: boolean) => {
    const nextCollapsed = !open;
    setCollapsed(nextCollapsed);
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(nextCollapsed));
  };

  return (
    <SidebarProvider
      open={!collapsed}
      onOpenChange={handleOpenChange}
      className="bg-bg-cream"
      style={{ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="bg-transparent">
        <MobileTopBar />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
