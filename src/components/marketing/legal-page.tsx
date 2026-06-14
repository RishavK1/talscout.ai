import { SiteNav } from "./site-nav";
import { SiteFooter } from "./site-footer";

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-cream">
      <SiteNav />
      <main className="flex-grow pt-20">
        {/* Header band */}
        <div className="bg-hero-gradient border-b border-border-low-alpha px-6">
          <div className="mx-auto max-w-3xl py-16 sm:py-20">
            <p className="mb-3 font-data-mono text-data-mono text-text-muted">
              Updated {updated}
            </p>
            <h1 className="font-display-lg text-3xl sm:text-display-lg text-on-surface">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl font-body-lg text-body-lg text-text-muted">
              {intro}
            </p>
          </div>
        </div>

        {/* Body */}
        <article
          className="mx-auto max-w-3xl px-6 py-12 sm:py-16
            [&_h2]:font-headline-md [&_h2]:text-[22px] [&_h2]:text-primary [&_h2]:serif-text [&_h2]:mt-10 [&_h2]:mb-3
            [&_p]:mb-4 [&_p]:font-body-md [&_p]:leading-relaxed [&_p]:text-on-surface-variant
            [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_li]:font-body-md [&_li]:text-on-surface-variant
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
            [&_strong]:text-on-surface [&_strong]:font-semibold"
        >
          {children}
          <div className="mt-12 rounded-2xl border border-border-low-alpha bg-surface-container-low/50 p-6">
            <p className="!mb-0 text-[13px] text-text-muted">
              This document is a product template for TalScout and is provided
              for informational purposes only — it is not legal advice. Questions?
              Email{" "}
              <a href="mailto:legal@talscout.ai" className="text-primary underline">
                legal@talscout.ai
              </a>
              .
            </p>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
