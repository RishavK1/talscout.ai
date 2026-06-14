"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";

type ViewMode = "list" | "grid";

type Candidate = {
  id: number;
  initials: string;
  name: string;
  verified: boolean;
  title: string;
  location: string;
  experience: number; // years
  match: number; // percentage
  badgeOpacity: boolean;
  summaryText: string; // plain-text, used for search matching
  summary: ReactNode; // rendered AI summary with brass-highlight spans
  skills: string[];
};

const CANDIDATES: Candidate[] = [
  {
    id: 1,
    initials: "ER",
    name: "Elena Rodriguez",
    verified: true,
    title: "Lead Product Designer @ FinServe",
    location: "Austin, TX (Remote)",
    experience: 7,
    match: 94,
    badgeOpacity: false,
    summaryText:
      "Strong candidate matching all core requirements. Elena has spent the last 4 years leading Product Design at a major FinTech firm, successfully launching 3 consumer-facing financial dashboards. She possesses deep technical proficiency in React, enabling seamless collaboration with front-end engineering teams.",
    summary: (
      <>
        Strong candidate matching all core requirements. Elena has spent the last 4 years leading <span className="brass-highlight font-medium">Product Design</span> at a major <span className="brass-highlight font-medium">FinTech</span> firm, successfully launching 3 consumer-facing financial dashboards. She possesses deep technical proficiency in <span className="brass-highlight font-medium">React</span>, enabling seamless collaboration with front-end engineering teams.
      </>
    ),
    skills: ["Figma", "React", "FinTech", "Design Systems", "User Research"],
  },
  {
    id: 2,
    initials: "MJ",
    name: "Marcus Johnson",
    verified: false,
    title: "Senior UX Designer @ Nexus Bank",
    location: "Seattle, WA (Remote)",
    experience: 6,
    match: 88,
    badgeOpacity: true,
    summaryText:
      "Solid fit for the role. Marcus is currently a Senior UX Designer working extensively within FinTech compliance constraints. While his core focus is UX architecture, he has functional experience with React component libraries, though less hands-on coding than the top match.",
    summary: (
      <>
        Solid fit for the role. Marcus is currently a <span className="brass-highlight font-medium">Senior UX Designer</span> working extensively within <span className="brass-highlight font-medium">FinTech</span> compliance constraints. While his core focus is UX architecture, he has functional experience with <span className="brass-highlight font-medium">React</span> component libraries, though less hands-on coding than the top match.
      </>
    ),
    skills: ["UX Architecture", "FinTech", "React (Basic)", "Wireframing"],
  },
];

export default function SearchPage() {
  const [q, setQ] = useState("Senior Product Designer with React and FinTech experience");
  const [locationFilter, setLocationFilter] = useState<string | null>("Remote");
  const [experienceFilter, setExperienceFilter] = useState<string | null>("5+ years");
  const [skillFilter, setSkillFilter] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("list");
  const [shortlisted, setShortlisted] = useState<Record<number, boolean>>({});

  const addToShortlist = (c: Candidate) => {
    if (shortlisted[c.id]) return;
    setShortlisted((prev) => ({ ...prev, [c.id]: true }));
    toast.success(`Added ${c.name} to shortlist`);
  };

  const addable = [
    { key: "location", label: "Location", icon: "location_on", active: locationFilter !== null, add: () => setLocationFilter("Remote") },
    { key: "experience", label: "Experience", icon: "work", active: experienceFilter !== null, add: () => setExperienceFilter("5+ years") },
    { key: "skill", label: "Skill", icon: "tag", active: skillFilter !== null, add: () => setSkillFilter("React") },
  ].filter((o) => !o.active);

  const filtered = CANDIDATES.filter((c) => {
    const haystack = [c.name, c.title, c.location, ...c.skills, c.summaryText]
      .join(" ")
      .toLowerCase();
    // Token-based "semantic-ish" match: a candidate matches if the haystack
    // contains any meaningful word from the query (so a natural-language
    // sentence like "Senior Product Designer with React…" still matches).
    const tokens = q.toLowerCase().match(/[a-z0-9+]{3,}/g) ?? [];
    const matchesQ = tokens.length === 0 || tokens.some((t) => haystack.includes(t));

    const matchesLocation =
      locationFilter === null ||
      c.location.toLowerCase().includes(locationFilter.toLowerCase());

    const matchesExperience =
      experienceFilter === null ||
      (experienceFilter === "5+ years" ? c.experience >= 5 : true);

    const matchesSkill =
      skillFilter === null ||
      c.skills.some((s) => s.toLowerCase().includes(skillFilter.toLowerCase()));

    return matchesQ && matchesLocation && matchesExperience && matchesSkill;
  });

  return (
    <AppShell>
      {/* Main Content Area */}
      <div className="flex flex-col min-h-screen relative">
        {/* TopAppBar Component */}
        <header className="flex flex-wrap justify-between items-center gap-3 px-4 sm:px-6 py-4 sticky top-0 z-40 bg-surface/80 dark:bg-surface-container/80 backdrop-blur-md border-b border-border-low-alpha">
          {/* Search Bar (on_left) */}
          <div className="flex-1 max-w-xl">
            {/* The global search is hidden here per instructions, handled in main content canvas */}
          </div>
          {/* Trailing Actions */}
          <div className="flex items-center gap-4">
            <button type="button" className="text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-all scale-95 duration-100 active:opacity-80">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
            </button>
            <button type="button" className="text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-all scale-95 duration-100 active:opacity-80 relative">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
              <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
            </button>
            <Link href="/upload" className="px-4 py-2 bg-white border border-border-low-alpha text-primary rounded-lg font-label-md text-label-md hover:bg-surface-container-low transition-colors shadow-sm">
              + Upload résumé
            </Link>
          </div>
        </header>
        {/* Main Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1000px] mx-auto">
            {/* Hero Search Area */}
            <div className="mb-12">
              <h1 className="font-headline-lg text-headline-lg text-on-surface mb-6">Semantic Search</h1>
              {/* Large Search Input */}
              <div className="relative flex items-center w-full bg-white rounded-xl ambient-shadow p-2 border border-border-low-alpha focus-within:border-primary transition-colors">
                <span className="material-symbols-outlined text-outline ml-4 mr-2" style={{ fontVariationSettings: "'FILL' 0" }}>search</span>
                <input className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 font-body-md text-body-md text-on-surface py-3 px-2 placeholder-outline-variant" placeholder="Describe your ideal candidate..." type="text" value={q} onChange={(e) => setQ(e.target.value)} />
                <button type="button" className="bg-tertiary-fixed text-on-tertiary-fixed px-6 py-3 rounded-lg font-label-md text-label-md hover:bg-tertiary-fixed-dim transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  Search
                </button>
              </div>
              {/* Filter Chips */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <span className="font-label-md text-label-md text-on-surface-variant mr-2">Filters:</span>
                {locationFilter !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-low-alpha rounded-full font-label-md text-[13px] text-on-surface shadow-sm cursor-pointer hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px] text-primary">location_on</span>
                    Location: {locationFilter}
                    <button type="button" onClick={() => setLocationFilter(null)} aria-label="Remove location filter" className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface ml-1">close</button>
                  </div>
                )}
                {experienceFilter !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-low-alpha rounded-full font-label-md text-[13px] text-on-surface shadow-sm cursor-pointer hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px] text-primary">work</span>
                    Experience: {experienceFilter}
                    <button type="button" onClick={() => setExperienceFilter(null)} aria-label="Remove experience filter" className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface ml-1">close</button>
                  </div>
                )}
                {skillFilter !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-low-alpha rounded-full font-label-md text-[13px] text-on-surface shadow-sm cursor-pointer hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px] text-primary">tag</span>
                    Skill: {skillFilter}
                    <button type="button" onClick={() => setSkillFilter(null)} aria-label="Remove skill filter" className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface ml-1">close</button>
                  </div>
                )}
                <div className="relative ml-2">
                  <button
                    type="button"
                    onClick={() => setAddOpen((o) => !o)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-primary font-label-md text-[13px] hover:bg-surface-container-low rounded-full transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add Filter
                  </button>
                  {addOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
                      <div className="absolute left-0 top-full z-20 mt-2 w-52 rounded-xl border border-border-low-alpha bg-white p-1 shadow-floating">
                        {addable.length === 0 ? (
                          <p className="px-3 py-2 font-body-md text-[13px] text-outline">
                            All filters added
                          </p>
                        ) : (
                          addable.map((o) => (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => {
                                o.add();
                                setAddOpen(false);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-label-md text-[13px] text-on-surface transition-colors hover:bg-surface-container-low"
                            >
                              <span className="material-symbols-outlined text-[18px] text-primary">
                                {o.icon}
                              </span>
                              {o.label}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {/* Results Section */}
            <div className="mb-8 flex justify-between items-end">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">{filtered.length} Results Found</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">Sorted by AI Match Score</p>
              </div>
              <div className="flex gap-1 p-1 bg-surface-container-low rounded-lg border border-border-low-alpha">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  aria-pressed={view === "list"}
                  title="List view"
                  className={`p-2 rounded-md transition-all ${
                    view === "list"
                      ? "bg-white shadow-sm text-primary"
                      : "text-outline hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: view === "list" ? "'FILL' 1" : "'FILL' 0" }}>view_agenda</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView("grid")}
                  aria-pressed={view === "grid"}
                  title="Grid view"
                  className={`p-2 rounded-md transition-all ${
                    view === "grid"
                      ? "bg-white shadow-sm text-primary"
                      : "text-outline hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: view === "grid" ? "'FILL' 1" : "'FILL' 0" }}>grid_view</span>
                </button>
              </div>
            </div>
            {/* Candidate List */}
            {filtered.length === 0 ? (
              <div className="bg-surface-white rounded-xl ambient-shadow p-12 border border-border-low-alpha flex flex-col items-center justify-center text-center">
                <span className="material-symbols-outlined text-[48px] text-outline-variant mb-3" style={{ fontVariationSettings: "'FILL' 0" }}>search_off</span>
                <p className="font-body-md text-body-md text-on-surface-variant">No candidates match your search.</p>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filtered.map((c) => {
                  const added = !!shortlisted[c.id];
                  return (
                    <div key={c.id} className="bg-surface-white rounded-xl ambient-shadow p-5 border border-border-low-alpha relative overflow-hidden group hover:border-primary/30 transition-colors flex flex-col">
                      {/* Top Row: Profile & Score */}
                      <div className="flex justify-between items-start mb-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Link href="/candidates/1" className="w-11 h-11 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center text-primary font-headline-md flex-shrink-0">{c.initials}</Link>
                          <div className="min-w-0">
                            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-1.5 truncate">
                              <Link href="/candidates/1" className="hover:underline truncate">{c.name}</Link>
                              {c.verified && (
                                <span className="material-symbols-outlined text-[16px] text-tertiary-container flex-shrink-0" title="Verified">verified</span>
                              )}
                            </h3>
                            <p className="font-body-md text-body-md text-on-surface-variant truncate">{c.title}</p>
                            <p className="font-label-md text-label-md text-outline mt-0.5 flex items-center gap-1 truncate">
                              <span className="material-symbols-outlined text-[14px]">location_on</span> {c.location} • {c.experience}y
                            </p>
                          </div>
                        </div>
                        {/* Match Badge */}
                        <div className={`brass-badge px-3 py-1.5 rounded-full flex items-center gap-1.5 font-label-md text-label-md font-semibold flex-shrink-0${c.badgeOpacity ? " opacity-90" : ""}`}>
                          <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                          {c.match}%
                        </div>
                      </div>
                      {/* Skills / Tags */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {c.skills.map((skill) => (
                          <span key={skill} className="px-2.5 py-1 bg-surface-container-low text-on-surface-variant rounded-md font-data-mono text-data-mono border border-border-low-alpha">{skill}</span>
                        ))}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 border-t border-border-low-alpha pt-4 mt-auto">
                        <Link href="/candidates/1" className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors text-center">
                          View Profile
                        </Link>
                        <button
                          type="button"
                          onClick={() => addToShortlist(c)}
                          disabled={added}
                          className={`px-4 py-2 rounded-lg font-label-md text-label-md transition-colors shadow-sm border ${
                            added
                              ? "bg-surface-container-low border-border-low-alpha text-on-surface-variant cursor-default"
                              : "bg-white border-border-low-alpha text-primary hover:bg-surface-container-low"
                          }`}
                        >
                          {added ? "Added ✓" : "Add to Shortlist"}
                        </button>
                        <div className="flex-1" />
                        <button type="button" className="p-2 text-outline hover:text-primary hover:bg-surface-container-low rounded-full transition-colors" title="Download Resume">
                          <span className="material-symbols-outlined">download</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-6">
                {filtered.map((c) => {
                  const added = !!shortlisted[c.id];
                  return (
                  <div key={c.id} className="bg-surface-white rounded-xl ambient-shadow p-6 border border-border-low-alpha relative overflow-hidden group hover:border-primary/30 transition-colors">
                    {/* Top Row: Profile & Score */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-4">
                        <Link href="/candidates/1" className="w-14 h-14 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center text-primary font-headline-md flex-shrink-0">{c.initials}</Link>
                        <div>
                          <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                            <Link href="/candidates/1" className="hover:underline">{c.name}</Link>
                            {c.verified && (
                              <span className="material-symbols-outlined text-[18px] text-tertiary-container" title="Verified">verified</span>
                            )}
                          </h3>
                          <p className="font-body-md text-body-md text-on-surface-variant">{c.title}</p>
                          <p className="font-label-md text-label-md text-outline mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">location_on</span> {c.location} • {c.experience} years exp.
                          </p>
                        </div>
                      </div>
                      {/* Match Badge */}
                      <div className="flex flex-col items-end">
                        <div className={`brass-badge px-4 py-2 rounded-full flex items-center gap-2 font-label-md text-label-md font-semibold${c.badgeOpacity ? " opacity-90" : ""}`}>
                          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                          {c.match}% Match
                        </div>
                      </div>
                    </div>
                    {/* AI Summary */}
                    <div className="bg-bg-cream rounded-lg p-4 mb-4 border border-border-low-alpha">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>summarize</span>
                        <p className="font-body-md text-body-md text-on-surface leading-relaxed">
                          {c.summary}
                        </p>
                      </div>
                    </div>
                    {/* Skills / Tags */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {c.skills.map((skill) => (
                        <span key={skill} className="px-3 py-1 bg-surface-container-low text-on-surface-variant rounded-md font-data-mono text-data-mono border border-border-low-alpha">{skill}</span>
                      ))}
                    </div>
                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-border-low-alpha pt-4">
                      <Link href="/candidates/1" className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors text-center">
                        View Profile
                      </Link>
                      <button
                        type="button"
                        onClick={() => addToShortlist(c)}
                        disabled={added}
                        className={`px-4 py-2 rounded-lg font-label-md text-label-md transition-colors shadow-sm border ${
                          added
                            ? "bg-surface-container-low border-border-low-alpha text-on-surface-variant cursor-default"
                            : "bg-white border-border-low-alpha text-primary hover:bg-surface-container-low"
                        }`}
                      >
                        {added ? "Added ✓" : "Add to Shortlist"}
                      </button>
                      <div className="hidden sm:block flex-1"></div>
                      <button type="button" className="self-end sm:self-auto p-2 text-outline hover:text-primary hover:bg-surface-container-low rounded-full transition-colors" title="Download Resume">
                        <span className="material-symbols-outlined">download</span>
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="mt-12 flex justify-center">
                <nav className="flex items-center gap-2">
                  <button type="button" className="p-2 border border-border-low-alpha rounded-lg text-outline hover:bg-surface-container-low disabled:opacity-50" disabled>
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>
                  <button type="button" className="w-10 h-10 flex items-center justify-center bg-primary text-on-primary rounded-lg font-data-mono text-data-mono">1</button>
                  <button type="button" className="w-10 h-10 flex items-center justify-center border border-border-low-alpha text-on-surface rounded-lg font-data-mono text-data-mono hover:bg-surface-container-low">2</button>
                  <button type="button" className="w-10 h-10 flex items-center justify-center border border-border-low-alpha text-on-surface rounded-lg font-data-mono text-data-mono hover:bg-surface-container-low">3</button>
                  <span className="px-2 text-outline">...</span>
                  <button type="button" className="p-2 border border-border-low-alpha rounded-lg text-outline hover:bg-surface-container-low">
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </nav>
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
