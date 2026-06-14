"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";

type Candidate = {
  id: number;
  name: string;
  email: string;
  title: string;
  location: string;
  experience: number;
  expLabel: string;
  skills: string[];
  status: "Ready" | "Processing";
  // Presentation details preserved exactly from the original hard-coded rows.
  initials: string;
  rowClassName: string;
  avatarClassName: string;
  // Per-skill class names, index-aligned with `skills`.
  skillClassNames: string[];
};

const SKILL_PLAIN =
  "px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-border-low-alpha font-label-md text-[12px]";
const SKILL_SECONDARY =
  "px-2 py-0.5 rounded bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30 font-label-md text-[12px]";
const SKILL_TERTIARY =
  "px-2 py-0.5 rounded bg-tertiary-fixed/40 text-on-tertiary-fixed-variant border border-tertiary-fixed font-label-md text-[12px]";

const ROW_BASE = "hover:bg-bg-cream/30 transition-colors group cursor-pointer";

const CANDIDATES: Candidate[] = [
  {
    id: 1,
    name: "Sarah Jenkins",
    email: "sarah.j@example.com",
    title: "Senior Frontend Engineer",
    location: "San Francisco, CA",
    experience: 8,
    expLabel: "08",
    skills: ["React", "TypeScript", "GraphQL"],
    status: "Ready",
    initials: "SJ",
    rowClassName: ROW_BASE,
    avatarClassName:
      "w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-high text-primary font-headline-md border border-border-low-alpha",
    skillClassNames: [SKILL_SECONDARY, SKILL_PLAIN, SKILL_PLAIN],
  },
  {
    id: 2,
    name: "Marcus Chen",
    email: "marcus.c@example.com",
    title: "Principal Architect",
    location: "New York, NY",
    experience: 12,
    expLabel: "12",
    skills: ["System Design", "Go", "AWS"],
    status: "Processing",
    initials: "MC",
    rowClassName: `${ROW_BASE} bg-tertiary-fixed/5`,
    avatarClassName:
      "w-10 h-10 rounded-full bg-primary-container/10 flex items-center justify-center font-headline-md text-primary-container border border-primary-container/20",
    skillClassNames: [SKILL_TERTIARY, SKILL_PLAIN, SKILL_PLAIN],
  },
  {
    id: 3,
    name: "David Miller",
    email: "d.miller@example.com",
    title: "Data Scientist",
    location: "Remote (Austin, TX)",
    experience: 5,
    expLabel: "05",
    skills: ["Python", "PyTorch", "SQL"],
    status: "Ready",
    initials: "DM",
    rowClassName: ROW_BASE,
    avatarClassName:
      "w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-high text-primary font-headline-md border border-border-low-alpha",
    skillClassNames: [SKILL_PLAIN, SKILL_PLAIN, SKILL_PLAIN],
  },
  {
    id: 4,
    name: "Amanda Lewis",
    email: "alewis.dev@example.com",
    title: "Full Stack Engineer",
    location: "Seattle, WA",
    experience: 6,
    expLabel: "06",
    skills: ["Node.js", "React", "MongoDB"],
    status: "Ready",
    initials: "AL",
    rowClassName: ROW_BASE,
    avatarClassName:
      "w-10 h-10 rounded-full bg-secondary-container/10 flex items-center justify-center font-headline-md text-secondary-container border border-secondary-container/20",
    skillClassNames: [SKILL_SECONDARY, SKILL_PLAIN, SKILL_PLAIN],
  },
];

const EXPERIENCE_OPTIONS = [
  { label: "All", value: "All" },
  { label: "0–2", value: "0-2" },
  { label: "3–5", value: "3-5" },
  { label: "6+", value: "6+" },
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

export default function CandidatesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [experience, setExperience] = useState("All");
  const [roleFilter, setRoleFilter] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");

  const filtered = CANDIDATES.filter((c) => {
    const matchesQ =
      q.trim() === "" ||
      [c.name, c.title, c.location, c.email, ...c.skills]
        .join(" ")
        .toLowerCase()
        .includes(q.trim().toLowerCase());
    const matchesStatus = status === "All" || c.status === status;
    const matchesExp = matchesExperience(c.experience, experience);
    const matchesRole =
      roleFilter === "" ||
      [c.title, ...c.skills].join(" ").toLowerCase().includes(roleFilter.toLowerCase());
    return matchesQ && matchesStatus && matchesExp && matchesRole;
  });

  return (
    <AppShell>
      {/* TopAppBar */}
      <header className="hidden md:flex bg-surface/80 dark:bg-surface-container/80 backdrop-blur-md sticky top-0 z-40 border-b border-border-low-alpha justify-between items-center px-6 py-4">
        <div className="flex-1 max-w-xl">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
              className="w-full pl-10 pr-4 py-2 bg-surface-white border border-border-low-alpha rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 transition-all"
              placeholder="Search across candidates, roles..."
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <button type="button" className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-all scale-95 duration-100 active:opacity-80">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button type="button" className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-all scale-95 duration-100 active:opacity-80">
              <span className="material-symbols-outlined">history</span>
            </button>
          </div>
          <Link href="/upload" className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors duration-200 flex items-center gap-2">
            + Upload résumés
          </Link>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="p-4 sm:p-6 lg:p-12 max-w-[1160px] mx-auto min-h-screen">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Candidates</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Review and manage your talent pool. AI analysis is processing new uploads.</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-surface-white rounded-t-xl border border-border-low-alpha p-4 flex flex-wrap items-center justify-between gap-4 shadow-[0_2px_8px_rgba(44,35,34,0.02)]">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative w-full md:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-[20px]">filter_list</span>
              <input
                className="w-full pl-9 pr-4 py-2 bg-bg-cream border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary/20 focus:border-primary outline-none font-body-md text-[14px] text-on-surface placeholder:text-on-surface-variant/60"
                placeholder="Filter list..."
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {roleFilter !== "" && (
                <button
                  type="button"
                  onClick={() => setRoleFilter("")}
                  className="px-3 py-1.5 rounded-full border border-secondary text-secondary font-label-md text-[13px] hover:bg-secondary/5 transition-colors flex items-center gap-1"
                >
                  Role: {roleFilter} <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
              <label className="px-3 py-1.5 rounded-full border border-border-low-alpha text-on-surface-variant font-label-md text-[13px] hover:bg-bg-cream transition-colors flex items-center gap-1 cursor-pointer">
                Experience
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="bg-transparent outline-none font-label-md text-[13px] text-on-surface-variant cursor-pointer"
                  aria-label="Filter by experience"
                >
                  {EXPERIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="px-3 py-1.5 rounded-full border border-border-low-alpha text-on-surface-variant font-label-md text-[13px] hover:bg-bg-cream transition-colors flex items-center gap-1 cursor-pointer">
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="bg-transparent outline-none font-label-md text-[13px] text-on-surface-variant cursor-pointer"
                  aria-label="Filter by status"
                >
                  <option value="All">All</option>
                  <option value="Ready">Ready</option>
                  <option value="Processing">Processing</option>
                </select>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-label-md text-[13px] text-on-surface-variant">Showing {filtered.length} of {CANDIDATES.length}</span>
            <div className="flex gap-1 border border-border-low-alpha rounded-lg p-1 bg-bg-cream">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="List view"
                aria-pressed={view === "list"}
                className={
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors " +
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
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors " +
                  (view === "grid"
                    ? "bg-surface-white text-primary shadow-sm"
                    : "text-on-surface-variant hover:text-primary")
                }
              >
                <span className="material-symbols-outlined text-[20px]">grid_view</span>
              </button>
            </div>
          </div>
        </div>

        {/* Data Table Canvas */}
        <div className="bg-surface-white border-x border-b border-border-low-alpha rounded-b-xl overflow-hidden shadow-[0_4px_12px_rgba(44,35,34,0.03)] overflow-x-auto">
          {view === "list" ? (
          <table className="w-full min-w-[720px] text-left border-collapse">
            <thead>
              <tr className="border-b border-border-low-alpha bg-bg-cream/50">
                <th className="py-4 pl-6 pr-3 w-12">
                  <input className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/20 bg-surface-white" type="checkbox" />
                </th>
                <th className="py-4 px-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[11px] font-semibold">Candidate</th>
                <th className="py-4 px-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[11px] font-semibold">Title</th>
                <th className="py-4 px-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[11px] font-semibold">Location</th>
                <th className="py-4 px-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[11px] font-semibold">Exp (Yrs)</th>
                <th className="py-4 px-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[11px] font-semibold">Top Skills</th>
                <th className="py-4 pr-6 pl-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[11px] font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-low-alpha">
              {filtered.map((c) => (
                <tr key={c.id} className={c.rowClassName}>
                  <td className="py-4 pl-6 pr-3">
                    <input className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/20 bg-surface-white" type="checkbox" />
                  </td>
                  <td className="py-4 px-3">
                    <Link href="/candidates/1" className="flex items-center gap-3">
                      <div className={c.avatarClassName}>{c.initials}</div>
                      <div>
                        <div className="font-label-md text-label-md font-semibold text-primary group-hover:text-tertiary-container transition-colors">{c.name}</div>
                        <div className="font-body-md text-[13px] text-on-surface-variant">{c.email}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="py-4 px-3 font-body-md text-[14px] text-on-surface">{c.title}</td>
                  <td className="py-4 px-3 font-body-md text-[14px] text-on-surface-variant">{c.location}</td>
                  <td className="py-4 px-3 font-data-mono text-data-mono text-on-surface">{c.expLabel}</td>
                  <td className="py-4 px-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {c.skills.map((skill, i) => (
                        <span key={skill} className={c.skillClassNames[i]}>{skill}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 pr-6 pl-3">
                    {c.status === "Ready" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary-fixed/20 text-on-tertiary-fixed-variant font-label-md text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-[12px]">
                        <span className="material-symbols-outlined text-[14px] animate-spin">sync</span> AI Processing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((c) => (
                <Link
                  key={c.id}
                  href="/candidates/1"
                  className="block rounded-xl border border-border-low-alpha bg-surface-white p-4 transition-shadow hover:shadow-[0_4px_20px_rgba(44,35,34,0.06)]"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className={c.avatarClassName}>{c.initials}</div>
                    <div className="min-w-0">
                      <div className="truncate font-label-md text-label-md font-semibold text-primary">{c.name}</div>
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
                    {c.skills.map((skill, i) => (
                      <span key={skill} className={c.skillClassNames[i]}>{skill}</span>
                    ))}
                  </div>
                  {c.status === "Ready" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary-fixed/20 text-on-tertiary-fixed-variant font-label-md text-[12px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-[12px]">
                      <span className="material-symbols-outlined text-[14px] animate-spin">sync</span> AI Processing
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-3">person_search</span>
              <p className="font-body-md text-body-md text-on-surface-variant">No candidates match your filters.</p>
            </div>
          )}

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-border-low-alpha bg-surface-white flex items-center justify-between">
            <span className="font-body-md text-[13px] text-on-surface-variant">Showing 1 to 4 of 24 results</span>
            <div className="flex items-center gap-2">
              <button type="button" className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream disabled:opacity-50" disabled>
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button type="button" className="w-8 h-8 rounded bg-primary text-on-primary font-label-md text-[13px] flex items-center justify-center">1</button>
              <button type="button" className="w-8 h-8 rounded border border-border-low-alpha text-on-surface-variant font-label-md text-[13px] flex items-center justify-center hover:bg-bg-cream">2</button>
              <button type="button" className="w-8 h-8 rounded border border-border-low-alpha text-on-surface-variant font-label-md text-[13px] flex items-center justify-center hover:bg-bg-cream">3</button>
              <span className="text-on-surface-variant">...</span>
              <button type="button" className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream">
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
