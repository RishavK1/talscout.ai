import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Single shared status-pill component — replaces the 7+ independent
 * reimplementations found across the app (candidates, candidate-detail,
 * blueprints, team, billing invoices, analytics, automated-outreach), each
 * of which re-derived its own Tailwind classes per status. Callers pass a
 * `tone` (what it means) instead of styling; the color mapping lives here,
 * once, reusing the existing `.status-pill-active`/`.status-pill-invited`/
 * `.brass-badge` brand classes.
 */
const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        // Flat light-tint pills — no shadow, no glow border. A thin border
        // only where it's the sole thing separating the pill from a white
        // card background (draft/neutral); tinted pills don't need one.
        active: "status-pill-active",
        invited: "status-pill-invited",
        draft: "bg-surface-container-high text-on-surface-variant border border-border-low-alpha",
        error: "bg-error-container text-on-error-container",
        neutral: "bg-surface-container-high text-on-surface-variant border border-border-low-alpha",
        brass: "brass-badge",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const DOT_CLASS: Record<string, string> = {
  active: "bg-tertiary-container",
  invited: "bg-on-secondary-container",
  draft: "bg-outline",
  error: "bg-error",
  neutral: "bg-outline",
  brass: "bg-secondary-fixed-dim",
};

export interface StatusBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof statusBadgeVariants> {
  /** Leading colored dot — on by default, matching the existing pill look
   *  across the app. Set false for a plain text-only pill (e.g. brass). */
  dot?: boolean;
}

export function StatusBadge({
  tone = "neutral",
  dot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ tone }), className)} {...props}>
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[tone ?? "neutral"])} />}
      {children}
    </span>
  );
}
