import Link from "next/link";

type FootLink = { label: string; href: string; external?: boolean };

const columns: { heading: string; links: FootLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Product", href: "/#product" },
      { label: "Pricing", href: "/pricing" },
      { label: "How it works", href: "/#how" },
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
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-outline-variant bg-surface-container-low px-6 py-14 text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-colors dark:shadow-none lg:px-8">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 md:grid-cols-4">
        <div className="md:col-span-1">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.02em] text-on-surface"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <span className="material-symbols-outlined text-[18px]">travel_explore</span>
            </span>
            TalScout
          </Link>
          <p className="mt-2 max-w-sm text-[15px] leading-7 text-on-surface-variant">
            Candidate intelligence and outreach infrastructure for modern recruiting teams.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.heading} className="flex flex-col gap-3">
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-on-surface">
              {col.heading}
            </h4>
            {col.links.map((l) =>
              l.external ? (
                <a
                  key={l.label}
                  href={l.href}
                  target={l.href.startsWith("http") ? "_blank" : undefined}
                  rel={l.href.startsWith("http") ? "noreferrer" : undefined}
                  className="text-[14px] font-medium text-on-surface-variant transition-colors duration-200 hover:text-primary"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.label}
                  href={l.href}
                  className="text-[14px] font-medium text-on-surface-variant transition-colors duration-200 hover:text-primary"
                >
                  {l.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 max-w-[1240px] border-t border-outline-variant pt-7">
        <p className="text-[13px] font-medium text-on-surface-variant">
          © {new Date().getFullYear()} TalScout AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
