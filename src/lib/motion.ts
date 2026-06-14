import type { Variants } from "framer-motion";

/**
 * Motion presets — built on Emil Kowalski's craft rules:
 * - custom easing curves (built-in CSS easings are too weak)
 * - ease-out for entrances (feels responsive)
 * - durations under ~300ms for UI, longer only for marketing reveals
 * - never animate from scale(0); start from 0.95 + opacity
 */

export const easeOut = [0.23, 1, 0.32, 1] as const; // strong ease-out
export const easeInOut = [0.77, 0, 0.175, 1] as const; // strong ease-in-out
export const easeDrawer = [0.32, 0.72, 0, 1] as const; // iOS drawer curve

/** Fade + rise — for hero blocks and section reveals. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easeOut } },
};

/** Subtle fade + rise for list/stagger children. */
export const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } },
};

/** Container that staggers its children (30–80ms between items per the skill). */
export const stagger = (staggerChildren = 0.06, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
});

/** Scale-in for popovers/cards — origin-aware where possible. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: easeOut } },
};

/** Press feedback: scale(0.97) — apply via whileTap. */
export const press = { scale: 0.97 } as const;

/** Default in-view config: animate once, slightly before fully visible. */
export const inView = { once: true, margin: "-80px" } as const;
