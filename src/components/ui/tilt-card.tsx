"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Subtle 3D tilt that follows the cursor — used on the page's static
 *  product-window mockups so they read as touchable, not flat screenshots.
 *  Transition is toggled off while the pointer moves (so tracking stays
 *  snappy) and back on for the spring-back on pointer leave. */
export function TiltCard({
  children,
  className,
  maxTilt = 5,
}: {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transition = "transform 0s";
    el.style.transform = `perspective(1200px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg)`;
  };

  const handlePointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 500ms cubic-bezier(0.23, 1, 0.32, 1)";
    el.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
  };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn("will-change-transform", className)}
    >
      {children}
    </div>
  );
}
