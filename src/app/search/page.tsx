"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addRecentSearch } from "@/lib/recent-searches";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/components/app/auth-provider";
import { TopAppBar } from "@/components/app/top-app-bar";


type ViewMode = "list" | "grid";

interface SearchedCandidate {
  id: string;
  fullName: string | null;
  currentTitle: string | null;
  location: string | null;
  yearsExperience: string | null;
  skills: string[] | null;
  summary: string | null;
  status: string;
  score: number | null;
  matchedSkills: string[];
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [experienceFilter, setExperienceFilter] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("list");
  const [results, setResults] = useState<SearchedCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  // Available filters that can be added
  const addable = [
    { key: "location", label: "Location", icon: "location_on", active: locationFilter !== null, add: () => setLocationFilter("Remote") },
    { key: "experience", label: "Min Experience", icon: "work", active: experienceFilter !== null, add: () => setExperienceFilter("5") },
    { key: "skill", label: "Skill", icon: "tag", active: skillFilter !== null, add: () => setSkillFilter("React") },
  ].filter((o) => !o.active);

  const performSearch = async () => {
    setLoading(true);
    try {
      const payload: { q: string; location?: string; minExperience?: number; skills?: string[] } = { q: q.trim() };
      
      if (locationFilter) {
        payload.location = locationFilter;
      }
      if (experienceFilter) {
        payload.minExperience = parseInt(experienceFilter) || 0;
      }
      if (skillFilter) {
        payload.skills = [skillFilter];
      }

      const res = await api.post<{ results: SearchedCandidate[]; count: number }>("/api/search", payload);
      setResults(res.results);

      if (q.trim() && profile?.tenantId) {
        addRecentSearch(profile.tenantId, q);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute semantic search";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Run search on mount if a query parameter exists in the URL
  useEffect(() => {
    const query = searchParams.get("q");
    if (query !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ(query);
      performSearch();
    } else {
      // Default fallback search when entering empty page
      performSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  // Helper to highlight terms inside candidate summaries
  const renderHighlightedSummary = (text: string, query: string) => {
    if (!text) return "No candidate summary available.";
    if (!query) return text;

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (terms.length === 0) return text;

    const regex = new RegExp(`\\b(${terms.join("|")})\\b`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) => {
      const isMatch = terms.includes(part.toLowerCase());
      return isMatch ? (
        <span key={index} className="brass-highlight font-medium">
          {part}
        </span>
      ) : (
        part
      );
    });
  };

  return (
    <AppShell>
      {/* Main Content Area */}
      <div className="flex flex-col min-h-screen relative">
        <TopAppBar
          leftContent={null}
          rightContent={
            <Link href="/upload" className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap">
              + Upload résumé
            </Link>
          }
        />

        {/* Main Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1000px] mx-auto">
            {/* Hero Search Area */}
            <div className="mb-12">
              <h1 className="font-headline-lg text-headline-lg text-primary mb-6">Semantic Search</h1>
              {/* Large Search Input */}
              <form onSubmit={handleSearchSubmit} className="relative flex items-center w-full bg-white rounded-xl ambient-shadow p-2 border border-border-low-alpha focus-within:border-primary transition-colors shadow-sm">
                <span className="material-symbols-outlined text-outline ml-4 mr-2" style={{ fontVariationSettings: "'FILL' 0" }}>search</span>
                <input
                  className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 font-body-md text-body-md text-on-surface py-3 px-2 placeholder-outline-variant"
                  placeholder="Describe your ideal candidate..."
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-tertiary-fixed text-on-tertiary-fixed px-6 py-3 rounded-lg font-label-md text-label-md hover:bg-tertiary-fixed-dim transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  Search
                </button>
              </form>
              {/* Filter Chips */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <span className="font-label-md text-label-md text-on-surface-variant mr-2">Filters:</span>
                {locationFilter !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-low-alpha rounded-full font-label-md text-[13px] text-on-surface shadow-sm cursor-pointer hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px] text-primary">location_on</span>
                    Location:
                    <input
                      type="text"
                      className="bg-transparent border-none outline-none font-label-md text-[13px] text-on-surface w-16 focus:ring-0 p-0 ml-1"
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                    />
                    <button type="button" onClick={() => setLocationFilter(null)} aria-label="Remove location filter" className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface ml-1">close</button>
                  </div>
                )}
                {experienceFilter !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-low-alpha rounded-full font-label-md text-[13px] text-on-surface shadow-sm cursor-pointer hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px] text-primary">work</span>
                    Min Experience:
                    <input
                      type="number"
                      className="bg-transparent border-none outline-none font-label-md text-[13px] text-on-surface w-8 focus:ring-0 p-0 ml-1"
                      value={experienceFilter}
                      onChange={(e) => setExperienceFilter(e.target.value)}
                    />
                    yrs
                    <button type="button" onClick={() => setExperienceFilter(null)} aria-label="Remove experience filter" className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface ml-1">close</button>
                  </div>
                )}
                {skillFilter !== null && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-low-alpha rounded-full font-label-md text-[13px] text-on-surface shadow-sm cursor-pointer hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px] text-primary">tag</span>
                    Skill:
                    <input
                      type="text"
                      className="bg-transparent border-none outline-none font-label-md text-[13px] text-on-surface w-16 focus:ring-0 p-0 ml-1"
                      value={skillFilter}
                      onChange={(e) => setSkillFilter(e.target.value)}
                    />
                    <button type="button" onClick={() => setSkillFilter(null)} aria-label="Remove skill filter" className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface ml-1">close</button>
                  </div>
                )}
                <div className="relative ml-2">
                  <button
                    type="button"
                    onClick={() => setAddOpen((o) => !o)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-primary font-label-md text-[13px] hover:bg-surface-container-low rounded-full transition-colors cursor-pointer"
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
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  {loading ? "Searching..." : `${results.length} Results Found`}
                </h2>
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

            {/* Loading Indicator */}
            {loading ? (
              <div className="bg-surface-white rounded-xl ambient-shadow p-12 border border-border-low-alpha flex flex-col items-center justify-center text-center">
                <span className="material-symbols-outlined text-[48px] text-primary mb-3 animate-spin">sync</span>
                <p className="font-body-md text-body-md text-on-surface-variant">Finding candidates that match your criteria...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="bg-surface-white rounded-xl ambient-shadow p-12 border border-border-low-alpha flex flex-col items-center justify-center text-center">
                <span className="material-symbols-outlined text-[48px] text-outline-variant mb-3" style={{ fontVariationSettings: "'FILL' 0" }}>search_off</span>
                <p className="font-body-md text-body-md text-on-surface-variant">No candidates match your search.</p>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {results.map((c) => {
                  const name = c.fullName || "Unnamed Candidate";
                  const initials = name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "C";
                  const displayScore = c.score ? Math.round(c.score * 100) : null;
                  
                  return (
                    <div key={c.id} className="bg-surface-white rounded-xl ambient-shadow p-5 border border-border-low-alpha relative overflow-hidden group hover:border-primary/30 transition-colors flex flex-col shadow-sm">
                      {/* Top Row: Profile & Score */}
                      <div className="flex justify-between items-start mb-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Link href={`/candidates/${c.id}`} className="w-11 h-11 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center text-primary font-headline-md flex-shrink-0">{initials}</Link>
                          <div className="min-w-0">
                            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-1.5 truncate">
                              <Link href={`/candidates/${c.id}`} className="hover:underline truncate">{name}</Link>
                            </h3>
                            <p className="font-body-md text-body-md text-on-surface-variant truncate">{c.currentTitle || "Title not parsed"}</p>
                            <p className="font-label-md text-label-md text-outline mt-0.5 flex items-center gap-1 truncate">
                              <span className="material-symbols-outlined text-[14px]">location_on</span> {c.location || "Unknown"} • {c.yearsExperience ? `${Math.round(parseFloat(c.yearsExperience))}y` : "No exp"}
                            </p>
                          </div>
                        </div>
                        {/* Match Badge */}
                        {displayScore !== null && (
                          <div className="brass-badge px-3 py-1.5 rounded-full flex items-center gap-1.5 font-label-md text-label-md font-semibold flex-shrink-0 bg-secondary-fixed/30 text-on-secondary-fixed">
                            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                            {displayScore}%
                          </div>
                        )}
                      </div>
                      {/* Skills / Tags */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(c.skills || []).slice(0, 4).map((skill) => (
                          <span key={skill} className="px-2.5 py-1 bg-surface-container-low text-on-surface-variant rounded-md font-data-mono text-data-mono border border-border-low-alpha">{skill}</span>
                        ))}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 border-t border-border-low-alpha pt-4 mt-auto">
                        <Link href={`/candidates/${c.id}`} className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors text-center">
                          View Profile
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-6">
                {results.map((c) => {
                  const name = c.fullName || "Unnamed Candidate";
                  const initials = name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "C";
                  const displayScore = c.score ? Math.round(c.score * 100) : null;
                  
                  return (
                    <div key={c.id} className="bg-surface-white rounded-xl ambient-shadow p-6 border border-border-low-alpha relative overflow-hidden group hover:border-primary/30 transition-colors shadow-sm">
                      {/* Top Row: Profile & Score */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                          <Link href={`/candidates/${c.id}`} className="w-14 h-14 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center text-primary font-headline-md flex-shrink-0">{initials}</Link>
                          <div>
                            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                              <Link href={`/candidates/${c.id}`} className="hover:underline">{name}</Link>
                            </h3>
                            <p className="font-body-md text-body-md text-on-surface-variant">{c.currentTitle || "Title not parsed"}</p>
                            <p className="font-label-md text-label-md text-outline mt-1 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">location_on</span> {c.location || "Unknown"} • {c.yearsExperience ? `${Math.round(parseFloat(c.yearsExperience))} years exp.` : "No exp"}
                            </p>
                          </div>
                        </div>
                        {/* Match Badge */}
                        {displayScore !== null && (
                          <div className="flex flex-col items-end">
                            <div className="brass-badge px-4 py-2 rounded-full flex items-center gap-2 font-label-md text-label-md font-semibold bg-secondary-fixed/30 text-on-secondary-fixed">
                              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                              {displayScore}% Match
                            </div>
                          </div>
                        )}
                      </div>
                      {/* AI Summary */}
                      <div className="bg-bg-cream rounded-lg p-4 mb-4 border border-border-low-alpha">
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>summarize</span>
                          <p className="font-body-md text-body-md text-on-surface leading-relaxed">
                            {renderHighlightedSummary(c.summary || "", q)}
                          </p>
                        </div>
                      </div>
                      {/* Skills / Tags */}
                      <div className="flex flex-wrap gap-2 mb-6">
                        {(c.skills || []).map((skill) => {
                          const isMatched = c.matchedSkills.includes(skill);
                          return (
                            <span
                              key={skill}
                              className={`px-3 py-1 rounded-md font-data-mono text-data-mono border ${
                                isMatched
                                  ? "bg-tertiary-fixed/20 text-on-tertiary-fixed border-tertiary-fixed/30"
                                  : "bg-surface-container-low text-on-surface-variant border-border-low-alpha"
                              }`}
                            >
                              {skill}
                            </span>
                          );
                        })}
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-border-low-alpha pt-4">
                        <Link href={`/candidates/${c.id}`} className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors text-center">
                          View Profile
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg-cream">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
