"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { fadeUp, item, stagger } from "@/lib/motion";

/**
 * Entrance motion. We animate on mount (not on scroll) so content is never
 * left hidden if an IntersectionObserver is slow to fire — content always
 * appears, and the motion still reads as a premium load-in.
 *
 * `initial="hidden"` bakes opacity:0 into the server-rendered HTML (this is
 * still a client component, but Next renders it on the server first) — on a
 * slow connection the page is genuinely blank until framer-motion's JS
 * hydrates and runs the animation. `initial={false}` skips that: the element
 * paints directly in its final "show" state, so content is visible
 * immediately and the fade-in only plays for whatever hasn't mounted yet by
 * the time JS is ready (still true entrance motion on a normal load, just
 * never at the cost of a blank first paint).
 */

export function Reveal({
  children,
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      initial={false}
      animate="show"
      transition={{ delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function RevealGroup({
  children,
  gap = 0.06,
  delayChildren = 0,
  ...props
}: HTMLMotionProps<"div"> & { gap?: number; delayChildren?: number }) {
  return (
    <motion.div
      variants={stagger(gap, delayChildren)}
      initial={false}
      animate="show"
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, ...props }: HTMLMotionProps<"div">) {
  // Inherits initial/animate from the parent RevealGroup (framer-motion's
  // stagger propagation) — RevealGroup's own initial={false} above is what
  // keeps this SSR-visible, this component must NOT set its own initial/
  // animate or it stops participating in the parent's stagger.
  return (
    <motion.div variants={item} {...props}>
      {children}
    </motion.div>
  );
}
