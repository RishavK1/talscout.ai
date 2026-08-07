"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** A soft glow that follows the cursor within a card, revealed on hover.
 *  Position is written straight to the DOM node (CSS custom properties)
 *  instead of React state, so mouse movement never triggers a re-render. */
export function SpotlightCard({
  children,
  className,
  spotlightColor = "var(--color-primary-container)",
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={cn("group/spotlight relative isolate overflow-hidden", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
        style={{
          background: `radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklab, ${spotlightColor} 16%, transparent), transparent 72%)`,
        }}
      />
      {children}
    </div>
  );
}
