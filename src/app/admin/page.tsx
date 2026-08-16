"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  UserPlus,
  ShieldOff,
  FileText,
  RefreshCw,
  DollarSign,
  Bot,
  MessageSquare,
  Clock,
  Search,
  LayoutDashboard,
  UsersRound,
  TrendingUp,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/app/auth-provider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { TrendChart } from "@/components/charts/trend-chart";
import { DonutChart } from "@/components/charts/donut-chart";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "signups", label: "Signups", icon: UsersRound },
  { id: "revenue", label: "Revenue", icon: TrendingUp },
  { id: "usage", label: "Usage", icon: Activity },
] as const;

interface Overview {
  signupsToday: number;
  activeTenants: number;
  suspendedTenants: number;
  totalCandidates: number;
  currentMrrCents: number;
}

interface TenantRow {
  id: string;
  name: string;
  plan: string;
  seatLimit: number;
  status: string;
  createdAt: string;
  ownerEmail: string | null;
}

interface TenantsData {
  tenants: TenantRow[];
  total: number;
  page: number;
  pageSize: number;
  dailySeries: { day: string; value: number }[];
}

interface RevenueData {
  planDistribution: { plan: string; count: number }[];
  subscriptionStatusCounts: Record<string, number>;
  currentMrrCents: number;
  recentChurn: { tenantId: string; tenantName: string; plan: string; canceledAt: string }[];
}

interface UsageData {
  totalCandidates: number;
  agentAdoption: { conversations: number; messages: number; activeTasks: number };
}

const PLAN_COLORS: Record<string, string> = {
  starter: "var(--color-outline-variant)",
  growth: "var(--color-secondary-container)",
  scale: "var(--color-primary-container)",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Standalone platform-owner dashboard — not wrapped in <AppShell> (this is
 * not tenant-app chrome), not linked from any nav (reached only by typing
 * the URL). Access is enforced server-side: every /api/admin/* route 404s
 * for anyone whose email isn't on PLATFORM_ADMIN_EMAILS, so the API alone
 * already keeps this data private. For the sign-in UX, this page defers
 * entirely to AuthProvider's existing global redirect (the same one every
 * other protected page in the app relies on — see auth-provider.tsx's
 * routing effect): if you're not signed in at all, AuthProvider itself
 * sends you to /login before this page ever fetches anything. This page
 * only waits for that check to settle (authLoading) before calling the
 * admin API, so a logged-out visit never has a chance to race ahead and
 * flash a "not found" state before the redirect lands. If you ARE signed
 * in but the API still 404s (some other, non-owner account), it shows a
 * plain not-found page rather than a "you're not authorized" message that
 * would confirm this route's purpose to a logged-in tenant user who isn't
 * the owner.
 */
export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenantsData, setTenantsData] = useState<TenantsData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [search, setSearch] = useState("");
  const [tenantsPage, setTenantsPage] = useState(1);
  const [suspendTarget, setSuspendTarget] = useState<TenantRow | null>(null);
  const [actingOnTenant, setActingOnTenant] = useState(false);

  const loadTenants = async (status: typeof statusFilter, q: string, page: number) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    if (page > 1) params.set("page", String(page));
    const data = await api.get<TenantsData>(`/api/admin/tenants?${params.toString()}`);
    setTenantsData(data);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [overviewData, revenueData, usageData] = await Promise.all([
        api.get<Overview>("/api/admin/overview"),
        api.get<RevenueData>("/api/admin/revenue"),
        api.get<UsageData>("/api/admin/usage"),
        loadTenants(statusFilter, search, tenantsPage),
      ]);
      setOverview(overviewData);
      setRevenue(revenueData);
      setUsage(usageData);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for AuthProvider's own session check to settle — if it turns out
    // there's no user, its global routing effect redirects to /login on its
    // own; this just avoids firing the admin fetch (and its 404) ahead of
    // that redirect landing.
    if (authLoading || !user) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    if (loading) return;
    loadTenants(statusFilter, search, tenantsPage).catch(() => toast.error("Failed to load tenants"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, tenantsPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tenantsPage !== 1) {
      setTenantsPage(1);
      return;
    }
    loadTenants(statusFilter, search, 1).catch(() => toast.error("Failed to load tenants"));
  };

  const handleStatusFilterChange = (s: typeof statusFilter) => {
    setStatusFilter(s);
    setTenantsPage(1);
  };

  const confirmSuspendToggle = async () => {
    if (!suspendTarget) return;
    const nextStatus = suspendTarget.status === "active" ? "suspended" : "active";
    setActingOnTenant(true);
    try {
      await api.patch(`/api/admin/tenants/${suspendTarget.id}`, { status: nextStatus });
      toast.success(
        nextStatus === "suspended"
          ? `${suspendTarget.name} suspended`
          : `${suspendTarget.name} reactivated`,
      );
      await Promise.all([
        loadTenants(statusFilter, search, tenantsPage),
        api.get<Overview>("/api/admin/overview").then(setOverview),
      ]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update tenant");
    } finally {
      setActingOnTenant(false);
      setSuspendTarget(null);
    }
  };

  if (notFound) {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <p className="font-body-md text-[14px] text-on-surface-variant">404 — this page doesn&apos;t exist.</p>
      </main>
    );
  }

  if (authLoading || !user || loading || !overview || !revenue || !usage || !tenantsData) {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <Loader2 className="size-[24px] animate-spin text-on-surface-variant" />
      </main>
    );
  }

  const kpis = [
    { icon: UserPlus, label: "Signups today", value: overview.signupsToday.toLocaleString() },
    { icon: Users, label: "Active tenants", value: overview.activeTenants.toLocaleString() },
    { icon: ShieldOff, label: "Suspended", value: overview.suspendedTenants.toLocaleString() },
    { icon: DollarSign, label: "Current MRR", value: formatCents(overview.currentMrrCents) },
    { icon: FileText, label: "Candidates (all-time)", value: overview.totalCandidates.toLocaleString() },
  ];

  // Same owner email can legitimately own more than one separate workspace
  // (e.g. an abandoned signup followed by a fresh one) — the name + email
  // alone then look identical between two DIFFERENT tenants, which is
  // exactly what makes it easy to suspend the wrong one. Flag it plainly
  // wherever it happens on the current page so it's never ambiguous.
  const ownerEmailCounts = tenantsData.tenants.reduce<Record<string, number>>((acc, t) => {
    if (t.ownerEmail) acc[t.ownerEmail] = (acc[t.ownerEmail] ?? 0) + 1;
    return acc;
  }, {});

  const tenantColumns: DataTableColumn<TenantRow>[] = [
    {
      key: "name",
      header: "Workspace",
      render: (t) => {
        const hasDuplicateOwner = !!t.ownerEmail && (ownerEmailCounts[t.ownerEmail] ?? 0) > 1;
        return (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-label-md text-[13px] font-medium text-on-surface">{t.name}</p>
              {hasDuplicateOwner && (
                <span
                  className="rounded-full bg-error/10 px-2 py-0.5 font-label-md text-[10px] font-semibold uppercase tracking-wide text-error"
                  title="This owner email has more than one separate workspace — double-check the ID before suspending."
                >
                  Multiple workspaces
                </span>
              )}
            </div>
            <p className="font-body-md text-[12px] text-on-surface-variant">{t.ownerEmail ?? "—"}</p>
            <p className="font-data-mono text-[10px] text-outline">id: {t.id.slice(0, 8)}</p>
          </div>
        );
      },
    },
    {
      key: "plan",
      header: "Plan",
      render: (t) => (
        <span className="font-label-md text-[12px] capitalize text-on-surface-variant">
          {t.plan} · {t.seatLimit} seat{t.seatLimit === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (t) =>
        t.status === "active" ? (
          <StatusBadge tone="active">Active</StatusBadge>
        ) : (
          <StatusBadge tone="error">Suspended</StatusBadge>
        ),
    },
    {
      key: "createdAt",
      header: "Signed up",
      render: (t) => (
        <span className="font-data-mono text-[12px] text-on-surface-variant">{formatDate(t.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      cellClassName: "text-right",
      render: (t) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant={t.status === "active" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setSuspendTarget(t)}
          >
            {t.status === "active" ? "Suspend" : "Reactivate"}
          </Button>
        </div>
      ),
    },
  ];

  const planSegments = revenue.planDistribution.map((p) => ({
    label: p.plan.charAt(0).toUpperCase() + p.plan.slice(1),
    value: p.count,
    color: PLAN_COLORS[p.plan] ?? "var(--color-outline)",
  }));

  const paidCount =
    (revenue.subscriptionStatusCounts.active ?? 0) + (revenue.subscriptionStatusCounts.trialing ?? 0);
  const churnedCount = revenue.subscriptionStatusCounts.canceled ?? 0;

  return (
    <main className="flex h-dvh overflow-hidden bg-surface">
      {/* Left rail — section jump-links, mirrors the app's other rail+content
       *  surfaces (e.g. /agent's conversation list) rather than a single
       *  centered column with no structure. Hidden below lg: sections just
       *  stack top-to-bottom on mobile, same as every other page. */}
      <div className="hidden w-[220px] shrink-0 flex-col border-r border-border-low-alpha bg-surface-white lg:flex">
        <div className="border-b border-border-low-alpha p-5">
          <p className="font-headline-md text-[15px] text-primary">Platform admin</p>
          <p className="mt-0.5 font-label-md text-[11px] text-on-surface-variant">Owner-only · live data</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-label-md text-[13px] text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
            >
              <s.icon className="size-[16px]" />
              {s.label}
            </a>
          ))}
        </nav>
        <div className="border-t border-border-low-alpha p-3">
          <Button type="button" variant="outline" size="sm" onClick={loadAll} disabled={loading} className="w-full justify-center">
            <RefreshCw className="size-[14px]" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
        <Reveal>
          <div id="overview" className="mb-8 flex scroll-mt-6 items-center justify-between gap-4">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-primary">Platform overview</h1>
              <p className="mt-1 font-body-md text-[13px] text-on-surface-variant">
                Real, live data only — a metric reading zero means it&apos;s genuinely zero right now,
                not that it&apos;s missing.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={loadAll} disabled={loading} className="lg:hidden">
              <RefreshCw className="size-[15px]" />
              Refresh
            </Button>
          </div>
        </Reveal>

        <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map((kpi) => (
            <RevealItem key={kpi.label}>
              <Card className="[--card-spacing:--spacing(5)]">
                <CardContent className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary">
                    <kpi.icon className="size-[20px]" />
                  </div>
                  <div>
                    <p className="font-data-mono text-[20px] font-semibold text-on-surface">{kpi.value}</p>
                    <p className="font-label-md text-[12px] text-text-muted">{kpi.label}</p>
                  </div>
                </CardContent>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* Signups */}
        <Reveal delay={0.05}>
          <section id="signups" className="mt-10 scroll-mt-6">
            <div className="mb-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle className="font-sans text-headline-md font-semibold text-primary">
                    Signups — last 30 days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    data={tenantsData.dailySeries}
                    loading={false}
                    valueLabel="signups"
                    emptyLabel="No signups in this window yet."
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                <CardTitle className="font-sans text-headline-md font-semibold text-primary">
                  Workspaces ({tenantsData.total})
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg border border-border-low-alpha p-0.5">
                    {(["all", "active", "suspended"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleStatusFilterChange(s)}
                        className={`rounded-md px-3 py-1.5 font-label-md text-[12px] capitalize transition-colors ${
                          statusFilter === s
                            ? "bg-primary-container/15 text-primary"
                            : "text-on-surface-variant hover:bg-surface-container-low"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={handleSearchSubmit} className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[14px] -translate-y-1/2 text-outline" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name or email…"
                      className="w-56 rounded-lg border border-border-low-alpha bg-surface-container-low py-1.5 pl-8 pr-3 font-body-md text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </form>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={tenantColumns}
                  rows={tenantsData.tenants}
                  getRowKey={(t) => t.id}
                  emptyState={
                    <p className="py-10 text-center font-body-md text-[13px] text-on-surface-variant">
                      No workspaces match this filter.
                    </p>
                  }
                />
              </CardContent>
              {tenantsData.total > tenantsData.pageSize && (() => {
                const totalPages = Math.max(1, Math.ceil(tenantsData.total / tenantsData.pageSize));
                const currentPage = Math.min(tenantsData.page, totalPages);
                const rangeStart = (currentPage - 1) * tenantsData.pageSize + 1;
                const rangeEnd = Math.min(currentPage * tenantsData.pageSize, tenantsData.total);
                return (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-low-alpha bg-surface-white px-6 py-4">
                    <span className="font-body-md text-[13px] text-on-surface-variant">
                      Showing {rangeStart}–{rangeEnd} of {tenantsData.total}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setTenantsPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-[18px]" />
                      </Button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <Button
                          key={p}
                          type="button"
                          variant={p === currentPage ? "gradient" : "outline"}
                          size="icon-sm"
                          onClick={() => setTenantsPage(p)}
                          aria-current={p === currentPage ? "page" : undefined}
                        >
                          {p}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setTenantsPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-[18px]" />
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </Card>
          </section>
        </Reveal>

        {/* Revenue */}
        <Reveal delay={0.1}>
          <section id="revenue" className="mt-10 scroll-mt-6">
          <h2 className="mb-4 font-sans text-headline-md font-semibold text-primary">Revenue</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-headline-md font-semibold text-primary">
                  Plan distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart segments={planSegments} loading={false} centerLabel="workspaces" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-headline-md font-semibold text-primary">
                  Signup → paid funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-body-md text-[13px] text-on-surface-variant">Total signups</span>
                  <span className="font-data-mono text-[16px] text-on-surface">
                    {overview.activeTenants + overview.suspendedTenants}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body-md text-[13px] text-on-surface-variant">Trialing/active subs</span>
                  <span className="font-data-mono text-[16px] text-on-surface">{paidCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body-md text-[13px] text-on-surface-variant">Canceled</span>
                  <span className="font-data-mono text-[16px] text-error">{churnedCount}</span>
                </div>
                <div className="border-t border-border-low-alpha pt-4">
                  <span className="font-body-md text-[13px] text-on-surface-variant">Current MRR</span>
                  <p className="font-data-mono text-[24px] font-semibold text-primary">
                    {formatCents(overview.currentMrrCents)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-headline-md font-semibold text-primary">
                  Recent churn
                </CardTitle>
              </CardHeader>
              <CardContent>
                {revenue.recentChurn.length === 0 ? (
                  <p className="py-6 text-center font-body-md text-[13px] text-on-surface-variant">
                    No cancellations yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {revenue.recentChurn.map((c) => (
                      <li key={c.tenantId} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-label-md text-[13px] text-on-surface">{c.tenantName}</p>
                          <p className="font-body-md text-[11px] capitalize text-on-surface-variant">{c.plan}</p>
                        </div>
                        <span className="shrink-0 font-data-mono text-[11px] text-on-surface-variant">
                          {formatDate(c.canceledAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          </section>
        </Reveal>

        {/* Usage */}
        <Reveal delay={0.15}>
          <section id="usage" className="mt-10 scroll-mt-6">
            <h2 className="mb-4 font-sans text-headline-md font-semibold text-primary">
              AI Agent adoption
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { icon: MessageSquare, label: "Conversations", value: usage.agentAdoption.conversations },
                { icon: Bot, label: "Messages", value: usage.agentAdoption.messages },
                { icon: Clock, label: "Active scheduled tasks", value: usage.agentAdoption.activeTasks },
              ].map((stat) => (
                <Card key={stat.label} className="[--card-spacing:--spacing(5)]">
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary">
                      <stat.icon className="size-[20px]" />
                    </div>
                    <div>
                      <p className="font-data-mono text-[20px] font-semibold text-on-surface">
                        {stat.value.toLocaleString()}
                      </p>
                      <p className="font-label-md text-[12px] text-text-muted">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-10 font-body-md text-[13px] text-on-surface-variant">
            Visitor traffic and real payment history land in the next phases of this dashboard —
            they need a first-party tracker and an extended Stripe webhook, respectively, neither
            of which exist yet, so they&apos;re not shown as fabricated zeros.
          </p>
        </Reveal>
      </div>
      </div>

      <ConfirmDialog
        open={!!suspendTarget}
        onClose={() => !actingOnTenant && setSuspendTarget(null)}
        onConfirm={confirmSuspendToggle}
        title={suspendTarget?.status === "active" ? "Suspend workspace" : "Reactivate workspace"}
        description={
          suspendTarget
            ? `${suspendTarget.name} (${suspendTarget.ownerEmail ?? "no owner email"}, id ${suspendTarget.id.slice(0, 8)}) — ${
                suspendTarget.status === "active"
                  ? "everyone in it will be immediately locked out until reactivated."
                  : "will regain access immediately."
              }`
            : undefined
        }
        confirmLabel={
          actingOnTenant ? "Working…" : suspendTarget?.status === "active" ? "Suspend" : "Reactivate"
        }
        destructive={suspendTarget?.status === "active"}
      />
    </main>
  );
}
