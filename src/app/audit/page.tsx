"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { TopAppBar } from "@/components/app/top-app-bar";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeletons";

const FETCH_BATCH = 100;

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [member, setMember] = useState("All Members");
  const [action, setAction] = useState("All Actions");
  const [date, setDate] = useState("All Dates");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get<{ logs: any[]; total: number }>(
          `/api/audit?limit=${FETCH_BATCH}&offset=0`,
        );
        setLogs(res.logs);
        setTotalCount(res.total);
      } catch (err: any) {
        toast.error(err.message || "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await api.get<{ logs: any[]; total: number }>(
        `/api/audit?limit=${FETCH_BATCH}&offset=${logs.length}`,
      );
      setLogs((prev) => [...prev, ...res.logs]);
      setTotalCount(res.total);
    } catch (err: any) {
      toast.error(err.message || "Failed to load more audit logs");
    } finally {
      setLoadingMore(false);
    }
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const formattedTime = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" });
    return `${formattedDate} · ${formattedTime}`;
  };

  const actionTone = (action: string): NonNullable<StatusBadgeProps["tone"]> => {
    const act = action.toLowerCase();
    if (act.includes("delete") || act.includes("remove") || act.includes("cancel")) {
      return "error";
    }
    if (act.includes("create") || act.includes("invite") || act.includes("add") || act.includes("upload")) {
      return "active";
    }
    return "brass";
  };

  const getInitials = (email: string | null) => {
    if (!email) return "SY";
    return email.split("@")[0].slice(0, 2).toUpperCase();
  };

  const getMemberName = (email: string | null) => {
    if (!email) return "System / Stripe";
    const part = email.split("@")[0];
    return part
      .split(/[._-]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  };

  const getTargetText = (entry: any) => {
    if (entry.targetType === "candidate") {
      return `Candidate (ID: ${entry.targetId?.slice(0, 8) || "unknown"})`;
    }
    if (entry.targetType === "user") {
      return `User (ID: ${entry.targetId?.slice(0, 8) || "unknown"})`;
    }
    if (entry.action === "team.invite") {
      return `Invited User`;
    }
    if (entry.metadata && typeof entry.metadata === "object") {
      if (entry.metadata.plan) return `Plan: ${entry.metadata.plan}`;
      if (entry.metadata.fields) return `Fields: ${entry.metadata.fields.join(", ")}`;
    }
    return entry.targetType ? `${entry.targetType} (${entry.targetId?.slice(0, 8)})` : "System";
  };

  /** Real client IP recorded at audit-write time; older rows predate capture. */
  const getIpAddress = (entry: any) => {
    if (!entry.actorEmail) return "System";
    return entry.metadata?.ip || "—";
  };

  const getAvatarWrapper = (role: string | null) => {
    if (role === "admin") return "bg-secondary-fixed text-on-secondary-fixed";
    if (role === "recruiter") return "bg-primary-fixed text-on-primary-fixed";
    return "bg-surface-container-high text-primary";
  };

  const membersList = ["All Members", ...Array.from(new Set(logs.map((e) => getMemberName(e.actorEmail))))];
  const actionsList = ["All Actions", ...Array.from(new Set(logs.map((e) => e.action)))];
  const datesList = ["All Dates", ...Array.from(new Set(logs.map((e) => new Date(e.createdAt).toLocaleDateString("en-US"))))];

  const filtered = logs.filter((entry) => {
    const formattedDate = new Date(entry.createdAt).toLocaleDateString("en-US");
    const name = getMemberName(entry.actorEmail);

    const matchesQuery =
      query.trim() === "" ||
      [entry.action, name, entry.actorEmail, entry.targetType, entry.targetId]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase());

    const matchesMember = member === "All Members" || name === member;
    const matchesAction = action === "All Actions" || entry.action === action;
    const matchesDate = date === "All Dates" || formattedDate === date;

    return matchesQuery && matchesMember && matchesAction && matchesDate;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [query, member, action, date]);

  const logColumns: DataTableColumn<any>[] = [
    {
      key: "time",
      header: "Time (UTC)",
      headerClassName: "uppercase tracking-widest text-[11px] text-text-muted",
      render: (entry) => (
        <span className="font-data-mono text-[13px] text-text-muted">{formatTimestamp(entry.createdAt)}</span>
      ),
    },
    {
      key: "member",
      header: "Member",
      headerClassName: "uppercase tracking-widest text-[11px] text-text-muted",
      render: (entry) => (
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-full ${getAvatarWrapper(entry.actorRole)} flex items-center justify-center font-bold text-[10px]`}>
            {getInitials(entry.actorEmail)}
          </div>
          <span className="font-label-md text-on-surface">{getMemberName(entry.actorEmail)}</span>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      headerClassName: "uppercase tracking-widest text-[11px] text-text-muted",
      render: (entry) => (
        <StatusBadge tone={actionTone(entry.action)} dot={false}>
          {entry.action}
        </StatusBadge>
      ),
    },
    {
      key: "target",
      header: "Target",
      headerClassName: "uppercase tracking-widest text-[11px] text-text-muted",
      render: (entry) => <span className="font-label-md text-on-surface">{getTargetText(entry)}</span>,
    },
    {
      key: "ip",
      header: "IP Address",
      headerClassName: "uppercase tracking-widest text-[11px] text-text-muted",
      render: (entry) => <span className="font-data-mono text-[13px] text-text-muted">{getIpAddress(entry)}</span>,
    },
  ];

  return (
    <AppShell>
      {/* Main Wrapper */}
      <div className="min-h-screen flex flex-col">
        {/* TopAppBar */}
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-4">
              <nav className="flex items-center gap-2 text-on-surface-variant font-label-md">
                <Link href="/settings" className="hover:text-primary cursor-pointer">Settings</Link>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                <span className="text-primary font-semibold">Audit log</span>
              </nav>
            </div>
          }
          rightContent={
            <div className="relative group w-full sm:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">search</span>
              <input
                className="bg-surface-container-low border-none rounded-full pl-10 pr-4 py-2 text-label-md w-full focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="Search logs..."
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          }
        />
        {/* Page Content — no page-local sub-nav: General/Members/Billing/
            Security/Audit log all already live in the main app sidebar, so a
            second copy here was pure redundant width (256px + gap) that
            pushed the whole page wider than it needed to be. */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto w-full">
          <div className="space-y-8">
            {/* Header */}
            <section className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container">
                <span className="material-symbols-outlined text-[24px]">history_edu</span>
              </div>
              <div>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-1">Audit log</h1>
                <p className="font-body-md text-text-muted">Every sensitive action, recorded and secured for compliance and oversight.</p>
              </div>
            </section>
            {/* Filter Toolbar */}
            <Card className="[--card-spacing:--spacing(4)]">
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Date Filter */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-primary">calendar_today</span>
                    <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={date} onChange={(e) => setDate(e.target.value)}>
                      {datesList.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  {/* Member Dropdown */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-secondary">person</span>
                    <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={member} onChange={(e) => setMember(e.target.value)}>
                      {membersList.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  {/* Action Filter */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-tertiary-fixed-dim">filter_list</span>
                    <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={action} onChange={(e) => setAction(e.target.value)}>
                      {actionsList.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Data Table */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {loading ? (
                  <TableSkeleton rows={6} columns={3} withAvatar />
                ) : (
                  <DataTable
                    columns={logColumns}
                    rows={paginated}
                    getRowKey={(entry) => entry.id}
                    emptyState={
                      <div className="flex flex-col items-center gap-3 text-text-muted">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-highest text-text-muted">
                          <span className="material-symbols-outlined text-[28px]">search_off</span>
                        </div>
                        <p className="font-label-md">No audit entries match your filters.</p>
                      </div>
                    }
                  />
                )}
              </CardContent>
              {/* Pagination */}
              {!loading && filtered.length > 0 && (
                <div className="px-6 py-4 border-t border-border-low-alpha bg-surface-white flex flex-wrap items-center justify-between gap-3">
                  <span className="font-body-md text-[13px] text-on-surface-variant">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                    {filtered.length !== logs.length ? ` (filtered from ${logs.length})` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      aria-label="Previous page"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant={p === currentPage ? "gradient" : "outline"}
                        size="icon-sm"
                        onClick={() => setPage(p)}
                        aria-current={p === currentPage ? "page" : undefined}
                      >
                        {p}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      aria-label="Next page"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </Button>
                  </div>
                </div>
              )}
              {!loading && logs.length < totalCount && currentPage >= totalPages && (
                <div className="px-6 py-4 border-t border-border-low-alpha bg-surface-white flex justify-center">
                  <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore && <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>}
                    {loadingMore ? "Loading…" : `Load more (${totalCount - logs.length} remaining)`}
                  </Button>
                </div>
              )}
            </Card>
            {/* Footer Section Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                      <span className="material-symbols-outlined text-[20px]">verified_user</span>
                    </div>
                    <div>
                      <h4 className="font-label-md text-primary font-bold mb-1">Retention Policy</h4>
                      <p className="text-[13px] text-on-surface-variant leading-relaxed">Audit logs are retained for 365 days for Enterprise accounts. After this period, logs are archived in encrypted cold storage and can be requested through security support.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
                      <span className="material-symbols-outlined text-[20px]">security</span>
                    </div>
                    <div>
                      <h4 className="font-label-md text-secondary font-bold mb-1">Compliance &amp; Auditing</h4>
                      <p className="text-[13px] text-on-surface-variant leading-relaxed">Candidate record changes, billing and plan updates, team invites and removals, and outreach campaign actions are all recorded here with who did it and when, so you always have a record for internal review.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
        {/* Global Footer */}
        <footer className="mt-auto w-full py-12 px-4 sm:px-6 lg:px-12 border-t border-border-low-alpha bg-bg-cream">
          <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
            <div>
              <h3 className="font-headline-md text-primary text-[24px]">TalScout</h3>
              <p className="font-label-md text-text-muted mt-2">© {new Date().getFullYear()} TalScout AI. All rights reserved.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
              <div className="flex flex-col gap-3">
                <span className="font-label-md font-bold text-primary">Product</span>
                <Link className="text-label-md text-on-surface-variant hover:text-secondary transition-colors" href="/audit">Audit logs</Link>
                <Link className="text-label-md text-on-surface-variant hover:text-secondary transition-colors" href="/#pricing">API Access</Link>
              </div>
              <div className="flex flex-col gap-3">
                <span className="font-label-md font-bold text-primary">Legal</span>
                <Link className="text-label-md text-on-surface-variant hover:text-secondary transition-colors" href="/privacy">Privacy Policy</Link>
                <Link className="text-label-md text-on-surface-variant hover:text-secondary transition-colors" href="/terms">Terms of Service</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
