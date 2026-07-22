"use client";

import React from "react";

interface TopAppBarProps {
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

/** Below `lg`, `AppShell`'s `MobileTopBar` (hamburger + brand) already owns
 *  the sticky top slot — stacking a second sticky bar on top of it would
 *  overlap. So this bar scrolls with the page on small screens (still first
 *  thing visible) and only becomes sticky at `lg`, where `MobileTopBar`
 *  hides. It used to be `hidden` below `lg` entirely, which silently ate
 *  every page's search bar / primary action button on mobile and tablet. */
export function TopAppBar({ leftContent, rightContent }: TopAppBarProps) {
  return (
    <header className="glass-header border-b border-border-low-alpha shrink-0 lg:sticky lg:top-0 lg:z-40">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:h-[73px] lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-12 lg:py-0">
        <div className="min-w-0 flex-1 lg:flex lg:max-w-xl lg:items-center">
          {leftContent}
        </div>
        {rightContent ? (
          // min-w-0 (not shrink-0): a fixed-width search box/button here used
          // to refuse to shrink no matter how little room the breadcrumb left
          // it — on a viewport narrower than sidebar + max-w-[1440px]'s
          // combined width, that pushed the header wider than the page, past
          // body's overflow-x:hidden, with no way to scroll to it. Letting
          // this side shrink too (its own children can still cap their own
          // width, e.g. `sm:w-64`) means the header always fits.
          <div className="flex min-w-0 shrink items-center gap-3 lg:gap-4">
            {rightContent}
          </div>
        ) : null}
      </div>
    </header>
  );
}
