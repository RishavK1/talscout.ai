import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
            <Button asChild variant="gradient">
              <Link href="/upload">
                <span className="material-symbols-outlined text-sm" data-icon="add">add</span>
                <span>Upload résumés</span>
              </Link>
            </Button>
          }
        />
        {/* Scrollable Canvas */}
        <div className="flex-grow px-4 sm:px-6 lg:px-12 py-8 sm:py-12 max-w-[1440px] mx-auto w-full">
          {/* Empty State Card */}
          <section className="mb-16 flex justify-center">
            <Card className="w-full max-w-[800px] [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)] lg:[--card-spacing:--spacing(12)]">
              <CardContent className="flex flex-col items-center text-center">
                <div className="w-24 h-24 bg-secondary-fixed rounded-full flex items-center justify-center mb-6 relative">
                  <span className="material-symbols-outlined text-on-secondary-fixed text-[48px] animate-pulse" data-icon="clinical_notes">clinical_notes</span>
                  <div className="absolute -right-1 -top-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-on-primary border-4 border-white">
                    <span className="material-symbols-outlined text-[16px]" data-icon="add">add</span>
                  </div>
                </div>
                <h2 className="font-headline-lg text-2xl sm:text-headline-lg text-primary mb-4">Let&apos;s add your first candidates</h2>
                <p className="text-body-lg text-text-muted max-w-md mx-auto mb-8 leading-relaxed">
                  Start building your talent pipeline with TalScout. Upload multiple PDFs or sync from your existing ATS to unlock AI-powered insights and matching.
                </p>
                <div className="flex flex-wrap justify-center items-center gap-4">
                  <Button asChild variant="gradient" size="lg" className="h-auto rounded-full px-8 py-4">
                    <Link href="/upload">Upload résumés</Link>
                  </Button>
                  <Button type="button" variant="outline" size="lg" className="h-auto rounded-full border-primary/20 px-8 py-4 text-primary hover:bg-primary/5">
                    Import from ATS
                  </Button>
                </div>
                <div className="mt-8 flex items-center gap-3 py-3 px-5 bg-tertiary-fixed/10 rounded-xl border border-tertiary-fixed/20">
                  <span className="material-symbols-outlined text-tertiary" data-icon="bolt">bolt</span>
                  <span className="text-label-md font-medium text-tertiary">Pro tip: Drag and drop folders to bulk-process up to 50 candidates.</span>
                </div>
              </CardContent>
            </Card>
          </section>
          {/* Skeleton Stats Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1000px] mx-auto opacity-40">
            {/* Stat Card 1 */}
            <Card className="bg-white/50 [--card-spacing:--spacing(8)]">
              <CardContent className="flex flex-col gap-1">
                <span className="text-label-md text-text-muted uppercase tracking-wider">Total Candidates</span>
                <div className="flex items-baseline gap-2 mt-4">
                  <span className="font-data-mono text-4xl text-primary">0</span>
                  <span className="text-text-muted text-label-md">+0% this week</span>
                </div>
              </CardContent>
            </Card>
            {/* Stat Card 2 */}
            <Card className="bg-white/50 [--card-spacing:--spacing(8)]">
              <CardContent className="flex flex-col gap-1">
                <span className="text-label-md text-text-muted uppercase tracking-wider">Active Searches</span>
                <div className="flex items-baseline gap-2 mt-4">
                  <span className="font-data-mono text-4xl text-primary">0</span>
                  <span className="text-text-muted text-label-md">No active campaigns</span>
                </div>
              </CardContent>
            </Card>
            {/* Stat Card 3 */}
            <Card className="bg-white/50 [--card-spacing:--spacing(8)]">
              <CardContent className="flex flex-col gap-1">
                <span className="text-label-md text-text-muted uppercase tracking-wider">Shortlisted</span>
                <div className="flex items-baseline gap-2 mt-4">
                  <span className="font-data-mono text-4xl text-primary">0</span>
                  <span className="text-text-muted text-label-md">Awaiting selections</span>
                </div>
              </CardContent>
            </Card>
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
