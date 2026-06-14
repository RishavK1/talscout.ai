"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";

type AvatarStyle = {
  wrapper: string;
};

type AuditEntry = {
  id: number;
  timestamp: string;
  date: string;
  member: string;
  initials: string;
  avatar: AvatarStyle;
  action: string;
  actionPill: string;
  target: string;
  ip: string;
};

const SECONDARY_PILL = "bg-secondary-container/20 text-secondary";
const ERROR_PILL = "bg-error-container/20 text-error";
const NEUTRAL_PILL = "bg-surface-container-highest text-on-surface-variant";

const SECONDARY_AVATAR = "bg-secondary-fixed text-on-secondary-fixed";
const PRIMARY_AVATAR = "bg-primary-fixed text-on-primary-fixed";
const TERTIARY_AVATAR = "bg-surface-container-high text-primary";
const TERTIARY_FIXED_AVATAR = "bg-tertiary-fixed text-on-tertiary-fixed";

const AUDIT_ENTRIES: AuditEntry[] = [
  {
    id: 1,
    timestamp: "Oct 24, 2024 · 09:42:11",
    date: "2024-10-24",
    member: "Sarah Jenkins",
    initials: "SJ",
    avatar: { wrapper: SECONDARY_AVATAR },
    action: "Viewed candidate",
    actionPill: SECONDARY_PILL,
    target: "Sarah Chen",
    ip: "192.168.1.42",
  },
  {
    id: 2,
    timestamp: "Oct 24, 2024 · 09:15:04",
    date: "2024-10-24",
    member: "David Abasolo",
    initials: "DA",
    avatar: { wrapper: PRIMARY_AVATAR },
    action: "Exported 12 candidates",
    actionPill: ERROR_PILL,
    target: "All Candidates",
    ip: "72.14.192.11",
  },
  {
    id: 3,
    timestamp: "Oct 23, 2024 · 18:55:22",
    date: "2024-10-23",
    member: "Elena Rodriguez",
    initials: "ER",
    avatar: { wrapper: `overflow-hidden ${TERTIARY_AVATAR}` },
    action: "Changed billing plan",
    actionPill: NEUTRAL_PILL,
    target: "Enterprise Tier",
    ip: "108.162.21.4",
  },
  {
    id: 4,
    timestamp: "Oct 23, 2024 · 14:22:10",
    date: "2024-10-23",
    member: "Marcus Kane",
    initials: "MK",
    avatar: { wrapper: TERTIARY_FIXED_AVATAR },
    action: "Invited member",
    actionPill: SECONDARY_PILL,
    target: "Michael Chang",
    ip: "192.168.1.102",
  },
  {
    id: 5,
    timestamp: "Oct 23, 2024 · 11:04:45",
    date: "2024-10-23",
    member: "Sarah Jenkins",
    initials: "SJ",
    avatar: { wrapper: SECONDARY_AVATAR },
    action: "Deleted candidate",
    actionPill: ERROR_PILL,
    target: "Alex Thompson",
    ip: "192.168.1.42",
  },
  {
    id: 6,
    timestamp: "Oct 22, 2024 · 16:40:01",
    date: "2024-10-22",
    member: "David Abasolo",
    initials: "DA",
    avatar: { wrapper: PRIMARY_AVATAR },
    action: "Viewed candidate",
    actionPill: SECONDARY_PILL,
    target: "Linda Wu",
    ip: "72.14.192.11",
  },
  {
    id: 7,
    timestamp: "Oct 22, 2024 · 09:12:33",
    date: "2024-10-22",
    member: "Sarah Jenkins",
    initials: "SJ",
    avatar: { wrapper: SECONDARY_AVATAR },
    action: "Viewed candidate",
    actionPill: SECONDARY_PILL,
    target: "Michael Chang",
    ip: "192.168.1.42",
  },
  {
    id: 8,
    timestamp: "Oct 21, 2024 · 17:33:59",
    date: "2024-10-21",
    member: "Marcus Kane",
    initials: "MK",
    avatar: { wrapper: TERTIARY_FIXED_AVATAR },
    action: "Exported 1 candidates",
    actionPill: SECONDARY_PILL,
    target: "Sarah Chen",
    ip: "192.168.1.102",
  },
];

const MEMBERS = ["All Members", ...Array.from(new Set(AUDIT_ENTRIES.map((e) => e.member)))];
const ACTIONS = ["All Actions", ...Array.from(new Set(AUDIT_ENTRIES.map((e) => e.action)))];
const DATES = ["All Dates", ...Array.from(new Set(AUDIT_ENTRIES.map((e) => e.date)))];

export default function AuditLogPage() {
  const [query, setQuery] = useState("");
  const [member, setMember] = useState("All Members");
  const [action, setAction] = useState("All Actions");
  const [date, setDate] = useState("All Dates");

  const filtered = AUDIT_ENTRIES.filter((entry) => {
    const matchesQuery =
      query.trim() === "" ||
      [entry.timestamp, entry.member, entry.action, entry.target, entry.ip]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    const matchesMember = member === "All Members" || entry.member === member;
    const matchesAction = action === "All Actions" || entry.action === action;
    const matchesDate = date === "All Dates" || entry.date === date;
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
              <span className="text-primary font-semibold">Data &amp; privacy</span>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">search</span>
              <input className="bg-surface-container-low border-none rounded-full pl-10 pr-4 py-2 text-label-md w-64 focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Search logs..." type="text" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="p-2 hover:bg-surface-container-high rounded-full transition-colors relative">
                <span className="material-symbols-outlined">notifications</span>
                <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full"></span>
              </button>
              <button type="button" className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <span className="material-symbols-outlined">history</span>
              </button>
              <div className="w-8 h-8 rounded-full overflow-hidden border border-border-low-alpha flex items-center justify-center bg-surface-container-high text-primary font-label-md">
                ER
              </div>
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
            <Link className="flex items-center gap-3 px-4 py-3 bg-white text-primary font-semibold shadow-sm rounded-lg font-label-md border-l-4 border-secondary" href="/audit">Data &amp; privacy</Link>
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
              <div className="flex items-center gap-3">
                {/* Date Filter */}
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                  <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={date} onChange={(e) => setDate(e.target.value)}>
                    {DATES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                {/* Member Dropdown */}
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                  <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={member} onChange={(e) => setMember(e.target.value)}>
                    {MEMBERS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined text-[18px]">expand_more</span>
                </div>
                {/* Action Filter */}
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-cream rounded-lg border border-border-low-alpha cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">filter_list</span>
                  <select className="text-label-md bg-transparent border-none focus:outline-none cursor-pointer" value={action} onChange={(e) => setAction(e.target.value)}>
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined text-[18px]">expand_more</span>
                </div>
              </div>
              <button type="button" className="flex items-center gap-2 text-primary font-label-md px-4 py-2 hover:bg-primary/5 rounded-lg transition-all">
                <span className="material-symbols-outlined text-[18px]">download</span>
                Export CSV
              </button>
            </div>
            {/* Data Table */}
            <div className="bg-white rounded-lg premium-shadow border border-border-low-alpha overflow-hidden">
              <div className="overflow-x-auto">
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
                        <td className="px-6 py-4 font-data-mono text-[13px] text-text-muted">{entry.timestamp}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full ${entry.avatar.wrapper} flex items-center justify-center font-bold text-[10px]`}>{entry.initials}</div>
                            <span className="font-label-md text-on-surface">{entry.member}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 ${entry.actionPill} font-label-md rounded-full text-[12px]`}>{entry.action}</span>
                        </td>
                        <td className="px-6 py-4 font-label-md text-on-surface">{entry.target}</td>
                        <td className="px-6 py-4 font-data-mono text-[13px] text-text-muted">{entry.ip}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
              {/* Pagination Footer */}
              <div className="px-6 py-4 bg-bg-cream/30 border-t border-border-low-alpha flex items-center justify-between">
                <span className="text-label-md text-text-muted">Showing {filtered.length} of {AUDIT_ENTRIES.length} entries</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="p-1 hover:bg-surface-container-high rounded transition-colors text-text-muted disabled:opacity-30" disabled>
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>
                  <span className="text-label-md font-semibold px-2">1</span>
                  <span className="text-label-md text-text-muted hover:text-primary cursor-pointer px-2">2</span>
                  <span className="text-label-md text-text-muted hover:text-primary cursor-pointer px-2">3</span>
                  <span className="text-label-md text-text-muted px-1">...</span>
                  <span className="text-label-md text-text-muted hover:text-primary cursor-pointer px-2">155</span>
                  <button type="button" className="p-1 hover:bg-surface-container-high rounded transition-colors text-primary">
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
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
