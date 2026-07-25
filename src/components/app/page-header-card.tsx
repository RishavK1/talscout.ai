import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The standard page header for list screens (Blueprints, Shortlists, Bulk
 * Fire, Automated Outreach). Extracted because the same markup had been
 * copy-pasted across four pages and had already drifted.
 *
 * The action is aligned to the TOP of the card, level with the title. The
 * copies this replaces used `sm:items-end`, which bottom-aligned it: once a
 * page had a description longer than a line or two, the button drifted down to
 * the bottom-right corner, visually detached from the heading it belongs to.
 */
export function PageHeaderCard({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: ReactNode;
  /** Primary CTA. Rendered top-right on >=sm, full-width below the copy on mobile. */
  action?: ReactNode;
}) {
  return (
    <Card className="mb-6 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="flex items-start gap-4">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container sm:flex">
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <div className="space-y-1.5">
            <h1 className="font-headline-lg text-headline-lg text-primary">{title}</h1>
            <p className="font-body-lg text-body-lg text-text-muted max-w-xl">{description}</p>
          </div>
        </div>
        {action && <div className="shrink-0 sm:pt-1">{action}</div>}
      </CardContent>
    </Card>
  );
}
