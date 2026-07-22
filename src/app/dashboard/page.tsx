"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { TopAppBar } from "@/components/app/top-app-bar";
import { getRecentSearches } from "@/lib/recent-searches";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/skeletons";

/** Icon-left / label+value-right stat tile skeleton — matches this page's
 *  specific tile shape (different from analytics' icon-top StatCard).
 *  The WHOLE tile (icon chip, label, value) renders as skeleton blocks
 *  while loading, not just the numeric value inside an otherwise-live card. */
function DashStatTileSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-14" />
      </div>
    </div>
  );
}


interface SimpleCandidate {
  id: string;
  fullName: string | null;
  currentTitle: string | null;
  status: string;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [semanticQuery, setSemanticQuery] = useState("");
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [processedCandidates, setProcessedCandidates] = useState(0);
  const [processingCandidates, setProcessingCandidates] = useState(0);
  const [shortlistedCount, setShortlistedCount] = useState(0);
  const [activeCampaignsCount, setActiveCampaignsCount] = useState(0);
  const [blueprintsCount, setBlueprintsCount] = useState(0);
  const [recentCandidates, setRecentCandidates] = useState<SimpleCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  // After a few seconds of loading, tell the user we're waking things up so a
  // cold-start (idle free-tier DB) reads as intentional, not a frozen page.
  const [slowLoad, setSlowLoad] = useState(false);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Recruiter";
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Time-of-day greeting (local time). Avoids hydration mismatch by computing
  // after mount rather than during the initial server render.
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  useEffect(() => {
    if (profile?.tenantId) {
      setRecentSearches(getRecentSearches(profile.tenantId));
    }
  }, [profile?.tenantId]);

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const t = setTimeout(() => setSlowLoad(true), 4000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    // AuthProvider resolves the session/profile on mount too; on a hard refresh
    // both fire at once. Wait for it to settle so this fetch always has a
    // confirmed-valid token instead of racing token hydration and silently
    // stranding the stats at 0 with no retry.
    if (authLoading) return;

    const fetchDashboardData = async () => {
      try {
        // Fire all requests in parallel instead of awaiting each in series.
        // The recent-candidates list (limit=5) already returns `total`, so we
        // reuse it for the Total Candidates stat — one fewer round-trip.
        const [recentRes, processedRes, processingRes, shortlistsRes, campaignsRes, blueprintsRes] =
          await Promise.all([
            api.get<{ candidates: SimpleCandidate[]; total: number }>("/api/candidates?limit=5"),
            api.get<{ total: number }>("/api/candidates?status=ready&limit=1"),
            api.get<{ total: number }>("/api/candidates?status=processing&limit=1"),
            api.get<{ shortlists: any[] }>("/api/shortlists"),
            api.get<{ campaigns: any[] }>("/api/automated-campaigns"),
            api.get<{ blueprints: any[] }>("/api/blueprints"),
          ]);

        setTotalCandidates(recentRes.total);
        setRecentCandidates(recentRes.candidates);
        setProcessedCandidates(processedRes.total);
        setProcessingCandidates(processingRes.total);

        const totalShortlisted = shortlistsRes.shortlists.reduce(
          (acc: number, curr: any) => acc + curr.candidateCount,
          0,
        );
        setShortlistedCount(totalShortlisted);
        setActiveCampaignsCount(
          campaignsRes.campaigns.filter((c: any) => c.status === "active").length,
        );
        setBlueprintsCount(blueprintsRes.blueprints.length);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [authLoading]);

  const formatUploadedDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Just now";
    }
  };

  const handleSemanticSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (semanticQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(semanticQuery.trim())}`);
    }
  };

  const uploadColumns: DataTableColumn<SimpleCandidate>[] = [
    {
      key: "name",
      header: "Candidate Name",
      render: (c) => (
        <span className="font-body-md text-body-md text-on-surface font-medium">
          {c.fullName || "Unnamed Draft"}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role Parsed",
      render: (c) => (
        <span className="font-body-md text-body-md text-on-surface-variant">
          {c.currentTitle || "Not Parsed Yet"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date Uploaded",
      render: (c) => (
        <span className="font-data-mono text-data-mono text-on-surface-variant">
          {formatUploadedDate(c.createdAt)}
        </span>
      ),
    },
    {
      key: "status",
      header: "AI Status",
      render: (c) =>
        c.status === "ready" ? (
          <StatusBadge tone="active">Parsed</StatusBadge>
        ) : c.status === "processing" ? (
          <StatusBadge tone="invited">In Progress</StatusBadge>
        ) : (
          <StatusBadge tone="error">Error</StatusBadge>
        ),
    },
  ];

  return (
    <AppShell>
      {/* Main Content Area */}
      <div className="min-h-screen flex flex-col relative">
        {/* TopAppBar */}
        <TopAppBar
          leftContent={
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const target = e.currentTarget as HTMLFormElement;
                const input = target.querySelector("input") as HTMLInputElement;
                if (input.value.trim()) {
                  router.push(`/search?q=${encodeURIComponent(input.value.trim())}`);
                } else {
                  router.push("/search");
                }
              }}
              className="w-full"
            >
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input className="w-full pl-10 pr-4 py-2 bg-surface-white border border-border-low-alpha rounded-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Search across organization..." type="text" />
              </div>
            </form>
          }
          rightContent={
            <Button asChild variant="gradient" className="whitespace-nowrap">
              <Link href="/upload">+ Upload résumés</Link>
            </Button>
          }
        />
        {/* Main Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto w-full">
          {/* Greeting Section */}
          <Card className="mb-6 [--card-spacing:--spacing(5)]">
            <CardContent>
              <h1 className="font-headline-lg text-headline-lg text-primary mb-2">{greeting}, {displayName}.</h1>
              <p className="font-body-lg text-body-lg text-text-muted">Here is the latest intelligence on your recruitment pipeline.</p>
              {slowLoad && (
                <p className="mt-3 flex items-center gap-2 font-body-md text-body-md text-text-muted">
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  Waking things up — this can take a moment on the first visit of the day.
                </p>
              )}
            </CardContent>
          </Card>
          {/* Semantic Search Bar (Central) */}
          <section className="mb-6">
            <form onSubmit={handleSemanticSearchSubmit}>
              <Card className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0 p-2 focus-within:border-primary transition-colors">
                <div className="hidden sm:flex sm:items-center sm:justify-center h-10 w-10 ml-1 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed">
                  <span className="material-symbols-outlined text-[22px]">robot_2</span>
                </div>
                <input value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} className="flex-1 bg-transparent border-none py-3 px-2 font-body-lg text-body-lg text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-0" placeholder="Try semantic search: 'Senior Python developers in Berlin with FinTech experience...'" type="text" />
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  className="justify-center bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed-dim active:scale-[0.97]"
                >
                  <span className="material-symbols-outlined text-[20px]">magic_button</span>
                  Find Candidates
                </Button>
              </Card>
            </form>
          </section>
          {/* Quick Actions */}
          <section className="mb-6">
            <p className="mb-2 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Quick actions
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { href: "/upload", icon: "upload_file", label: "Upload résumés" },
                { href: "/search", icon: "search", label: "Search candidates" },
                { href: "/blueprints/new", icon: "description", label: "New blueprint" },
                { href: "/automated-outreach/new", icon: "auto_awesome", label: "New campaign" },
              ].map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card className="h-full [--card-spacing:--spacing(5)] hover:border-primary-container/40 hover:bg-primary-container/[0.04] transition-colors">
                    <CardContent className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container">
                        <span className="material-symbols-outlined text-[24px]">{action.icon}</span>
                      </div>
                      <span className="font-body-md text-[15px] text-on-surface font-semibold">{action.label}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
          {/* Stat Cards — candidate pipeline */}
          <section className="mb-6">
            <p className="mb-2 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Candidate pipeline
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Candidates */}
              <Card className="h-full [--card-spacing:--spacing(4)]">
                <CardContent>
                  {loading ? (
                    <DashStatTileSkeleton />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                        <span className="material-symbols-outlined text-[20px]">folder_shared</span>
                      </div>
                      <div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Total Candidates</p>
                        <p className="font-data-mono text-headline-lg text-primary tracking-tight">
                          {totalCandidates.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* Processed Resumes */}
              <Card className="h-full [--card-spacing:--spacing(4)]">
                <CardContent>
                  {loading ? (
                    <DashStatTileSkeleton />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                        <span className="material-symbols-outlined text-[20px]">document_scanner</span>
                      </div>
                      <div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Parsed / Ready</p>
                        <p className="font-data-mono text-headline-lg text-primary tracking-tight">
                          {processedCandidates.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* In Processing */}
              <Card className="h-full [--card-spacing:--spacing(4)]">
                <CardContent>
                  {loading ? (
                    <DashStatTileSkeleton />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                        <span className="material-symbols-outlined text-[20px]">hourglass_top</span>
                      </div>
                      <div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Processing</p>
                        <p className="font-data-mono text-headline-lg text-primary tracking-tight">
                          {processingCandidates.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* Shortlisted */}
              <Card className="h-full [--card-spacing:--spacing(4)]">
                <CardContent>
                  {loading ? (
                    <DashStatTileSkeleton />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                        <span className="material-symbols-outlined text-[20px]" data-weight="fill">star</span>
                      </div>
                      <div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Shortlisted</p>
                        <p className="font-data-mono text-headline-lg text-primary tracking-tight">{shortlistedCount.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
          {/* Stat Cards — outreach activity */}
          <section className="mb-6">
            <p className="mb-2 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Outreach activity
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link href="/automated-outreach">
                <Card className="h-full [--card-spacing:--spacing(4)] hover:border-primary-container/40 transition-colors">
                  <CardContent>
                    {loading ? (
                      <DashStatTileSkeleton />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                          <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                        </div>
                        <div>
                          <p className="font-label-md text-label-md text-on-surface-variant">Active Campaigns</p>
                          <p className="font-data-mono text-headline-lg text-primary tracking-tight">
                            {activeCampaignsCount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
              <Link href="/blueprints">
                <Card className="h-full [--card-spacing:--spacing(4)] hover:border-primary-container/40 transition-colors">
                  <CardContent>
                    {loading ? (
                      <DashStatTileSkeleton />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                          <span className="material-symbols-outlined text-[20px]">description</span>
                        </div>
                        <div>
                          <p className="font-label-md text-label-md text-on-surface-variant">Blueprints</p>
                          <p className="font-data-mono text-headline-lg text-primary tracking-tight">
                            {blueprintsCount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>
          {/* Tables Section (Asymmetric Split) */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Uploads (Takes up 2 columns) */}
            <Card className="lg:col-span-2 h-full flex flex-col overflow-hidden">
              <CardHeader className="border-b border-border-low-alpha">
                <CardTitle className="font-body-md font-semibold text-headline-md text-primary">Recent Uploads</CardTitle>
                <CardAction>
                  <Link className="font-label-md text-label-md text-primary hover:underline" href="/candidates">View All</Link>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <TableSkeleton rows={4} columns={2} withAvatar={false} />
                ) : (
                  <DataTable
                    columns={uploadColumns}
                    rows={recentCandidates}
                    getRowKey={(c) => c.id}
                    onRowClick={(c) => router.push(`/candidates/${c.id}`)}
                    emptyState={
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        No candidates found. Upload some résumés to get started!
                      </span>
                    }
                  />
                )}
              </CardContent>
            </Card>
            {/* Recent Searches (Takes 1 column) */}
            <Card className="lg:col-span-1 h-full flex flex-col overflow-hidden">
              <CardHeader className="border-b border-border-low-alpha">
                <CardTitle className="font-body-md font-semibold text-headline-md text-primary">Recent Searches</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-4 space-y-2">
                {recentSearches.length > 0 ? (
                  recentSearches.map((searchQuery, index) => (
                    <button
                      key={index}
                      onClick={() => router.push(`/search?q=${encodeURIComponent(searchQuery)}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                        <span className="material-symbols-outlined text-[18px]">history</span>
                      </div>
                      <span className="font-body-md text-on-surface truncate flex-1">{searchQuery}</span>
                      <span className="material-symbols-outlined text-outline-variant text-[16px]">chevron_right</span>
                    </button>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full min-h-[150px]">
                    <p className="font-body-md text-text-muted">No recent searches yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
