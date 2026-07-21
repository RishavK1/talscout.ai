import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { PointerGlow } from "@/components/marketing/pointer-glow";

export default function DashboardEmptyPage() {
  return (
    <AppShell>
      <main className="flex min-h-dvh flex-col text-on-surface font-body-md">
        {/* TopAppBar */}
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2">
              <span className="text-text-muted font-label-md">Dashboard</span>
            </div>
          }
          rightContent={
            <Link href="/upload" className="group flex items-center gap-2 bg-gradient-to-r from-primary-container to-primary text-white px-5 py-2.5 rounded-lg font-label-md shadow-floating transition-all hover:-translate-y-0.5 active:scale-[0.97]">
              <span className="material-symbols-outlined text-sm" data-icon="add">add</span>
              <span>Upload résumés</span>
            </Link>
          }
        />
        {/* Scrollable Canvas */}
        <div className="flex-grow px-4 sm:px-6 lg:px-12 py-8 sm:py-12 max-w-[1440px] mx-auto w-full">
          {/* Empty State Card */}
          <section className="mb-16 flex justify-center">
            <PointerGlow
              className="w-full max-w-[800px] overflow-hidden rounded-[32px] glass-card"
              glowColor="rgba(169, 249, 49, 0.14)"
              glowSize={560}
              contentClassName="flex flex-col items-center p-6 sm:p-8 lg:p-12 text-center"
            >
              {/* Subtle Decorative Background Effect */}
              <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-tertiary-fixed/10 to-transparent -z-10 rounded-full blur-3xl opacity-50"></div>
              <div className="w-24 h-24 bg-gradient-to-br from-secondary-fixed to-secondary-fixed-dim rounded-full flex items-center justify-center mb-8 relative shadow-floating">
                <span className="material-symbols-outlined text-on-secondary-fixed text-[48px] animate-pulse" data-icon="clinical_notes">clinical_notes</span>
                <div className="absolute -right-1 -top-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-on-primary shadow-lg border-4 border-white">
                  <span className="material-symbols-outlined text-[16px]" data-icon="add">add</span>
                </div>
              </div>
              <h2 className="font-headline-lg text-2xl sm:text-headline-lg text-primary mb-4">Let&apos;s add your first candidates</h2>
              <p className="text-body-lg text-text-muted max-w-md mx-auto mb-10 leading-relaxed">
                Start building your talent pipeline with TalScout. Upload multiple PDFs or sync from your existing ATS to unlock AI-powered insights and matching.
              </p>
              <div className="flex flex-wrap justify-center items-center gap-4">
                <Link href="/upload" className="px-8 py-4 bg-gradient-to-r from-secondary to-secondary-fixed-dim text-white rounded-full font-label-md shadow-floating transition-all hover:-translate-y-0.5 active:scale-[0.97]">
                  Upload résumés
                </Link>
                <button type="button" className="px-8 py-4 text-primary font-label-md border border-primary/20 rounded-full hover:bg-primary/5 transition-all">
                  Import from ATS
                </button>
              </div>
              <div className="mt-12 flex items-center gap-3 py-3 px-5 bg-tertiary-fixed/10 rounded-2xl border border-tertiary-fixed/20">
                <span className="material-symbols-outlined text-tertiary" data-icon="bolt">bolt</span>
                <span className="text-label-md font-medium text-tertiary">Pro tip: Drag and drop folders to bulk-process up to 50 candidates.</span>
              </div>
            </PointerGlow>
          </section>
          {/* Skeleton Stats Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1000px] mx-auto opacity-40">
            {/* Stat Card 1 */}
            <div className="bg-white/50 border border-border-low-alpha p-8 rounded-3xl flex flex-col gap-1">
              <span className="text-label-md text-text-muted uppercase tracking-wider">Total Candidates</span>
              <div className="flex items-baseline gap-2 mt-4">
                <span className="font-data-mono text-4xl text-primary">0</span>
                <span className="text-text-muted text-label-md">+0% this week</span>
              </div>
            </div>
            {/* Stat Card 2 */}
            <div className="bg-white/50 border border-border-low-alpha p-8 rounded-3xl flex flex-col gap-1">
              <span className="text-label-md text-text-muted uppercase tracking-wider">Active Searches</span>
              <div className="flex items-baseline gap-2 mt-4">
                <span className="font-data-mono text-4xl text-primary">0</span>
                <span className="text-text-muted text-label-md">No active campaigns</span>
              </div>
            </div>
            {/* Stat Card 3 */}
            <div className="bg-white/50 border border-border-low-alpha p-8 rounded-3xl flex flex-col gap-1">
              <span className="text-label-md text-text-muted uppercase tracking-wider">Shortlisted</span>
              <div className="flex items-baseline gap-2 mt-4">
                <span className="font-data-mono text-4xl text-primary">0</span>
                <span className="text-text-muted text-label-md">Awaiting selections</span>
              </div>
            </div>
          </section>
        </div>
        {/* Footer (Using Shared Component Mapping) */}
        <footer className="bg-bg-cream py-6 px-4 sm:px-6 lg:px-12 border-t border-border-low-alpha mt-auto">
          <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="text-body-md text-text-muted">© {new Date().getFullYear()} TalScout AI. All rights reserved.</span>
            <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
              <Link className="text-label-md text-outline hover:text-secondary transition-colors" href="/privacy">Privacy</Link>
              <Link className="text-label-md text-outline hover:text-secondary transition-colors" href="/terms">Terms</Link>
              <Link className="text-label-md text-outline hover:text-secondary transition-colors" href="/cookies">Cookie Policy</Link>
              <Link className="text-label-md text-outline hover:text-secondary transition-colors" href="/security">Security</Link>
            </div>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}
