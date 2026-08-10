"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { easeOut } from "@/lib/motion";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard: intentionally flipping client-only flag
    setMounted(true);
  }, []);

  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted) return null;

  // Portal to <body> so the overlay/panel are never trapped inside an
  // ancestor with transform/filter/backdrop-filter (which would break
  // position: fixed centering).
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-[#221a19]/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          {/* Panel — modals scale from center. Header stays pinned; body
              scrolls on its own so tall content never gets clipped by a
              short mobile viewport. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative flex max-h-[90vh] w-full ${maxWidth} flex-col rounded-xl border border-border-low-alpha bg-surface-white shadow-floating`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, ease: easeOut }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-low-alpha p-4 sm:p-6">
              <div className="min-w-0">
                <h2 className="font-headline-md text-headline-md text-primary serif-text">
                  {title}
                </h2>
                {subtitle ? (
                  <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95"
              >
                <X className="size-[20px]" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
