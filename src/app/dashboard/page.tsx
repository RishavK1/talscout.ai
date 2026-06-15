"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { TopAppBar } from "@/components/app/top-app-bar";
import { getRecentSearches } from "@/lib/recent-searches";


interface SimpleCandidate {
  id: string;
  fullName: string | null;
  currentTitle: string | null;
  status: string;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [semanticQuery, setSemanticQuery] = useState("");
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [processedCandidates, setProcessedCandidates] = useState(0);
  const [shortlistedCount, setShortlistedCount] = useState(0);
  const [recentCandidates, setRecentCandidates] = useState<SimpleCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Recruiter";
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (profile?.tenantId) {
      setRecentSearches(getRecentSearches(profile.tenantId));
    }
  }, [profile?.tenantId]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch stats
        const totalRes = await api.get<{ total: number }>("/api/candidates?limit=1");
        setTotalCandidates(totalRes.total);

        const processedRes = await api.get<{ total: number }>("/api/candidates?status=ready&limit=1");
        setProcessedCandidates(processedRes.total);

        // Fetch recent candidates
        const listRes = await api.get<{ candidates: SimpleCandidate[] }>("/api/candidates?limit=5");
        setRecentCandidates(listRes.candidates);

        // Fetch shortlists to count them
        const shortlistsRes = await api.get<{ shortlists: any[] }>("/api/shortlists");
        const totalShortlisted = shortlistsRes.shortlists.reduce((acc: number, curr: any) => acc + curr.candidateCount, 0);
        setShortlistedCount(totalShortlisted);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

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

  return (
    <AppShell>
      {/* Main Content Area */}
      <div className="min-h-screen flex flex-col relative">
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
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input className="w-full pl-10 pr-4 py-2 bg-surface-white border border-border-low-alpha rounded-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Search across organization..." type="text" />
              </div>
            </form>
          }
          rightContent={
            <Link href="/upload" className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap">
              + Upload résumés
            </Link>
          }
        />
        {/* Main Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          {/* Greeting Section */}
          <section className="mb-12">
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Good morning, {displayName}.</h1>
            <p className="font-body-lg text-body-lg text-text-muted">Here is the latest intelligence on your recruitment pipeline.</p>
          </section>
          {/* Semantic Search Bar (Central) */}
          <section className="mb-16">
            <form
              onSubmit={handleSemanticSearchSubmit}
              className="bg-white p-2 rounded-2xl ambient-shadow border border-border-low-alpha flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0 focus-within:border-primary transition-colors"
            >
              <div className="hidden sm:block pl-4 pr-2 text-primary">
                <span className="material-symbols-outlined text-[28px]">robot_2</span>
              </div>
              <input value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} className="flex-1 bg-transparent border-none py-4 px-2 font-body-lg text-body-lg text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-0" placeholder="Try semantic search: 'Senior Python developers in Berlin with FinTech experience...'" type="text" />
              <button type="submit" className="bg-tertiary-fixed text-on-tertiary-fixed px-6 py-4 rounded-xl font-label-md text-label-md hover:bg-tertiary-fixed-dim transition-colors flex items-center justify-center gap-2 cursor-pointer">
                <span className="material-symbols-outlined text-[20px]">magic_button</span>
                Find Candidates
              </button>
            </form>
          </section>
          {/* Stat Cards Bento */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {/* Total Candidates */}
            <div className="bg-white p-6 rounded-[20px] ambient-shadow border border-border-low-alpha flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-surface-container rounded-lg text-primary">
                  <span className="material-symbols-outlined">folder_shared</span>
                </div>
              </div>
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-1">Total Candidates</p>
                <p className="font-data-mono text-display-lg text-primary tracking-tight">
                  {loading ? "..." : totalCandidates.toLocaleString()}
                </p>
              </div>
            </div>
            {/* Processed Resumes */}
            <div className="bg-white p-6 rounded-[20px] ambient-shadow border border-border-low-alpha flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-surface-container rounded-lg text-primary">
                  <span className="material-symbols-outlined">document_scanner</span>
                </div>
              </div>
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-1">Parsed / Ready Candidates</p>
                <p className="font-data-mono text-display-lg text-primary tracking-tight">
                  {loading ? "..." : processedCandidates.toLocaleString()}
                </p>
              </div>
            </div>
            {/* Active Searches */}
            <div className="bg-white p-6 rounded-[20px] ambient-shadow border border-border-low-alpha flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-surface-container rounded-lg text-primary">
                  <span className="material-symbols-outlined">manage_search</span>
                </div>
              </div>
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-1">Active AI Searches</p>
                <p className="font-data-mono text-display-lg text-primary tracking-tight">{loading ? "..." : "0"}</p>
              </div>
            </div>
            {/* Shortlisted */}
            <div className="bg-white p-6 rounded-[20px] ambient-shadow border border-border-low-alpha flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-secondary-fixed text-on-secondary-fixed rounded-lg">
                  <span className="material-symbols-outlined" data-weight="fill">star</span>
                </div>
              </div>
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-1">Shortlisted</p>
                <p className="font-data-mono text-display-lg text-primary tracking-tight">{loading ? "..." : shortlistedCount.toLocaleString()}</p>
              </div>
            </div>
          </section>
          {/* Tables Section (Asymmetric Split) */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Uploads (Takes up 2 columns) */}
            <div className="lg:col-span-2 bg-white rounded-[20px] ambient-shadow border border-border-low-alpha overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border-low-alpha flex justify-between items-center">
                <h3 className="font-headline-md text-headline-md text-primary">Recent Uploads</h3>
                <Link className="font-label-md text-label-md text-primary hover:underline" href="/candidates">View All</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-cream/50">
                      <th className="p-4 font-label-md text-label-md text-outline font-medium">Candidate Name</th>
                      <th className="p-4 font-label-md text-label-md text-outline font-medium">Role Parsed</th>
                      <th className="p-4 font-label-md text-label-md text-outline font-medium">Date Uploaded</th>
                      <th className="p-4 font-label-md text-label-md text-outline font-medium">AI Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                          Loading candidates...
                        </td>
                      </tr>
                    ) : recentCandidates.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                          No candidates found. Upload some résumés to get started!
                        </td>
                      </tr>
                    ) : (
                      recentCandidates.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => router.push(`/candidates/${c.id}`)}
                          className="border-b border-border-low-alpha hover:bg-surface-container-lowest transition-colors cursor-pointer"
                        >
                          <td className="p-4 font-body-md text-body-md text-on-surface font-medium">
                            {c.fullName || "Unnamed Draft"}
                          </td>
                          <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                            {c.currentTitle || "Not Parsed Yet"}
                          </td>
                          <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">
                            {formatUploadedDate(c.createdAt)}
                          </td>
                          <td className="p-4">
                            {c.status === "ready" ? (
                              <span className="inline-flex items-center px-2 py-1 bg-tertiary-fixed/20 text-tertiary-container rounded-full font-label-md text-[12px]">
                                <span className="material-symbols-outlined text-[14px] mr-1">check_circle</span> Parsed
                              </span>
                            ) : c.status === "processing" ? (
                              <span className="inline-flex items-center px-2 py-1 bg-surface-container-high text-on-surface-variant rounded-full font-label-md text-[12px]">
                                <span className="material-symbols-outlined text-[14px] mr-1 animate-spin">sync</span> In Progress
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 bg-error/10 text-error rounded-full font-label-md text-[12px]">
                                <span className="material-symbols-outlined text-[14px] mr-1">error</span> Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Recent Searches (Takes 1 column) */}
            <div className="lg:col-span-1 bg-white rounded-[20px] ambient-shadow border border-border-low-alpha overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border-low-alpha">
                <h3 className="font-headline-md text-headline-md text-primary">Recent Searches</h3>
              </div>
              <div className="flex-grow p-4 space-y-2">
                {recentSearches.length > 0 ? (
                  recentSearches.map((searchQuery, index) => (
                    <button
                      key={index}
                      onClick={() => router.push(`/search?q=${encodeURIComponent(searchQuery)}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5 text-primary">
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
              </div>
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
