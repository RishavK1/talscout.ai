import Link from "next/link";

export default function InviteTeamOnboardingPage() {
  return (
    <div className="min-h-screen flex flex-col font-body-md text-body-md overflow-x-hidden">
      {/* Top Logo Section */}
      <header className="w-full flex justify-center pt-12 pb-8">
        <Link
          href="/"
          className="font-headline-lg text-headline-md text-primary tracking-tight"
        >
          TalScout
        </Link>
      </header>

      <main className="flex-grow flex flex-col items-center px-4 sm:px-6 pb-12 sm:pb-16 lg:pb-24">
        {/* Progress Indicator (Step 3 of 3) */}
        <div className="flex items-center gap-2 mb-12 w-full max-w-[400px]">
          <div className="h-1 flex-1 bg-primary/20 rounded-full"></div>
          <div className="h-1 flex-1 bg-primary/20 rounded-full"></div>
          <div className="h-1.5 flex-1 bg-primary rounded-full"></div>
        </div>

        {/* Central Card Container */}
        <div className="bg-surface-white w-full max-w-[640px] rounded-[16px] shadow-soft p-4 sm:p-6 lg:p-12 flex flex-col items-center text-center">
          {/* Headline & Subtext */}
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">
            Invite your recruiters
          </h1>
          <p className="font-body-md text-body-md text-text-muted mb-10">
            You can always add more later.
          </p>

          {/* Invite Rows */}
          <div className="w-full space-y-4 mb-8">
            {/* Row 1 (Pre-filled) */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <div className="flex-grow text-left">
                <label className="font-label-md text-label-md text-on-surface-variant block mb-1.5">
                  Email address
                </label>
                <input
                  className="w-full px-4 py-3 bg-bg-cream border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md"
                  placeholder="name@company.com"
                  type="email"
                  defaultValue="m.chen@apex-staffing.com"
                />
              </div>
              <div className="w-full sm:w-40 text-left">
                <label className="font-label-md text-label-md text-on-surface-variant block mb-1.5">
                  Role
                </label>
                <select
                  className="w-full px-4 py-3 bg-bg-cream border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md cursor-pointer"
                  defaultValue="Recruiter"
                >
                  <option>Admin</option>
                  <option>Recruiter</option>
                  <option>Viewer</option>
                </select>
              </div>
            </div>

            {/* Row 2 */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <div className="flex-grow text-left">
                <input
                  className="w-full px-4 py-3 bg-white border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md"
                  placeholder="name@company.com"
                  type="email"
                />
              </div>
              <div className="w-full sm:w-40 text-left">
                <select
                  className="w-full px-4 py-3 bg-white border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md cursor-pointer"
                  defaultValue="Recruiter"
                >
                  <option>Admin</option>
                  <option>Recruiter</option>
                  <option>Viewer</option>
                </select>
              </div>
            </div>

            {/* Row 3 */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <div className="flex-grow text-left">
                <input
                  className="w-full px-4 py-3 bg-white border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md"
                  placeholder="name@company.com"
                  type="email"
                />
              </div>
              <div className="w-full sm:w-40 text-left">
                <select
                  className="w-full px-4 py-3 bg-white border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md cursor-pointer"
                  defaultValue="Recruiter"
                >
                  <option>Admin</option>
                  <option>Recruiter</option>
                  <option>Viewer</option>
                </select>
              </div>
            </div>
          </div>

          {/* Add Another Button */}
          <button
            type="button"
            className="flex items-center gap-2 text-primary font-label-md text-label-md hover:opacity-80 transition-opacity mb-8 group"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>Add another</span>
          </button>

          {/* Usage Note */}
          <div className="bg-bg-cream/50 px-4 py-2 rounded-full mb-12">
            <p className="font-label-md text-label-md text-secondary">
              You have{" "}
              <span className="font-data-mono text-secondary-container bg-primary px-1.5 py-0.5 rounded text-white">
                3 of 10
              </span>{" "}
              seats remaining on your Growth plan.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-wrap items-center justify-between gap-3 pt-8 border-t border-border-low-alpha">
            <Link
              href="/dashboard"
              className="px-6 py-3 font-label-md text-label-md text-text-muted hover:text-primary transition-colors"
            >
              Skip for now
            </Link>
            <Link
              href="/dashboard"
              className="px-8 py-3 bg-primary text-white font-label-md text-label-md rounded-lg hover:shadow-lg active:scale-95 transition-all"
            >
              Send invites &amp; finish
            </Link>
          </div>
        </div>

        {/* Decorative Background Elements (Subtle Brass Gradient) */}
        <div className="fixed -bottom-64 -right-64 w-[600px] h-[600px] bg-secondary-fixed/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="fixed -top-64 -left-64 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
      </main>

      {/* Simple Footer Copyright */}
      <footer className="w-full text-center pb-8">
        <p className="font-label-md text-label-md text-text-muted/60">
          © 2024 TalScout AI. Premium intelligence for human-centric hiring.
        </p>
      </footer>
    </div>
  );
}
