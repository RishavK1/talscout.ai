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
      <span className="material-symbols-outlined text-[19px]">
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
