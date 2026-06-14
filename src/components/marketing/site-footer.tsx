import Link from "next/link";

type FootLink = { label: string; href: string; external?: boolean };

const columns: { heading: string; links: FootLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Integrations", href: "/#features" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/cookies" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    heading: "Connect",
    links: [
      { label: "Contact Sales", href: "mailto:sales@talscout.ai", external: true },
      { label: "Support", href: "mailto:support@talscout.ai", external: true },
      { label: "Twitter", href: "https://twitter.com", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-border-low-alpha bg-bg-cream px-6 py-12 md:px-12">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 md:grid-cols-4">
        <div className="md:col-span-1">
          <Link
            href="/"
            className="mb-4 inline-block font-headline-md text-headline-md tracking-tight text-primary"
          >
            TalScout
          </Link>
          <p className="mt-2 max-w-xs font-body-md text-[14px] text-on-surface">
            Intelligent résumé parsing and semantic search for modern talent
            teams.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.heading} className="flex flex-col gap-3">
            <h4 className="mb-2 font-label-md text-[12px] uppercase tracking-wider text-text-muted">
              {col.heading}
            </h4>
            {col.links.map((l) =>
              l.external ? (
                <a
                  key={l.label}
                  href={l.href}
                  target={l.href.startsWith("http") ? "_blank" : undefined}
                  rel={l.href.startsWith("http") ? "noreferrer" : undefined}
                  className="font-label-md text-label-md text-on-surface-variant transition-colors duration-200 hover:text-secondary"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.label}
                  href={l.href}
                  className="font-label-md text-label-md text-on-surface-variant transition-colors duration-200 hover:text-secondary"
                >
                  {l.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 max-w-[1440px] border-t border-border-low-alpha pt-8">
        <p className="font-body-md text-[14px] text-text-muted">
          © 2026 TalScout AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
