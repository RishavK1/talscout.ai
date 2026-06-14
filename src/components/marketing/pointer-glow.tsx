"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

/**
 * A section wrapper that renders a soft radial gradient which follows the
 * cursor. Drop it as the outer element of a section; content is layered above
 * the glow automatically (z-10).
 */
export function PointerGlow({
  children,
  className = "",
  glowColor = "rgba(0, 90, 95, 0.14)",
  glowSize = 620,
  contentClassName = "",
}: {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  glowSize?: number;
  contentClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={`relative ${className}`}
      style={
        {
          "--glow-color": glowColor,
          "--glow-size": `${glowSize}px`,
        } as CSSProperties
      }
    >
      <span aria-hidden className="pointer-glow-layer" />
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
}
