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
import { TableSkeleton } from "@/components/ui/skeletons";

interface SimpleCandidate {
  id: string;
  fullName: string | null;
  currentTitle: string | null;
  status: string;
  createdAt: string;
}

interface ShortlistSummary {
  candidateCount: number;
}

interface CampaignSummary {
  status: string;
}

interface BlueprintSummary {
  id: string;
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
  const hasWorkspaceActivity =
    totalCandidates > 0 ||
    activeCampaignsCount > 0 ||
    blueprintsCount > 0 ||
    recentSearches.length > 0;
  const readyPercent = totalCandidates > 0
    ? Math.min(100, (processedCandidates / totalCandidates) * 100)
    : 0;
  const processingPercent = totalCandidates > 0
    ? Math.min(100 - readyPercent, (processingCandidates / totalCandidates) * 100)
    : 0;
  const pipelineChart = totalCandidates > 0
    ? `conic-gradient(
        var(--color-primary-container) 0 ${readyPercent}%,
        var(--color-primary-fixed-dim) ${readyPercent}% ${readyPercent + processingPercent}%,
        var(--color-surface-container-high) ${readyPercent + processingPercent}% 100%
      )`
    : "conic-gradient(var(--color-surface-container-high) 0 100%)";

  // Time-of-day greeting (local time). Avoids hydration mismatch by computing
  // after mount rather than during the initial server render.
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  useEffect(() => {
    if (!profile?.tenantId) return;
    const tenantId = profile.tenantId;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setRecentSearches(getRecentSearches(tenantId));
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.tenantId]);

  useEffect(() => {
    if (!loading) return;
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
            api.get<{ shortlists: ShortlistSummary[] }>("/api/shortlists"),
            api.get<{ campaigns: CampaignSummary[] }>("/api/automated-campaigns"),
            api.get<{ blueprints: BlueprintSummary[] }>("/api/blueprints"),
          ]);

        setTotalCandidates(recentRes.total);
        setRecentCandidates(recentRes.candidates);
        setProcessedCandidates(processedRes.total);
        setProcessingCandidates(processingRes.total);

        const totalShortlisted = shortlistsRes.shortlists.reduce(
          (acc, curr) => acc + curr.candidateCount,
          0,
        );
        setShortlistedCount(totalShortlisted);
        setActiveCampaignsCount(
          campaignsRes.campaigns.filter((campaign) => campaign.status === "active").length,
        );
        setBlueprintsCount(blueprintsRes.blueprints.length);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setSlowLoad(false);
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
      <div className="relative flex min-h-dvh min-w-0 flex-col">
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
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                <input className="h-10 w-full rounded-xl border border-border-low-alpha bg-surface-white pl-10 pr-4 font-body-md text-[14px] text-on-surface shadow-[0_1px_2px_rgba(15,23,42,0.025)] placeholder:text-text-muted focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all" placeholder="Search candidates, skills or locations..." type="text" aria-label="Search candidates, skills or locations" />
              </div>
            </form>
          }
          rightContent={
            <Button asChild variant="gradient" className="h-10 whitespace-nowrap rounded-xl px-4">
              <Link href="/upload">
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                Upload résumés
              </Link>
            </Button>
          }
        />
        {/* Main Canvas */}
        <main className="mx-auto w-full max-w-[1380px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Greeting Section */}
          <section className="mb-7 flex min-h-[78px] items-center">
            <div>
              <p className="mb-1 font-label-md text-[12px] font-semibold uppercase tracking-[0.12em] text-primary">
                Recruitment overview
              </p>
              <h1 className="font-body-md text-[26px] font-semibold leading-tight tracking-[-0.025em] text-on-surface sm:text-[30px]">
                {greeting}, {displayName}
              </h1>
              <p className="mt-2 font-body-md text-[15px] text-text-muted">
                A clear view of your candidate pipeline and outreach activity.
              </p>
              {slowLoad && (
                <p className="mt-3 flex items-center gap-2 font-body-md text-[13px] text-text-muted">
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  Waking things up — this can take a moment on the first visit of the day.
                </p>
              )}
            </div>
          </section>
          {/* Semantic Search Bar (Central) */}
          <section className="mb-6">
            <form onSubmit={handleSemanticSearchSubmit}>
              <Card className="flex flex-col items-stretch gap-2 border-primary/15 p-2 shadow-[0_8px_28px_-18px_rgba(15,118,110,0.5)] focus-within:border-primary/45 sm:flex-row sm:items-center sm:gap-0">
                <div className="ml-1 hidden h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed sm:flex">
                  <span className="material-symbols-outlined text-[21px]">travel_explore</span>
                </div>
                <input value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} className="min-w-0 flex-1 border-none bg-transparent px-3 py-3 font-body-md text-[15px] text-on-surface placeholder:text-text-muted focus:outline-none focus:ring-0" placeholder="Describe the candidate you need — e.g. Senior Python engineer in Berlin..." type="text" aria-label="Semantic candidate search" />
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  className="justify-center rounded-xl bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[19px]">search</span>
                  Find Candidates
                </Button>
              </Card>
            </form>
          </section>
          {/* Consolidated overview */}
          <section className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="flex flex-col overflow-hidden">
              <CardHeader className="border-b border-border-low-alpha">
                <div>
                  <CardTitle className="font-body-md text-[16px] font-semibold text-on-surface">
                    Candidate pipeline
                  </CardTitle>
                  <p className="mt-1 text-[13px] text-text-muted">
                    A simple view of how your candidate database is progressing.
                  </p>
                </div>
                {totalCandidates > 0 && (
                  <CardAction>
                    <Link className="text-[13px] font-medium text-primary hover:underline" href="/candidates">
                      View candidates
                    </Link>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="p-6 sm:p-8">
                {loading ? (
                  <div className="grid animate-pulse items-center gap-8 sm:grid-cols-[180px_1fr]">
                    <div className="mx-auto size-40 rounded-full bg-surface-container-high" />
                    <div className="space-y-4">
                      <div className="h-11 rounded-xl bg-surface-container-high" />
                      <div className="h-11 rounded-xl bg-surface-container-high" />
                      <div className="h-11 rounded-xl bg-surface-container-high" />
                    </div>
                  </div>
                ) : (
                  <div className="grid items-center gap-8 sm:grid-cols-[180px_1fr]">
                    <div
                      className="relative mx-auto flex size-40 items-center justify-center rounded-full"
                      style={{ background: pipelineChart }}
                      role="img"
                      aria-label={`${totalCandidates} total candidates: ${processedCandidates} ready, ${processingCandidates} processing`}
                    >
                      <div className="flex size-[116px] flex-col items-center justify-center rounded-full border border-border-low-alpha bg-surface-white shadow-ambient">
                        <span className="text-[38px] font-semibold leading-none tracking-[-0.04em] text-on-surface">
                          {totalCandidates.toLocaleString()}
                        </span>
                        <span className="mt-2 text-[11px] font-medium uppercase tracking-[0.1em] text-text-muted">
                          Candidates
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="divide-y divide-border-low-alpha">
                        {[
                          {
                            label: "Ready",
                            value: processedCandidates,
                            color: "bg-primary-container",
                          },
                          {
                            label: "Processing",
                            value: processingCandidates,
                            color: "bg-primary-fixed-dim",
                          },
                          {
                            label: "Shortlisted",
                            value: shortlistedCount,
                            color: "bg-surface-container-highest",
                          },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                            <span className={`size-2.5 rounded-full ${item.color}`} />
                            <span className="flex-1 text-[14px] text-on-surface-variant">{item.label}</span>
                            <span className="text-[17px] font-semibold tabular-nums text-on-surface">
                              {item.value.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                      {totalCandidates === 0 && (
                        <div className="mt-6 border-t border-border-low-alpha pt-5">
                          <p className="text-[13px] leading-6 text-text-muted">
                            Your pipeline will appear here after your first résumé is processed.
                          </p>
                          <Button asChild className="mt-4 rounded-xl bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary">
                            <Link href="/upload">
                              <span className="material-symbols-outlined text-[18px]">upload_file</span>
                              Upload your first résumé
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border-low-alpha">
                <div>
                  <CardTitle className="font-body-md text-[16px] font-semibold text-on-surface">
                    {hasWorkspaceActivity ? "Outreach" : "Getting started"}
                  </CardTitle>
                  <p className="mt-1 text-[13px] text-text-muted">
                    {hasWorkspaceActivity ? "Your reusable outreach setup." : "Three steps to your first shortlist."}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-6">
                {loading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-16 rounded-xl bg-surface-container-high" />
                    <div className="h-16 rounded-xl bg-surface-container-high" />
                    <div className="h-16 rounded-xl bg-surface-container-high" />
                  </div>
                ) : hasWorkspaceActivity ? (
                  <div className="divide-y divide-border-low-alpha">
                    <Link href="/automated-outreach" className="group flex items-center gap-4 py-4 first:pt-0">
                      <span className="material-symbols-outlined text-[21px] text-primary">auto_awesome</span>
                      <span className="flex-1 text-[14px] text-on-surface-variant">Active campaigns</span>
                      <span className="text-[22px] font-semibold tabular-nums text-on-surface">{activeCampaignsCount}</span>
                      <span className="material-symbols-outlined text-[17px] text-outline transition-transform group-hover:translate-x-0.5">chevron_right</span>
                    </Link>
                    <Link href="/blueprints" className="group flex items-center gap-4 py-4 last:pb-0">
                      <span className="material-symbols-outlined text-[21px] text-primary">description</span>
                      <span className="flex-1 text-[14px] text-on-surface-variant">Blueprints</span>
                      <span className="text-[22px] font-semibold tabular-nums text-on-surface">{blueprintsCount}</span>
                      <span className="material-symbols-outlined text-[17px] text-outline transition-transform group-hover:translate-x-0.5">chevron_right</span>
                    </Link>
                  </div>
                ) : (
                  <div className="flex h-full flex-col">
                    <div className="mb-6">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                        <span>Workspace setup</span>
                        <span>0 of 3 complete</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                        <div className="h-full w-0 rounded-full bg-primary-container" />
                      </div>
                    </div>
                    <ol className="space-y-5">
                      {[
                        ["Upload résumés", "Build your searchable candidate database.", "/upload"],
                        ["Review profiles", "Confirm parsed details and shortlist the best.", "/candidates"],
                        ["Start outreach", "Create a reusable message blueprint.", "/blueprints/new"],
                      ].map(([title, description, href], index) => (
                        <li key={title} className="flex gap-4">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-outline-variant text-[12px] font-semibold text-primary">
                            {index + 1}
                          </span>
                          <div>
                            <Link href={href} className="text-[14px] font-semibold text-on-surface hover:text-primary">
                              {title}
                            </Link>
                            <p className="mt-1 text-[12px] leading-5 text-text-muted">{description}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <Button asChild className="mt-7 w-full rounded-xl bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary">
                      <Link href="/upload">
                        Start with an upload
                        <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
          {!loading && !hasWorkspaceActivity && (
            <section className="mb-6">
              <Card className="overflow-hidden bg-surface-container-low/45">
                <CardContent className="grid gap-7 p-6 sm:p-7 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                      What happens next
                    </p>
                    <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-on-surface">
                      One upload creates a usable recruiting workflow.
                    </h2>
                    <p className="mt-2 max-w-md text-[13px] leading-6 text-text-muted">
                      TalScout structures the résumé first, then keeps every decision reviewable by your team.
                    </p>
                  </div>
                  <ol className="grid gap-5 sm:grid-cols-4">
                    {[
                      ["document_scanner", "Parse", "Extract candidate data"],
                      ["fact_check", "Review", "Confirm the profile"],
                      ["manage_search", "Discover", "Search and shortlist"],
                      ["send", "Reach out", "Start a conversation"],
                    ].map(([icon, title, detail], index) => (
                      <li key={title} className="relative">
                        <div className="flex items-center gap-3 sm:block">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed">
                            <span className="material-symbols-outlined text-[19px]">{icon}</span>
                          </span>
                          <div className="sm:mt-3">
                            <p className="text-[13px] font-semibold text-on-surface">
                              <span className="mr-1 text-text-muted">{index + 1}.</span>
                              {title}
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-text-muted">{detail}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </section>
          )}
          {/* Tables Section (Asymmetric Split) */}
          {(loading || hasWorkspaceActivity) && (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Recent Uploads (Takes up 2 columns) */}
            <Card className="h-full flex flex-col overflow-hidden xl:col-span-2">
              <CardHeader className="border-b border-border-low-alpha">
                <CardTitle className="font-body-md text-[15px] font-semibold text-on-surface">Recent candidates</CardTitle>
                <CardAction>
                  <Link className="font-label-md text-[13px] font-medium text-primary hover:underline" href="/candidates">View all</Link>
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
            <Card className="h-full flex flex-col overflow-hidden xl:col-span-1">
              <CardHeader className="border-b border-border-low-alpha">
                <CardTitle className="font-body-md text-[15px] font-semibold text-on-surface">Recent searches</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow p-4 space-y-2">
                {recentSearches.length > 0 ? (
                  recentSearches.map((searchQuery, index) => (
                    <button
                      key={index}
                      onClick={() => router.push(`/search?q=${encodeURIComponent(searchQuery)}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed">
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
          )}
        </main>
      </div>
    </AppShell>
  );
}
