import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";

export default function BillingPage() {
  return (
    <AppShell>
      {/* TopAppBar */}
      <header className="sticky top-0 z-40 bg-surface/80 dark:bg-surface-container/80 backdrop-blur-md border-b border-border-low-alpha flex flex-wrap justify-between items-center gap-3 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-4 bg-surface-container-low px-4 py-2 rounded-full hairline-border w-full sm:w-96">
          <span className="material-symbols-outlined text-outline text-[20px]">search</span>
          <input className="bg-transparent border-none focus:ring-0 text-label-md w-full placeholder:text-outline" placeholder="Search settings, invoices..." type="text" />
        </div>
        <div className="flex items-center gap-4">
          <button type="button" className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors">
            <span className="material-symbols-outlined">history</span>
          </button>
          <button type="button" className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors relative">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
          </button>
          <div className="h-8 w-[1px] bg-border-low-alpha mx-2"></div>
          <Link href="/upload" className="bg-primary text-white px-5 py-2 rounded-lg font-label-md text-label-md hover:opacity-90 transition-all active:scale-95 duration-100">
            + Upload résumés
          </Link>
        </div>
      </header>
      {/* Main Content Area */}
      <main className="pt-8 sm:pt-12 lg:pt-24 px-4 sm:px-6 lg:px-12 pb-12 sm:pb-16 lg:pb-24 max-w-[1440px] mx-auto">
        {/* Header */}
        <header className="mb-10">
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">Billing</h1>
          <p className="font-body-md text-body-md text-text-muted">Manage your workspace subscription, payment methods, and billing history.</p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section 1: Current Plan */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-[12px] p-8 card-shadow hairline-border">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-4">Current Plan</h2>
                  <p className="font-headline-md text-headline-md text-primary mb-1">Growth — $199/seat/mo</p>
                  <p className="font-body-md text-body-md text-on-surface-variant">7 seats · $1,393/mo</p>
                </div>
                <div className="text-right">
                  <span className="font-label-md text-label-md bg-tertiary-fixed-dim/20 text-tertiary px-3 py-1 rounded-full">Active</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-8 text-on-surface-variant">
                <span className="material-symbols-outlined text-[20px]">calendar_today</span>
                <span className="font-body-md text-body-md">Next renewal date:</span>
                <span className="font-data-mono text-data-mono font-medium">Nov 14, 2024</span>
              </div>
              <div className="flex gap-4">
                <button type="button" className="px-6 py-2.5 rounded-lg font-label-md text-label-md bg-primary text-white hover:bg-primary-container transition-colors">Manage seats</button>
                <Link href="/pricing" className="px-6 py-2.5 rounded-lg font-label-md text-label-md border border-primary text-primary hover:bg-primary/5 transition-colors">Change plan</Link>
              </div>
            </div>
          </section>
          {/* Section 2: Payment Method */}
          <section className="lg:col-span-4">
            <div className="bg-white rounded-[12px] p-8 card-shadow hairline-border h-full flex flex-col">
              <h2 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-6">Payment Method</h2>
              <div className="flex items-center gap-4 mb-auto">
                <div className="w-14 h-10 bg-bg-secondary rounded border border-border-low-alpha flex items-center justify-center p-2">
                  <span className="font-label-md text-[12px] font-semibold text-primary tracking-wide">VISA</span>
                </div>
                <div>
                  <p className="font-label-md text-label-md text-on-surface">•••• 4242</p>
                  <p className="font-data-mono text-[12px] text-text-muted">Expires 12/26</p>
                </div>
              </div>
              <button type="button" className="mt-8 w-full py-2.5 rounded-lg font-label-md text-label-md border border-outline-variant text-on-surface hover:bg-surface-container transition-colors">
                Update payment method
              </button>
            </div>
          </section>
          {/* Section 3: Invoices */}
          <section className="lg:col-span-12 mt-4">
            <div className="bg-white rounded-[12px] overflow-hidden card-shadow hairline-border">
              <div className="p-8 border-b border-border-low-alpha flex justify-between items-center">
                <h2 className="font-headline-md text-headline-md text-on-surface">Invoice History</h2>
                <button type="button" className="flex items-center gap-2 text-primary font-label-md text-label-md hover:underline">
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Download all (ZIP)
                </button>
              </div>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="bg-bg-secondary/50 border-b border-border-low-alpha">
                    <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Date</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Invoice ID</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Amount</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Status</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-text-muted text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-low-alpha">
                  <tr className="hover:bg-bg-secondary/30 transition-colors group">
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">Oct 14, 2024</td>
                    <td className="px-8 py-5 font-label-md text-label-md text-on-surface-variant">INV-2024-010</td>
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">$1,393.00</td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed-dim/20 text-tertiary font-label-md text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Paid
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button type="button" className="text-primary font-label-md text-label-md hover:underline">Download</button>
                    </td>
                  </tr>
                  <tr className="hover:bg-bg-secondary/30 transition-colors">
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">Sep 14, 2024</td>
                    <td className="px-8 py-5 font-label-md text-label-md text-on-surface-variant">INV-2024-009</td>
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">$1,393.00</td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed-dim/20 text-tertiary font-label-md text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Paid
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button type="button" className="text-primary font-label-md text-label-md hover:underline">Download</button>
                    </td>
                  </tr>
                  <tr className="hover:bg-bg-secondary/30 transition-colors">
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">Aug 14, 2024</td>
                    <td className="px-8 py-5 font-label-md text-label-md text-on-surface-variant">INV-2024-008</td>
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">$1,393.00</td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed-dim/20 text-tertiary font-label-md text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Paid
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button type="button" className="text-primary font-label-md text-label-md hover:underline">Download</button>
                    </td>
                  </tr>
                  <tr className="hover:bg-bg-secondary/30 transition-colors">
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">Jul 14, 2024</td>
                    <td className="px-8 py-5 font-label-md text-label-md text-on-surface-variant">INV-2024-007</td>
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">$1,194.00</td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed-dim/20 text-tertiary font-label-md text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Paid
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button type="button" className="text-primary font-label-md text-label-md hover:underline">Download</button>
                    </td>
                  </tr>
                  <tr className="hover:bg-bg-secondary/30 transition-colors">
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">Jun 14, 2024</td>
                    <td className="px-8 py-5 font-label-md text-label-md text-on-surface-variant">INV-2024-006</td>
                    <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">$1,194.00</td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed-dim/20 text-tertiary font-label-md text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Paid
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button type="button" className="text-primary font-label-md text-label-md hover:underline">Download</button>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
              <div className="p-6 bg-bg-secondary/20 flex justify-center">
                <button type="button" className="font-label-md text-label-md text-text-muted hover:text-primary flex items-center gap-1">
                  Show older invoices
                  <span className="material-symbols-outlined text-[18px]">expand_more</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-12 bg-bg-cream dark:bg-surface-container-lowest border-t border-border-low-alpha">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-[1440px] mx-auto">
          <div className="col-span-1">
            <Link href="/" className="text-headline-md font-headline-md text-primary dark:text-primary-fixed mb-4 inline-block">TalScout</Link>
            <p className="font-body-md text-body-md text-on-surface dark:text-on-surface-variant">Precision AI for high-performance recruitment teams.</p>
          </div>
          <div className="col-span-1">
            <h4 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-4">Product</h4>
            <ul className="space-y-2">
              <li><Link className="font-body-md text-body-md text-on-surface hover:text-secondary transition-colors" href="/#features">Features</Link></li>
              <li><Link className="font-body-md text-body-md text-on-surface hover:text-secondary transition-colors" href="/#features">Integrations</Link></li>
              <li><Link className="font-body-md text-body-md text-on-surface hover:text-secondary transition-colors" href="/#features">Enterprise</Link></li>
            </ul>
          </div>
          <div className="col-span-1">
            <h4 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-4">Legal</h4>
            <ul className="space-y-2">
              <li><Link className="font-body-md text-body-md text-on-surface hover:text-secondary transition-colors" href="/privacy">Privacy</Link></li>
              <li><Link className="font-body-md text-body-md text-on-surface hover:text-secondary transition-colors" href="/terms">Terms</Link></li>
              <li><Link className="font-body-md text-body-md text-on-surface hover:text-secondary transition-colors" href="/cookies">Cookie Policy</Link></li>
              <li><Link className="font-body-md text-body-md text-on-surface hover:text-secondary transition-colors" href="/security">Security</Link></li>
            </ul>
          </div>
          <div className="col-span-1">
            <h4 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-4">Connect</h4>
            <div className="flex gap-4">
              <a className="text-on-surface-variant hover:text-primary transition-colors" href="mailto:support@talscout.ai"><span className="material-symbols-outlined">alternate_email</span></a>
              <a className="text-on-surface-variant hover:text-primary transition-colors" href="https://twitter.com" target="_blank" rel="noreferrer"><span className="material-symbols-outlined">public</span></a>
            </div>
          </div>
        </div>
        <div className="max-w-[1440px] mx-auto mt-12 pt-8 border-t border-border-low-alpha text-center">
          <p className="font-label-md text-label-md text-text-muted">© 2024 TalScout AI. All rights reserved.</p>
        </div>
      </footer>
    </AppShell>
  );
}
