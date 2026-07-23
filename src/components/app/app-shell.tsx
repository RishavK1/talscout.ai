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
import { ThemeToggle } from "@/components/app/theme-toggle";

/** Persisted independently of shadcn's own cookie-based default (see
 *  SidebarProvider's `open`/`onOpenChange` below) — keeps the exact
 *  persistence key this app already shipped with. */
const SIDEBAR_COLLAPSE_KEY = "sidebar-collapsed";
/** Overrides shadcn's smaller defaults (16rem/3rem) to match this app's
 *  existing expanded/collapsed dimensions exactly. */
const SIDEBAR_WIDTH = "264px";
const SIDEBAR_WIDTH_ICON = "72px";

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
  collapsed,
}: {
  item: Item;
  active: boolean;
  locked?: boolean;
  collapsed: boolean;
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
        <Link href="/billing" aria-label={collapsed ? `${item.label} — upgrade to unlock` : undefined}>
          <span className="material-symbols-outlined shrink-0 text-[20px]" aria-hidden="true">
            {item.icon}
          </span>
          {!collapsed && (
            <>
              <span>{item.label}</span>
              <span className="material-symbols-outlined ml-auto text-[16px] text-sidebar-foreground/50" aria-hidden="true">
                lock
              </span>
            </>
          )}
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
      <Link href={item.href} aria-label={collapsed ? item.label : undefined}>
        <span
          className="material-symbols-outlined shrink-0 text-[20px]"
          aria-hidden="true"
          {...(active ? { "data-weight": "fill" } : {})}
        >
          {item.icon}
        </span>
        {!collapsed && <span>{item.label}</span>}
      </Link>
    </SidebarMenuButton>
  );
}

/** Header-integrated sidebar control. It stays fully inside the sidebar
 *  instead of straddling the content boundary, which keeps both states clean. */
function SidebarCollapseToggle() {
  const { toggleSidebar, state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-on-surface-variant transition-[color,background-color,transform] hover:bg-surface-container hover:text-on-surface active:scale-95 lg:flex"
    >
      <span
        className={cn(
          "material-symbols-outlined text-[20px] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        {collapsed ? "chevron_right" : "chevron_left"}
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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-low-alpha bg-surface-white/95 px-4 backdrop-blur-xl lg:hidden">
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
      <ThemeToggle className="ml-auto border-0 bg-transparent shadow-none" />
    </header>
  );
}

function AppSidebar() {
  const { workspaceName, profile, can, loading: authLoading } = useAuth();
  const { state } = useSidebar();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const logoUrl = profile?.logo;
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border-low-alpha bg-surface-white">
      <SidebarHeader className="h-[73px] flex-row items-center border-b border-border-low-alpha px-3 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        {!collapsed && (
          <Link
            href="/dashboard"
            title={workspaceName || "Workspace"}
            className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="h-9 w-9 shrink-0 rounded-xl object-cover border border-border-low-alpha"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container shadow-[0_1px_2px_rgba(15,23,42,0.12)]">
                <span className="material-symbols-outlined text-[20px]">work</span>
              </div>
            )}
            <div className="min-w-0 overflow-hidden whitespace-nowrap">
              <h2 className="truncate font-body-md text-[16px] font-semibold tracking-[-0.01em] text-on-surface">
                {workspaceName || "Workspace"}
              </h2>
              <p className="truncate font-label-md text-[11px] text-on-surface-variant">
                Recruitment workspace
              </p>
            </div>
          </Link>
        )}
        <SidebarCollapseToggle />
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        <SidebarGroup className="group-data-[collapsible=icon]:px-1">
          <SidebarGroupLabel className="uppercase tracking-wider">Main</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {mainNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <NavLink item={item} active={isActive(item.href)} collapsed={collapsed} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border-low-alpha px-2 py-3">
        <SidebarGroup className="p-0 group-data-[collapsible=icon]:px-1">
          <SidebarGroupLabel className="uppercase tracking-wider">Workspace</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {footerNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <NavLink
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  locked={item.capability ? (authLoading ? false : !can(item.capability)) : false}
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
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
      className="app-shell bg-bg-cream"
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
