import Link from "next/link";
import { FaqAccordion } from "@/components/pricing/faq-accordion";
import { PricingPlans } from "@/components/pricing/pricing-plans";

export default function PricingPage() {
  return (
    <div className="font-body-md text-on-surface selection:bg-secondary-container bg-bg-cream">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-border-low-alpha shadow-sm">
        <div className="flex justify-between items-center px-4 sm:px-6 lg:px-12 py-4 max-w-[1440px] mx-auto">
          <Link
            href="/"
            className="text-headline-md font-headline-lg text-primary cursor-pointer transition-all duration-200"
          >
            TalScout
          </Link>
          <div className="hidden md:flex space-x-8 items-center">
            <Link
              className="text-on-surface-variant hover:text-primary transition-colors font-label-md text-label-md"
              href="/#features"
            >
              Product
            </Link>
            <Link
              className="text-primary font-semibold border-b-2 border-secondary transition-colors font-label-md text-label-md"
              href="/pricing"
            >
              Pricing
            </Link>
            <Link
              className="text-on-surface-variant hover:text-primary transition-colors font-label-md text-label-md"
              href="/#features"
            >
              Solutions
            </Link>
            <Link
              className="text-on-surface-variant hover:text-primary transition-colors font-label-md text-label-md"
              href="/#features"
            >
              Resources
            </Link>
          </div>
          <div className="flex items-center space-x-3 sm:space-x-6">
            <Link
              className="text-on-surface-variant font-label-md text-label-md hover:text-primary transition-colors cursor-pointer"
              href="/login"
            >
              Log in
            </Link>
            <Link
              className="bg-primary text-white px-6 py-2 rounded-lg font-label-md text-label-md hover:opacity-90 transition-all cursor-pointer"
              href="/signup"
            >
              Start free
            </Link>
          </div>
        </div>
      </nav>
      <main className="pt-32 pb-12 sm:pb-16 lg:pb-24">
        {/* Hero Section */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 text-center">
          <h1 className="font-display-lg text-3xl sm:text-display-lg text-primary mb-4">Simple per-seat pricing</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Pay per recruiter. Cancel anytime.</p>
          <PricingPlans />
        </section>
        {/* Comparison Table */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 mb-24">
          <h2 className="font-headline-lg text-headline-lg text-primary text-center mb-12">
            Detailed Feature Comparison
          </h2>
          <div className="bg-surface-white rounded-xl overflow-hidden border border-border-low-alpha shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left border-collapse">
              <thead>
                <tr className="bg-bg-secondary">
                  <th className="p-6 font-label-md text-label-md text-on-surface-variant border-b border-border-low-alpha">
                    Feature
                  </th>
                  <th className="p-6 font-label-md text-label-md text-primary border-b border-border-low-alpha">
                    Starter
                  </th>
                  <th className="p-6 font-label-md text-label-md text-primary border-b border-border-low-alpha">
                    Growth
                  </th>
                  <th className="p-6 font-label-md text-label-md text-primary border-b border-border-low-alpha">
                    Scale
                  </th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md">
                <tr className="border-b border-border-low-alpha">
                  <td className="p-6">Résumé Parsing</td>
                  <td className="p-6">Basic</td>
                  <td className="p-6">Advanced</td>
                  <td className="p-6">Unlimited</td>
                </tr>
                <tr className="border-b border-border-low-alpha">
                  <td className="p-6">Semantic Search</td>
                  <td className="p-6">—</td>
                  <td className="p-6">Included</td>
                  <td className="p-6">Full suite</td>
                </tr>
                <tr className="border-b border-border-low-alpha">
                  <td className="p-6">API Access</td>
                  <td className="p-6">—</td>
                  <td className="p-6">Read-only</td>
                  <td className="p-6">Full Read/Write</td>
                </tr>
                <tr>
                  <td className="p-6">Support</td>
                  <td className="p-6">Email</td>
                  <td className="p-6">Priority Email</td>
                  <td className="p-6">24/7 Phone &amp; Concierge</td>
                </tr>
              </tbody>
              </table>
            </div>
          </div>
        </section>
        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-12 mb-24">
          <h2 className="font-headline-lg text-headline-lg text-primary text-center mb-12">
            Frequently Asked Questions
          </h2>
          <FaqAccordion />
        </section>
        {/* CTA Band */}
        <section className="max-w-[1280px] mx-auto px-4 sm:px-6 mb-12">
          <div className="bg-secondary p-6 sm:p-12 md:p-16 rounded-xl flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              {/* Subtle background pattern */}
              <div className="grid grid-cols-12 w-full h-full">
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="h-full"></div>
              </div>
            </div>
            <div className="relative z-10 text-center md:text-left">
              <h2 className="font-display-lg text-headline-lg text-white mb-2">
                Ready to transform your recruitment?
              </h2>
              <p className="font-body-md text-white/80">Join 500+ leading agencies already using TalScout.</p>
            </div>
            <Link
              href="/signup"
              className="relative z-10 bg-primary text-white px-10 py-4 rounded-lg font-label-md text-label-md hover:bg-primary-container transition-all shadow-xl"
            >
              Get started now
            </Link>
          </div>
        </section>
      </main>
      {/* Footer */}
      <footer className="bg-bg-cream border-t border-border-low-alpha w-full py-12 px-4 sm:px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-[1440px] mx-auto">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="inline-block text-headline-md font-headline-md text-primary mb-4">
              TalScout
            </Link>
            <p className="text-on-surface-variant font-body-md text-body-md max-w-xs">
              Empowering recruitment teams with precision AI and human-centric intelligence.
            </p>
          </div>
          <div>
            <h4 className="font-label-md text-label-md text-on-surface font-semibold mb-6">Product</h4>
            <ul className="space-y-4">
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/#features"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/pricing"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/#features"
                >
                  Integrations
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-label-md text-label-md text-on-surface font-semibold mb-6">Resources</h4>
            <ul className="space-y-4">
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/#features"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/#features"
                >
                  Hiring Guides
                </Link>
              </li>
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/#features"
                >
                  Case Studies
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-label-md text-label-md text-on-surface font-semibold mb-6">Company</h4>
            <ul className="space-y-4">
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/privacy"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/terms"
                >
                  Terms
                </Link>
              </li>
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/cookies"
                >
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link
                  className="text-on-surface-variant hover:text-secondary transition-colors font-body-md text-body-md"
                  href="/security"
                >
                  Security
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-[1440px] mx-auto mt-16 pt-8 border-t border-border-low-alpha text-center md:text-left">
          <p className="text-on-surface-variant font-label-md text-label-md">
            © 2024 TalScout AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
