"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

/** Counts up from 0 to `value` once the number scrolls into view — used on
 *  the landing page's mock stat strips for a premium "live dashboard" feel.
 *  These are illustrative demo numbers baked into the page, same ones that
 *  render statically without JS; this only adds the count-up motion. */
export function NumberTicker({
  value,
  prefix = "",
  suffix = "",
  delay = 0,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 40, stiffness: 90 });
  const isInView = useInView(ref, { once: true, margin: "0px 0px -80px 0px" });

  useEffect(() => {
    if (!isInView) return;
    const timer = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [isInView, value, delay, motionValue]);

  useEffect(() => {
    return springValue.on("change", (v) => {
      if (ref.current) ref.current.textContent = `${prefix}${Math.round(v).toLocaleString()}${suffix}`;
    });
  }, [springValue, prefix, suffix]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}0{suffix}
    </span>
  );
}
