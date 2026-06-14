"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { fadeUp, item, stagger } from "@/lib/motion";

/**
 * Entrance motion. We animate on mount (not on scroll) so content is never
 * left hidden if an IntersectionObserver is slow to fire — content always
 * appears, and the motion still reads as a premium load-in.
 */

export function Reveal({
  children,
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
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
      initial="hidden"
      animate="show"
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={item} {...props}>
      {children}
    </motion.div>
  );
}
