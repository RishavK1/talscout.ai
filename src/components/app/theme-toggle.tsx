"use client";

import { useTheme } from "@/components/app/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      suppressHydrationWarning
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-low-alpha bg-surface-white text-on-surface-variant shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-outline-variant hover:bg-surface-container-low hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        className,
      )}
    >
      {/* Both glyphs always render; only `dark:` (a plain CSS selector on
       *  the `<html>` class the blocking script in layout.tsx sets before
       *  first paint) decides which is visible. `theme` from context isn't
       *  known until after hydration, so branching this text on it caused a
       *  real SSR/client mismatch — React would paint the server's guess,
       *  then swap it for the client's real value a beat later, which read
       *  as raw ligature text ("light_mode"/"dark_mode") flashing over the
       *  UI on load. This version has nothing to swap: it's correct on the
       *  very first paint, in both the light and dark case. */}
      <span className="relative inline-flex size-[19px] items-center justify-center">
        <span className="material-symbols-outlined absolute text-[19px] opacity-100 dark:opacity-0">
          dark_mode
        </span>
        <span className="material-symbols-outlined absolute text-[19px] opacity-0 dark:opacity-100">
          light_mode
        </span>
      </span>
    </button>
  );
}
