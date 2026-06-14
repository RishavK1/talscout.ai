import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";

export default function UploadPage() {
  return (
    <AppShell>
      {/* Main Content Area */}
      <main className="min-h-screen flex flex-col overflow-x-hidden">
        {/* TopAppBar */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md flex flex-wrap justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-border-low-alpha">
          <div className="flex items-center gap-4 flex-1 min-w-[180px]">
            <div className="relative w-full max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">
                search
              </span>
              <input
                className="w-full bg-surface-container-low border-none rounded-full pl-10 pr-4 py-2 text-body-md focus:ring-1 focus:ring-primary"
                placeholder="Search files or candidates..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-4 text-on-surface-variant">
              <button
                type="button"
                className="material-symbols-outlined hover:bg-surface-container-low p-2 rounded-full transition-colors"
              >
                notifications
              </button>
              <button
                type="button"
                className="material-symbols-outlined hover:bg-surface-container-low p-2 rounded-full transition-colors"
              >
                history
              </button>
            </div>
            <button
              type="button"
              className="bg-primary text-white px-4 sm:px-6 py-2 rounded-full font-label-md text-label-md hover:shadow-lg transition-all scale-95 active:opacity-80 whitespace-nowrap"
            >
              + Upload résumés
            </button>
          </div>
        </header>

        {/* Canvas Area */}
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-12 py-8 sm:py-10 lg:py-12">
          <section className="mb-10">
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Upload résumés</h1>
            <p className="font-body-lg text-body-lg text-text-muted">
              Drop PDFs or Word docs. We&apos;ll read and structure them automatically.
            </p>
          </section>

          {/* Drag & Drop Zone */}
          <div
            className="bg-white border-2 border-dashed border-outline-variant rounded-lg p-8 sm:p-12 lg:p-16 mb-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer group hover:border-primary custom-shadow"
            id="drop-zone"
          >
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-primary text-4xl">cloud_upload</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-1">
              Drag &amp; drop résumés here
            </h3>
            <p className="font-body-md text-body-md text-text-muted mb-6">
              or{" "}
              <span className="text-primary font-semibold underline underline-offset-4">
                browse files
              </span>
            </p>
            <div className="px-4 py-2 bg-bg-cream rounded-full border border-border-low-alpha">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                PDF, DOCX · up to 10MB each
              </span>
            </div>
          </div>

          {/* Uploading List */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Uploading <span className="font-data-mono text-text-muted ml-2">(4)</span>
              </h2>
            </div>
            <div className="space-y-3">
              {/* Row 1 */}
              <div className="bg-white p-4 rounded-lg custom-shadow flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="w-10 h-10 rounded bg-primary-container/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex justify-between items-end mb-2">
                    <span className="font-label-md text-label-md text-on-surface">
                      Senior_UX_Designer.pdf
                    </span>
                    <span className="font-data-mono text-label-md text-text-muted">45%</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: "45%" }}></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-secondary-container/30 text-secondary rounded-full border border-secondary/20">
                  <span className="material-symbols-outlined text-sm animate-spin-slow">
                    progress_activity
                  </span>
                  <span className="font-label-md text-label-md">Processing</span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="bg-white p-4 rounded-lg custom-shadow flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="w-10 h-10 rounded bg-primary-container/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex justify-between items-end mb-2">
                    <span className="font-label-md text-label-md text-on-surface">
                      Marketing_Lead.docx
                    </span>
                    <span className="font-data-mono text-label-md text-text-muted">100%</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-tertiary" style={{ width: "100%" }}></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-tertiary-container/10 text-tertiary rounded-full border border-tertiary/20">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  <span className="font-label-md text-label-md">Ready</span>
                </div>
              </div>

              {/* Row 3 */}
              <div className="bg-white p-4 rounded-lg custom-shadow flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="w-10 h-10 rounded bg-primary-container/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex justify-between items-end mb-2">
                    <span className="font-label-md text-label-md text-on-surface">
                      Backend_Dev_V2.pdf
                    </span>
                    <span className="font-data-mono text-label-md text-text-muted">100%</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: "100%" }}></div>
                  </div>
                </div>
                <Link
                  href="/review"
                  className="flex items-center gap-2 px-3 py-1 bg-secondary-container/10 text-secondary rounded-full border border-secondary/20 hover:bg-secondary-container/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">priority_high</span>
                  <span className="font-label-md text-label-md">Needs review</span>
                </Link>
              </div>

              {/* Row 4 */}
              <div className="bg-white p-4 rounded-lg custom-shadow flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="w-10 h-10 rounded bg-primary-container/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex justify-between items-end mb-2">
                    <span className="font-label-md text-label-md text-on-surface">
                      Sales_Manager_Final.pdf
                    </span>
                    <span className="font-data-mono text-label-md text-text-muted">12%</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: "12%" }}></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-secondary-container/30 text-secondary rounded-full border border-secondary/20">
                  <span className="material-symbols-outlined text-sm animate-spin-slow">
                    progress_activity
                  </span>
                  <span className="font-label-md text-label-md">Processing</span>
                </div>
              </div>
            </div>
          </section>

          {/* Footer Card: ATS Import */}
          <div className="bg-surface-white/50 border border-border-low-alpha rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 custom-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-bg-cream flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">sync</span>
              </div>
              <div>
                <h4 className="font-label-md text-body-md text-on-surface font-semibold">
                  Import from your ATS
                </h4>
                <p className="text-label-md text-text-muted">
                  Directly sync with Bullhorn, Greenhouse, or Lever.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="px-6 py-2 border border-primary text-primary rounded-lg font-label-md text-label-md hover:bg-primary/5 transition-colors w-full sm:w-auto"
            >
              Connect
            </button>
          </div>
        </div>

        {/* Site Footer */}
        <footer className="mt-auto w-full py-12 px-4 sm:px-6 lg:px-12 border-t border-border-low-alpha bg-bg-cream grid grid-cols-1 md:grid-cols-4 gap-6 max-w-[1440px] mx-auto">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="text-headline-md font-headline-md text-primary block mb-4">TalScout</Link>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
              Augmenting human decision-making with ethical, precise recruitment intelligence.
            </p>
          </div>
          <div className="col-span-1 flex flex-col gap-3">
            <p className="font-label-md text-label-md text-on-surface font-semibold">Platform</p>
            <Link className="text-on-surface-variant hover:text-secondary transition-colors font-body-md" href="/#features">
              Features
            </Link>
            <Link className="text-on-surface-variant hover:text-secondary transition-colors font-body-md" href="/#features">
              Integrations
            </Link>
            <Link className="text-on-surface-variant hover:text-secondary transition-colors font-body-md" href="/#features">
              Success Stories
            </Link>
          </div>
          <div className="col-span-1 flex flex-col gap-3">
            <p className="font-label-md text-label-md text-on-surface font-semibold">Company</p>
            <a className="text-on-surface-variant hover:text-secondary transition-colors font-body-md" href="#">
              About Us
            </a>
            <Link className="text-on-surface-variant hover:text-secondary transition-colors font-body-md" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="text-on-surface-variant hover:text-secondary transition-colors font-body-md" href="/terms">
              Terms of Service
            </Link>
          </div>
          <div className="col-span-1 flex flex-col gap-3">
            <p className="font-label-md text-label-md text-on-surface font-semibold">Newsletter</p>
            <div className="flex gap-2">
              <input
                className="bg-white border-outline-variant rounded-lg px-3 py-2 text-sm focus:ring-primary w-full"
                placeholder="Your email"
                type="email"
              />
              <button type="button" className="bg-primary text-white px-4 py-2 rounded-lg font-label-md text-label-md">
                Join
              </button>
            </div>
            <p className="text-[12px] text-text-muted mt-4">© 2024 TalScout AI. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}
