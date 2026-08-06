"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { TopAppBar } from "@/components/app/top-app-bar";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableSkeleton } from "@/components/ui/skeletons";


interface ApiCandidate {
  id: string;
  fullName: string | null;
  emails: string[] | null;
  currentTitle: string | null;
  location: string | null;
  yearsExperience: string | null;
  skills: string[] | null;
  status: "ready" | "processing" | "error";
  createdAt: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  title: string;
  location: string;
  experience: number;
  expLabel: string;
  skills: string[];
  status: "Ready" | "Processing" | "Error";
  initials: string;
}

const SKILL_PLAIN =
  "rounded bg-surface-container text-on-surface-variant border-border-low-alpha font-label-md text-[12px]";
const SKILL_SECONDARY =
  "rounded bg-secondary-container/20 text-on-secondary-container border-secondary-container/30 font-label-md text-[12px]";
const SKILL_TERTIARY =
  "rounded bg-tertiary-fixed/40 text-on-tertiary-fixed-variant border-tertiary-fixed font-label-md text-[12px]";

const EXPERIENCE_OPTIONS = [
  { label: "All", value: "All" },
  { label: "0–2 yrs", value: "0-2" },
  { label: "3–5 yrs", value: "3-5" },
  { label: "6+ yrs", value: "6+" },
] as const;

function matchesExperience(years: number, range: string): boolean {
  switch (range) {
    case "0-2":
      return years <= 2;
    case "3-5":
      return years >= 3 && years <= 5;
    case "6+":
      return years >= 6;
    default:
      return true;
  }
}

const STATUS_TO_API: Record<string, "ready" | "processing" | "error" | undefined> = {
  Ready: "ready",
  Processing: "processing",
  Error: "error",
};

function CandidateStatusBadge({ status }: { status: Candidate["status"] }) {
  if (status === "Ready") {
    return <StatusBadge tone="active">Ready</StatusBadge>;
  }
  if (status === "Processing") {
    return (
      <StatusBadge tone="invited" dot={false} className="gap-1.5">
        <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
        AI Processing
      </StatusBadge>
    );
  }
  return <StatusBadge tone="error">Error</StatusBadge>;
}

export default function CandidatesPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("All");
  const [experience, setExperience] = useState("All");
  const [roleFilter, setRoleFilter] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Debounce free-text search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Any change to server-side filters returns to the first page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [debouncedQ, status]);

  // Fetch just the current page from the server instead of slurping every
  // candidate on every load/filter change.
  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      const apiStatus = STATUS_TO_API[status];
      if (apiStatus) params.set("status", apiStatus);
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());

      const res = await api.get<{ candidates: ApiCandidate[]; total: number }>(
        `/api/candidates?${params.toString()}`
      );

      const mapped = res.candidates.map((item): Candidate => {
        const name = item.fullName || "Unnamed Candidate";
        const initials = name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "C";

        return {
          id: item.id,
          name,
          email: (item.emails && item.emails[0]) || "no-email@example.com",
          title: item.currentTitle || "Unnamed Role",
          location: item.location || "Unknown",
          experience: item.yearsExperience ? parseFloat(item.yearsExperience) : 0,
          expLabel: item.yearsExperience ? String(Math.round(parseFloat(item.yearsExperience))).padStart(2, "0") : "00",
          skills: item.skills || [],
          status: item.status === "ready" ? "Ready" : item.status === "processing" ? "Processing" : "Error",
          initials,
        };
      });

      setCandidates(mapped);
      setTotalCount(res.total);
    } catch (err: any) {
      toast.error(err.message || "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, debouncedQ]);

  // Parsing runs in a background job, so rows can still be "Processing" right
  // after upload. Poll until none are, instead of leaving stale rows forever.
  useEffect(() => {
    if (!candidates.some((c) => c.status === "Processing")) return;
    const interval = setInterval(() => {
      fetchCandidates();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  // Experience/role are secondary refinements with no server-side filter yet,
  // applied only within the already-fetched page (server owns pagination).
  const paged = candidates.filter((c) => {
    const matchesExp = matchesExperience(c.experience, experience);
    const matchesRole =
      roleFilter === "" ||
      [c.title, ...c.skills].join(" ").toLowerCase().includes(roleFilter.toLowerCase());
    return matchesExp && matchesRole;
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const getSkillBadgeClass = (index: number) => {
    if (index % 3 === 0) return SKILL_SECONDARY;
    if (index % 3 === 1) return SKILL_TERTIARY;
    return SKILL_PLAIN;
  };

  const columns: DataTableColumn<Candidate>[] = [
    {
      key: "candidate",
      header: "Candidate",
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary-container text-on-primary font-headline-md shrink-0">
            {c.initials}
          </div>
          <div>
            <div className="font-label-md text-label-md font-semibold text-primary">{c.name}</div>
            <div className="font-body-md text-[13px] text-on-surface-variant">{c.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (c) => <span className="text-[14px] text-on-surface">{c.title}</span>,
    },
    {
      key: "location",
      header: "Location",
      render: (c) => <span className="text-[14px] text-on-surface-variant">{c.location}</span>,
    },
    {
      key: "experience",
      header: "Exp (Yrs)",
      render: (c) => <span className="font-data-mono text-data-mono text-on-surface">{c.expLabel}</span>,
    },
    {
      key: "skills",
      header: "Top Skills",
      render: (c) => (
        <div className="flex gap-1.5 flex-wrap">
          {c.skills.slice(0, 3).map((skill, i) => (
            <Badge key={skill} variant="outline" className={getSkillBadgeClass(i)}>
              {skill}
            </Badge>
          ))}
          {c.skills.length > 3 && (
            <Badge variant="outline" className={SKILL_PLAIN}>+{c.skills.length - 3}</Badge>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => <CandidateStatusBadge status={c.status} />,
    },
  ];

  return (
    <AppShell>
      <TopAppBar
        leftContent={
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
              className="w-full pl-10 pr-4 py-2 bg-surface-white border border-border-low-alpha rounded-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="Search across candidates, roles..."
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        }
        rightContent={
          <Button asChild variant="gradient" className="whitespace-nowrap">
            <Link href="/upload">+ Upload résumés</Link>
          </Button>
        }
      />

      {/* Main Content Canvas */}
      <main className="p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full min-h-screen">
        <Card className="mb-8 [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
          <CardContent>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container/10 text-primary shrink-0">
                  <span className="material-symbols-outlined text-[22px]">groups</span>
                </div>
                <div>
                  <h1 className="font-headline-lg text-headline-lg text-primary mb-1">Candidates</h1>
                  <p className="font-body-md text-body-md text-on-surface-variant">Review and manage your talent pool. AI analysis is processing new uploads.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Toolbar + Data Canvas */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col items-stretch gap-3 border-b border-border-low-alpha sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex min-w-0 flex-wrap gap-2">
                {roleFilter !== "" && (
                  <button
                    type="button"
                    onClick={() => setRoleFilter("")}
                    className="flex max-w-full items-center gap-1 rounded-full border border-secondary px-3 py-1.5 font-label-md text-[13px] text-secondary transition-colors hover:bg-secondary/5"
                  >
                    <span className="truncate">Role: {roleFilter}</span>
                    <span className="material-symbols-outlined shrink-0 text-[16px]">close</span>
                  </button>
                )}
                <label className="flex min-w-0 flex-1 basis-[calc(50%-0.25rem)] cursor-pointer items-center gap-1 rounded-full border border-border-low-alpha px-3 py-1.5 font-label-md text-[13px] text-on-surface-variant transition-colors hover:bg-bg-cream sm:basis-auto sm:flex-none">
                  <span className="shrink-0">Experience</span>
                  <select
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className="min-w-0 flex-1 cursor-pointer bg-transparent text-right font-label-md text-[13px] text-on-surface-variant outline-none sm:flex-none"
                    aria-label="Filter by experience"
                  >
                    {EXPERIENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1 basis-[calc(50%-0.25rem)] cursor-pointer items-center gap-1 rounded-full border border-border-low-alpha px-3 py-1.5 font-label-md text-[13px] text-on-surface-variant transition-colors hover:bg-bg-cream sm:basis-auto sm:flex-none">
                  <span className="shrink-0">Status</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="min-w-0 flex-1 cursor-pointer bg-transparent text-right font-label-md text-[13px] text-on-surface-variant outline-none sm:flex-none"
                    aria-label="Filter by status"
                  >
                    <option value="All">All</option>
                    <option value="Ready">Ready</option>
                    <option value="Processing">Processing</option>
                    <option value="Error">Error</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <span className="min-w-0 truncate font-label-md text-[13px] text-on-surface-variant">Showing {paged.length} of {totalCount}</span>
              <div className="flex gap-1 border border-border-low-alpha rounded-lg p-1 bg-bg-cream">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  className={
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 " +
                    (view === "list"
                      ? "bg-surface-white text-primary shadow-sm"
                      : "text-on-surface-variant hover:text-primary")
                  }
                >
                  <span className="material-symbols-outlined text-[20px]">view_list</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView("grid")}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                  className={
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 " +
                    (view === "grid"
                      ? "bg-surface-white text-primary shadow-sm"
                      : "text-on-surface-variant hover:text-primary")
                  }
                >
                  <span className="material-symbols-outlined text-[20px]">grid_view</span>
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="overflow-x-auto p-0">
            {loading ? (
              <TableSkeleton rows={6} columns={4} />
            ) : view === "list" ? (
              <DataTable
                columns={columns}
                rows={paged}
                getRowKey={(c) => c.id}
                onRowClick={(c) => router.push(`/candidates/${c.id}`)}
                mobileCard={(c) => (
                  <div className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container font-headline-md text-on-primary">
                          {c.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-label-md text-label-md font-semibold text-primary">
                            {c.name}
                          </div>
                          <div className="truncate font-body-md text-[13px] text-on-surface-variant">
                            {c.email}
                          </div>
                        </div>
                      </div>
                      <CandidateStatusBadge status={c.status} />
                    </div>
                    <div className="space-y-2 rounded-lg bg-surface-container-low/50 p-3">
                      <div className="flex items-start gap-2 font-body-md text-[13px] text-on-surface">
                        <span className="material-symbols-outlined mt-0.5 text-[16px] text-on-surface-variant">
                          work
                        </span>
                        <span className="min-w-0 flex-1">{c.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-body-md text-[13px] text-on-surface-variant">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">location_on</span>
                          <span className="truncate">{c.location}</span>
                        </span>
                        <span className="font-data-mono text-data-mono">{c.expLabel} yrs</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.skills.slice(0, 3).map((skill, i) => (
                        <Badge key={skill} variant="outline" className={getSkillBadgeClass(i)}>
                          {skill}
                        </Badge>
                      ))}
                      {c.skills.length > 3 && (
                        <Badge variant="outline" className={SKILL_PLAIN}>+{c.skills.length - 3}</Badge>
                      )}
                    </div>
                  </div>
                )}
                emptyState={
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    No candidates match your filters.
                  </span>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {paged.map((c) => (
                  <SpotlightCard key={c.id} className="overflow-hidden">
                    <Card
                      className="cursor-pointer [--card-spacing:--spacing(5)]"
                      onClick={() => router.push(`/candidates/${c.id}`)}
                    >
                      <CardContent className="group">
                        <div className="mb-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary-container text-on-primary-container font-headline-md shrink-0">
                            {c.initials}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-label-md text-label-md font-semibold text-primary group-hover:text-tertiary transition-colors">{c.name}</div>
                            <div className="truncate font-body-md text-[13px] text-on-surface-variant">{c.title}</div>
                          </div>
                        </div>
                        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-body-md text-[13px] text-on-surface-variant">
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">location_on</span>
                            {c.location}
                          </span>
                          <span>·</span>
                          <span className="font-data-mono text-data-mono">{c.expLabel} yrs</span>
                        </div>
                        <div className="mb-4 flex flex-wrap gap-1.5">
                          {c.skills.slice(0, 3).map((skill, i) => (
                            <Badge key={skill} variant="outline" className={getSkillBadgeClass(i)}>
                              {skill}
                            </Badge>
                          ))}
                          {c.skills.length > 3 && (
                            <Badge variant="outline" className={SKILL_PLAIN}>+{c.skills.length - 3}</Badge>
                          )}
                        </div>
                        <CandidateStatusBadge status={c.status} />
                      </CardContent>
                    </Card>
                  </SpotlightCard>
                ))}
              </div>
            )}

            {!loading && view === "grid" && paged.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-3">person_search</span>
                <p className="font-body-md text-body-md text-on-surface-variant">No candidates match your filters.</p>
              </div>
            )}

            {/* Server-side pagination — each page button fetches that page from the API */}
            {!loading && paged.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border-low-alpha bg-surface-white px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
                <span className="font-body-md text-[13px] text-on-surface-variant">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
                </span>
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                    className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  {(() => {
                    const windowSize = 5;
                    const half = Math.floor(windowSize / 2);
                    let start = Math.max(1, currentPage - half);
                    const end = Math.min(totalPages, start + windowSize - 1);
                    start = Math.max(1, end - windowSize + 1);
                    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
                  })().map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === currentPage ? "page" : undefined}
                      className={
                        "w-8 h-8 rounded font-label-md text-[13px] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 " +
                        (p === currentPage
                          ? "bg-primary-container text-on-primary-container"
                          : "border border-border-low-alpha text-on-surface-variant hover:bg-bg-cream")
                      }
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    aria-label="Next page"
                    className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
