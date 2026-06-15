"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { TopAppBar } from "@/components/app/top-app-bar";


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
  "px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-border-low-alpha font-label-md text-[12px]";
const SKILL_SECONDARY =
  "px-2 py-0.5 rounded bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30 font-label-md text-[12px]";
const SKILL_TERTIARY =
  "px-2 py-0.5 rounded bg-tertiary-fixed/40 text-on-tertiary-fixed-variant border border-tertiary-fixed font-label-md text-[12px]";

const ROW_BASE = "hover:bg-bg-cream/30 transition-colors group cursor-pointer";

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

export default function CandidatesPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [experience, setExperience] = useState("All");
  const [roleFilter, setRoleFilter] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [loading, setLoading] = useState(true);

  // Fetch candidates from API
  const fetchCandidates = async () => {
    setLoading(true);
    try {
      // Get up to 100 candidates to enable rich client-side search & filtering experience
      const res = await api.get<{ candidates: ApiCandidate[]; total: number }>(
        `/api/candidates?limit=100`
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
  }, []);

  const filtered = candidates.filter((c) => {
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

  const getSkillBadgeClass = (index: number) => {
    if (index % 3 === 0) return SKILL_SECONDARY;
    if (index % 3 === 1) return SKILL_TERTIARY;
    return SKILL_PLAIN;
  };

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
          <Link href="/upload" className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap">
            + Upload résumés
          </Link>
        }
      />

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
                  <option value="Error">Error</option>
                </select>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-label-md text-[13px] text-on-surface-variant">Showing {filtered.length} of {totalCount}</span>
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
          {loading ? (
            <div className="flex items-center justify-center py-24 text-on-surface-variant font-body-md">
              <span className="material-symbols-outlined animate-spin mr-2">sync</span> Loading candidate database...
            </div>
          ) : view === "list" ? (
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
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/candidates/${c.id}`)}
                    className={`${ROW_BASE} ${c.status === "Processing" ? "bg-tertiary-fixed/5" : ""}`}
                  >
                    <td className="py-4 pl-6 pr-3" onClick={(e) => e.stopPropagation()}>
                      <input className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/20 bg-surface-white" type="checkbox" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-high text-primary font-headline-md border border-border-low-alpha">
                          {c.initials}
                        </div>
                        <div>
                          <div className="font-label-md text-label-md font-semibold text-primary group-hover:text-tertiary-container transition-colors">{c.name}</div>
                          <div className="font-body-md text-[13px] text-on-surface-variant">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-3 font-body-md text-[14px] text-on-surface">{c.title}</td>
                    <td className="py-4 px-3 font-body-md text-[14px] text-on-surface-variant">{c.location}</td>
                    <td className="py-4 px-3 font-data-mono text-data-mono text-on-surface">{c.expLabel}</td>
                    <td className="py-4 px-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {c.skills.slice(0, 3).map((skill, i) => (
                          <span key={skill} className={getSkillBadgeClass(i)}>{skill}</span>
                        ))}
                        {c.skills.length > 3 && (
                          <span className={SKILL_PLAIN}>+{c.skills.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-6 pl-3">
                      {c.status === "Ready" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary-fixed/20 text-on-tertiary-fixed-variant font-label-md text-[12px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Ready
                        </span>
                      ) : c.status === "Processing" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-[12px]">
                          <span className="material-symbols-outlined text-[14px] animate-spin">sync</span> AI Processing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error/10 text-error font-label-md text-[12px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-error"></span> Error
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
                <div
                  key={c.id}
                  onClick={() => router.push(`/candidates/${c.id}`)}
                  className="block rounded-xl border border-border-low-alpha bg-surface-white p-4 transition-shadow hover:shadow-[0_4px_20px_rgba(44,35,34,0.06)] cursor-pointer group"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-high text-primary font-headline-md border border-border-low-alpha">
                      {c.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-label-md text-label-md font-semibold text-primary group-hover:text-tertiary-container transition-colors">{c.name}</div>
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
                      <span key={skill} className={getSkillBadgeClass(i)}>{skill}</span>
                    ))}
                    {c.skills.length > 3 && (
                      <span className={SKILL_PLAIN}>+{c.skills.length - 3}</span>
                    )}
                  </div>
                  {c.status === "Ready" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary-fixed/20 text-on-tertiary-fixed-variant font-label-md text-[12px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Ready
                    </span>
                  ) : c.status === "Processing" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-[12px]">
                      <span className="material-symbols-outlined text-[14px] animate-spin">sync</span> AI Processing
                  </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error/10 text-error font-label-md text-[12px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-error"></span> Error
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-3">person_search</span>
              <p className="font-body-md text-body-md text-on-surface-variant">No candidates match your filters.</p>
            </div>
          )}

          {/* Simple Client Side Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="px-6 py-4 border-t border-border-low-alpha bg-surface-white flex items-center justify-between">
              <span className="font-body-md text-[13px] text-on-surface-variant">
                Showing {filtered.length} of {totalCount} results
              </span>
              <div className="flex items-center gap-2">
                <button type="button" className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream disabled:opacity-50" disabled>
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <button type="button" className="w-8 h-8 rounded bg-primary text-on-primary font-label-md text-[13px] flex items-center justify-center">1</button>
                <button type="button" className="w-8 h-8 rounded border border-border-low-alpha flex items-center justify-center text-on-surface-variant hover:bg-bg-cream disabled:opacity-50" disabled>
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
