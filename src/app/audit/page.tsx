"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { TopAppBar } from "@/components/app/top-app-bar";

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

  const formatPill = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes("delete") || act.includes("remove") || act.includes("cancel")) {
      return "bg-error-container/40 text-on-error-container";
    }
    if (act.includes("create") || act.includes("invite") || act.includes("add") || act.includes("upload")) {
      return "bg-tertiary-fixed text-on-tertiary-fixed";
    }
    return "brass-badge";
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
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">search</span>
              <input
                className="bg-surface-container-low border-none rounded-full pl-10 pr-4 py-2 text-label-md w-64 focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="Search logs..."
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          }
        />
        {/* Page Content */}
        <main className="flex-1 flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-8 max-w-[1440px] mx-auto w-full">
          {/* Sub-navigation Sidebar */}
          <nav className="w-full lg:w-64 flex-shrink-0 space-y-1">
            <h3 className="px-4 text-[12px] font-bold text-text-muted uppercase tracking-wider mb-4">Account Settings</h3>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/settings">General</Link>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/team">Members</Link>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/billing">Billing</Link>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/security">Security</Link>
            <Link className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary-container to-primary text-on-primary font-semibold shadow-floating rounded-lg font-label-md" href="/audit">Audit log</Link>
          </nav>
          {/* Main Dashboard Area */}
          <div className="min-w-0 flex-1 space-y-8">
            {/* Header */}
            <section className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-container to-primary text-on-primary shadow-floating">
                <span className="material-symbols-outlined text-[24px]">history_edu</span>
              </div>
              <div>
                <h2 className="font-headline-lg text-gradient-teal mb-1">Audit log</h2>
                <p className="font-body-md text-text-muted">Every sensitive action, recorded and secured for compliance and oversight.</p>
              </div>
            </section>
            {/* Filter Toolbar */}
            <div className="glass-card p-4 rounded-lg flex flex-wrap items-center justify-between gap-4">
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
            </div>
            {/* Data Table */}
            <div className="glass-card rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="py-16 text-center flex flex-col items-center gap-3 text-text-muted">
                    <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                    <p className="font-label-md">Loading audit entries...</p>
                  </div>
                ) : (
                  <table className="w-full min-w-[640px] text-left border-collapse">
                    <thead>
                      <tr className="bg-bg-cream/50 border-b border-border-low-alpha">
                        <th className="px-6 py-4 font-label-md text-text-muted uppercase tracking-widest text-[11px]">Time (UTC)</th>
                        <th className="px-6 py-4 font-label-md text-text-muted uppercase tracking-widest text-[11px]">Member</th>
                        <th className="px-6 py-4 font-label-md text-text-muted uppercase tracking-widest text-[11px]">Action</th>
                        <th className="px-6 py-4 font-label-md text-text-muted uppercase tracking-widest text-[11px]">Target</th>
                        <th className="px-6 py-4 font-label-md text-text-muted uppercase tracking-widest text-[11px]">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-low-alpha">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-16 text-center">
                            <div className="flex flex-col items-center gap-3 text-text-muted">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-highest text-text-muted">
                                <span className="material-symbols-outlined text-[28px]">search_off</span>
                              </div>
                              <p className="font-label-md">No audit entries match your filters.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginated.map((entry) => (
                          <tr key={entry.id} className="table-row-hover transition-colors">
                            <td className="px-6 py-4 font-data-mono text-[13px] text-text-muted">{formatTimestamp(entry.createdAt)}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-7 h-7 rounded-full ${getAvatarWrapper(entry.actorRole)} flex items-center justify-center font-bold text-[10px]`}>
                                  {getInitials(entry.actorEmail)}
                                </div>
                                <span className="font-label-md text-on-surface">{getMemberName(entry.actorEmail)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-0.5 ${formatPill(entry.action)} font-label-md rounded-full text-[12px]`}>
                                {entry.action}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-label-md text-on-surface">{getTargetText(entry)}</td>
                            <td className="px-6 py-4 font-data-mono text-[13px] text-text-muted">{getIpAddress(entry)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              {/* Pagination */}
              {!loading && filtered.length > 0 && (
                <div className="px-6 py-4 border-t border-border-low-alpha bg-surface-white flex flex-wrap items-center justify-between gap-3">
                  <span className="font-body-md text-[13px] text-on-surface-variant">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                    {filtered.length !== logs.length ? ` (filtered from ${logs.length})` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      aria-label="Previous page"
                      className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        aria-current={p === currentPage ? "page" : undefined}
                        className={
                          "w-8 h-8 rounded font-label-md text-[13px] flex items-center justify-center transition-colors " +
                          (p === currentPage
                            ? "bg-primary text-on-primary"
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
                      className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              )}
              {!loading && logs.length < totalCount && currentPage >= totalPages && (
                <div className="px-6 py-4 border-t border-border-low-alpha bg-surface-white flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 rounded-lg border border-border-low-alpha font-label-md text-[13px] text-on-surface-variant hover:bg-bg-cream transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {loadingMore && <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>}
                    {loadingMore ? "Loading…" : `Load more (${totalCount - logs.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
            {/* Footer Section Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card p-6 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-container to-primary text-on-primary shadow-sm">
                    <span className="material-symbols-outlined text-[20px]">verified_user</span>
                  </div>
                  <div>
                    <h4 className="font-label-md text-primary font-bold mb-1">Retention Policy</h4>
                    <p className="text-[13px] text-on-surface-variant leading-relaxed">Audit logs are retained for 365 days for Enterprise accounts. After this period, logs are archived in encrypted cold storage and can be requested through security support.</p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary-fixed text-on-tertiary-fixed shadow-sm">
                    <span className="material-symbols-outlined text-[20px]">security</span>
                  </div>
                  <div>
                    <h4 className="font-label-md text-secondary font-bold mb-1">Compliance &amp; Auditing</h4>
                    <p className="text-[13px] text-on-surface-variant leading-relaxed">This log is tamper-evident and SOC2 Type II compliant. Every entry is cryptographically signed at the time of creation to ensure the highest integrity of your organization&apos;s data.</p>
                  </div>
                </div>
              </div>
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
                <Link className="text-label-md text-on-surface-variant hover:text-secondary transition-colors" href="/#features">API Access</Link>
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
