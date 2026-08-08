"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Users,
  Upload,
  Star,
  ChartLine,
  Send,
  FileText,
  Sparkles,
  MessageSquare,
  UsersRound,
  CreditCard,
  Settings,
  ReceiptText,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Building2,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
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

type Item = {
  href: string;
  icon: LucideIcon;
  label: string;
  capability?: string;
  /** Opens in a new browser tab instead of navigating this one — used for
   *  the AI Agent, which is its own focused, full-screen chat surface
   *  rather than a panel within the main app shell. */
  newTab?: boolean;
};

const mainNav: Item[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/candidates", icon: Users, label: "Candidates" },
  { href: "/upload", icon: Upload, label: "Upload" },
  { href: "/shortlists", icon: Star, label: "Shortlists" },
  { href: "/analytics", icon: ChartLine, label: "Analytics" },
  { href: "/outreach/bulk-fire", icon: Send, label: "Bulk Fire" },
  { href: "/blueprints", icon: FileText, label: "Blueprints" },
  { href: "/automated-outreach", icon: Sparkles, label: "Automated Outreach" },
  { href: "/automated-outreach/replies", icon: MessageSquare, label: "Reply Review" },
  { href: "/agent", icon: Bot, label: "AI Agent", capability: "ai_agent", newTab: true },
];

const footerNav: Item[] = [
  { href: "/team", icon: UsersRound, label: "Team & seats" },
  { href: "/billing", icon: CreditCard, label: "Billing" },
  { href: "/settings", icon: Settings, label: "Settings" },
  { href: "/audit", icon: ReceiptText, label: "Audit log", capability: "audit_log" },
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
  const Icon = item.icon;

  // Locked (plan doesn't include it): route to billing/upgrade, show a lock.
  if (locked) {
    return (
      <SidebarMenuButton
        asChild
        size="default"
        tooltip={`${item.label} — upgrade to unlock`}
        className="h-9 text-sidebar-foreground/50"
      >
        <Link href="/billing" aria-label={collapsed ? `${item.label} — upgrade to unlock` : undefined}>
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && (
            <>
              <span>{item.label}</span>
              <Lock className="ml-auto size-[14px] text-sidebar-foreground/50" aria-hidden="true" />
            </>
          )}
        </Link>
      </SidebarMenuButton>
    );
  }
  return (
    <SidebarMenuButton
      asChild
      size="default"
      isActive={active}
      tooltip={item.label}
      className="h-9 text-sidebar-foreground"
    >
      <Link
        href={item.href}
        aria-label={collapsed ? item.label : undefined}
        target={item.newTab ? "_blank" : undefined}
        rel={item.newTab ? "noopener noreferrer" : undefined}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
            active && "bg-primary-container text-on-primary-container",
          )}
        >
          <Icon className="size-[18px]" strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
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
      {collapsed ? <PanelLeftOpen className="size-[20px]" /> : <PanelLeftClose className="size-[20px]" />}
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
        <Menu className="size-[20px]" />
      </button>
      <Link href="/dashboard" className="flex items-center gap-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded object-cover border border-border-low-alpha" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-on-primary">
            <Building2 className="size-[16px]" />
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
  // Longest-match wins, so a nested route only lights up its own row. With a
  // plain startsWith, /automated-outreach/replies matched BOTH "Reply Review"
  // (exact) and "Automated Outreach" (prefix), highlighting two rows at once.
  const activeHref = [...mainNav, ...footerNav]
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
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
                <Building2 className="size-[18px]" />
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

      {/* MAIN and WORKSPACE share one scroll region instead of MAIN
       *  scrolling independently under a footer pinned outside it — that
       *  split made the nav read as a cramped, truncated box rather than
       *  a normal list. */}
      <SidebarContent className="px-2 py-2">
        <SidebarGroup className="group-data-[collapsible=icon]:px-1">
          <SidebarGroupLabel className="uppercase">Main</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {mainNav.map((item) => (
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

        <SidebarSeparator className="my-2" />

        <SidebarGroup className="group-data-[collapsible=icon]:px-1">
          <SidebarGroupLabel className="uppercase">Workspace</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
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
      </SidebarContent>
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
