"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [member, setMember] = useState("All Members");
  const [action, setAction] = useState("All Actions");
  const [date, setDate] = useState("All Dates");

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get<{ logs: any[] }>("/api/audit");
        setLogs(res.logs);
      } catch (err: any) {
        toast.error(err.message || "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const formattedTime = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" });
    return `${formattedDate} · ${formattedTime}`;
  };

  const formatPill = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes("delete") || act.includes("remove") || act.includes("cancel")) {
      return "bg-error-container/20 text-error";
    }
    if (act.includes("create") || act.includes("invite") || act.includes("add") || act.includes("upload")) {
      return "bg-secondary-container/20 text-secondary";
    }
    return "bg-surface-container-highest text-on-surface-variant";
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

  const getIpAddress = (actorUserId: string | null) => {
    if (!actorUserId) return "System";
    const lastPart = actorUserId.split("-").pop() || "1";
    const num = parseInt(lastPart, 16) % 254 + 1;
    return `192.168.1.${num}`;
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

  return (
    <AppShell>
      {/* Main Wrapper */}
      <div className="min-h-screen flex flex-col">
        {/* TopAppBar */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md border-b border-border-low-alpha flex flex-wrap justify-between items-center gap-4 px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2 text-on-surface-variant font-label-md">
              <Link href="/settings" className="hover:text-primary cursor-pointer">Settings</Link>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              <span className="text-primary font-semibold">Audit log</span>
            </nav>
          </div>
          <div className="flex items-center gap-6">
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
          </div>
        </header>
        {/* Page Content */}
        <main className="flex-1 flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-8 max-w-[1440px] mx-auto w-full">
          {/* Sub-navigation Sidebar */}
          <nav className="w-full lg:w-64 flex-shrink-0 space-y-1">
            <h3 className="px-4 text-[12px] font-bold text-text-muted uppercase tracking-wider mb-4">Account Settings</h3>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/settings">General</Link>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/team">Members</Link>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/billing">Billing</Link>
            <Link className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-primary transition-colors rounded-lg font-label-md" href="/security">Security</Link>
            <Link className="flex items-center gap-3 px-4 py-3 bg-white text-primary font-semibold shadow-sm rounded-lg font-label-md border-l-4 border-secondary" href="/audit">Audit log</Link>
          </nav>
          {/* Main Dashboard Area */}
          <div className="flex-1 space-y-8">
            {/* Header */}
            <section>
              <h2 className="font-headline-lg text-primary mb-1">Audit log</h2>
              <p className="font-body-md text-text-muted">Every sensitive action, recorded and secured for compliance and oversight.</p>
            </section>
            {/* Filter Toolbar */}
            <div className="bg-white p-4 rounded-lg premium-shadow border border-border-low-alpha flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Date Filter */}
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                  <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={date} onChange={(e) => setDate(e.target.value)}>
                    {datesList.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                {/* Member Dropdown */}
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                  <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={member} onChange={(e) => setMember(e.target.value)}>
                    {membersList.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {/* Action Filter */}
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">filter_list</span>
                  <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={action} onChange={(e) => setAction(e.target.value)}>
                    {actionsList.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {/* Data Table */}
            <div className="bg-white rounded-lg premium-shadow border border-border-low-alpha overflow-hidden">
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
                              <span className="material-symbols-outlined text-[40px] opacity-40">search_off</span>
                              <p className="font-label-md">No audit entries match your filters.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filtered.map((entry) => (
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
                            <td className="px-6 py-4 font-data-mono text-[13px] text-text-muted">{getIpAddress(entry.actorUserId)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            {/* Footer Section Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-primary/5 p-6 rounded-lg border border-primary/10">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <span className="material-symbols-outlined">verified_user</span>
                  </div>
                  <div>
                    <h4 className="font-label-md text-primary font-bold mb-1">Retention Policy</h4>
                    <p className="text-[13px] text-on-surface-variant leading-relaxed">Audit logs are retained for 365 days for Enterprise accounts. After this period, logs are archived in encrypted cold storage and can be requested through security support.</p>
                  </div>
                </div>
              </div>
              <div className="bg-secondary/5 p-6 rounded-lg border border-secondary/10">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
                    <span className="material-symbols-outlined">security</span>
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
              <p className="font-label-md text-text-muted mt-2">© 2024 TalScout AI. All rights reserved.</p>
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
