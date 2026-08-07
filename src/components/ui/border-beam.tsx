"use client";

import { motion, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";

/** A light traveling around a bordered box's perimeter — reads as "this is
 *  live/running," used sparingly on the landing page's automation-themed
 *  frames. Decorative only: aria-hidden, pointer-events-none, and degrades
 *  to simply not rendering the beam in browsers without offset-path support
 *  (the box's real border still renders underneath either way). */
export function BorderBeam({
  className,
  size = 60,
  duration = 9,
  delay = 0,
  colorFrom = "var(--color-primary-container)",
  colorTo = "var(--color-primary-fixed)",
  transition,
}: {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  transition?: Transition;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
    >
      <motion.div
        className={cn("absolute aspect-square", className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ repeat: Infinity, ease: "linear", duration, delay: -delay, ...transition }}
      />
    </div>
  );
}
