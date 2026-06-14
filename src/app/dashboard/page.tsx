"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";

export default function DashboardPage() {
  const router = useRouter();
  const [semanticQuery, setSemanticQuery] = useState("");

  return (
    <AppShell>
      {/* Main Content Area */}
      <div className="min-h-screen flex flex-col relative">
        {/* TopAppBar */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md flex flex-wrap justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-border-low-alpha">
          {/* Search on Left */}
          <div className="flex-1 min-w-[200px] max-w-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push("/search");
              }}
            >
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-full font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Search across organization..." type="text" />
              </div>
            </form>
          </div>
          {/* Trailing Actions */}
          <div className="flex items-center gap-4">
            <button type="button" className="flex items-center justify-center w-10 h-10 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200 active:opacity-80">
              <span className="material-symbols-outlined">history</span>
            </button>
            <button type="button" className="flex items-center justify-center w-10 h-10 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200 active:opacity-80">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <Link href="/upload" className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors duration-200 shadow-sm">
              + Upload résumés
            </Link>
            <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline-md text-[14px] leading-none ml-2 cursor-pointer">
              R
            </div>
          </div>
        </header>
        {/* Main Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          {/* Greeting Section */}
          <section className="mb-12">
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Good morning, Rishav.</h1>
            <p className="font-body-lg text-body-lg text-text-muted">Here is the latest intelligence on your recruitment pipeline.</p>
          </section>
          {/* Semantic Search Bar (Central) */}
          <section className="mb-16">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push("/search");
              }}
              className="bg-white p-2 rounded-2xl ambient-shadow border border-border-low-alpha flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0 focus-within:border-primary transition-colors"
            >
              <div className="hidden sm:block pl-4 pr-2 text-primary">
                <span className="material-symbols-outlined text-[28px]">robot_2</span>
              </div>
              <input value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} className="flex-1 bg-transparent border-none py-4 px-2 font-body-lg text-body-lg text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-0" placeholder="Try semantic search: 'Senior Python developers in Berlin with FinTech experience...'" type="text" />
              <button type="submit" className="bg-tertiary-fixed text-on-tertiary-fixed px-6 py-4 rounded-xl font-label-md text-label-md hover:bg-tertiary-fixed-dim transition-colors flex items-center justify-center gap-2">
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
                <div className="flex items-center text-tertiary-container bg-tertiary-fixed/20 px-2 py-1 rounded font-label-md text-[12px]">
                  <span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>
                  12%
                </div>
              </div>
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-1">Total Candidates</p>
                <p className="font-data-mono text-display-lg text-primary tracking-tight">12,450</p>
              </div>
            </div>
            {/* Processed Resumes */}
            <div className="bg-white p-6 rounded-[20px] ambient-shadow border border-border-low-alpha flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-surface-container rounded-lg text-primary">
                  <span className="material-symbols-outlined">document_scanner</span>
                </div>
                <div className="flex items-center text-tertiary-container bg-tertiary-fixed/20 px-2 py-1 rounded font-label-md text-[12px]">
                  <span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>
                  8%
                </div>
              </div>
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-1">Processed Resumes (30d)</p>
                <p className="font-data-mono text-display-lg text-primary tracking-tight">1,204</p>
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
                <p className="font-data-mono text-display-lg text-primary tracking-tight">42</p>
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
                <p className="font-data-mono text-display-lg text-primary tracking-tight">318</p>
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
                    <tr className="border-b border-border-low-alpha hover:bg-surface-container-lowest transition-colors">
                      <td className="p-4 font-body-md text-body-md text-on-surface font-medium">Sarah Jenkins</td>
                      <td className="p-4 font-body-md text-body-md text-on-surface-variant">Lead Product Designer</td>
                      <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">Oct 24, 09:41</td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-1 bg-tertiary-fixed/20 text-tertiary-container rounded-full font-label-md text-[12px]">
                          <span className="material-symbols-outlined text-[14px] mr-1">check_circle</span> Parsed
                        </span>
                      </td>
                    </tr>
                    <tr className="border-b border-border-low-alpha hover:bg-surface-container-lowest transition-colors">
                      <td className="p-4 font-body-md text-body-md text-on-surface font-medium">Michael Chang</td>
                      <td className="p-4 font-body-md text-body-md text-on-surface-variant">Backend Engineer</td>
                      <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">Oct 24, 08:12</td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-1 bg-tertiary-fixed/20 text-tertiary-container rounded-full font-label-md text-[12px]">
                          <span className="material-symbols-outlined text-[14px] mr-1">check_circle</span> Parsed
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-4 font-body-md text-body-md text-on-surface font-medium">Elena Rostova</td>
                      <td className="p-4 font-body-md text-body-md text-on-surface-variant">Data Scientist</td>
                      <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">Oct 23, 16:55</td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-1 bg-tertiary-fixed/20 text-tertiary-container rounded-full font-label-md text-[12px]">
                          <span className="material-symbols-outlined text-[14px] mr-1">check_circle</span> Parsed
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {/* Recent Searches (Takes 1 column) */}
            <div className="lg:col-span-1 bg-white rounded-[20px] ambient-shadow border border-border-low-alpha overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border-low-alpha">
                <h3 className="font-headline-md text-headline-md text-primary">Recent Searches</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="group flex items-start gap-3 p-3 hover:bg-bg-cream rounded-xl transition-colors cursor-pointer border border-transparent hover:border-border-low-alpha">
                  <span className="material-symbols-outlined text-outline mt-1 group-hover:text-primary transition-colors">history</span>
                  <div>
                    <p className="font-body-md text-body-md text-on-surface line-clamp-2">&quot;Senior Frontend React developers in London willing to relocate&quot;</p>
                    <p className="font-data-mono text-[12px] text-text-muted mt-1">42 results • 2 hrs ago</p>
                  </div>
                </div>
                <div className="group flex items-start gap-3 p-3 hover:bg-bg-cream rounded-xl transition-colors cursor-pointer border border-transparent hover:border-border-low-alpha">
                  <span className="material-symbols-outlined text-outline mt-1 group-hover:text-primary transition-colors">history</span>
                  <div>
                    <p className="font-body-md text-body-md text-on-surface line-clamp-2">&quot;Machine learning engineer with NLP experience and PyTorch&quot;</p>
                    <p className="font-data-mono text-[12px] text-text-muted mt-1">18 results • Yesterday</p>
                  </div>
                </div>
                <div className="group flex items-start gap-3 p-3 hover:bg-bg-cream rounded-xl transition-colors cursor-pointer border border-transparent hover:border-border-low-alpha">
                  <span className="material-symbols-outlined text-outline mt-1 group-hover:text-primary transition-colors">history</span>
                  <div>
                    <p className="font-body-md text-body-md text-on-surface line-clamp-2">&quot;VP of Sales SaaS B2B Enterprise&quot;</p>
                    <p className="font-data-mono text-[12px] text-text-muted mt-1">5 results • Oct 22</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
