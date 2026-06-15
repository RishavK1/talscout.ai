"use client";

import React from "react";

interface TopAppBarProps {
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export function TopAppBar({ leftContent, rightContent }: TopAppBarProps) {
  return (
    <header className="hidden lg:flex sticky top-0 z-40 bg-surface/80 backdrop-blur-md border-b border-border-low-alpha justify-between items-center gap-4 px-6 lg:px-12 py-4 h-[73px] shrink-0">
      <div className="flex-1 min-w-0 max-w-xl flex items-center">
        {leftContent}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {rightContent}
      </div>
    </header>
  );
}
