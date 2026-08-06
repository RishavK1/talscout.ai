"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FAQS } from "@/components/marketing/faq-data";

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-4">
      {FAQS.map((faq, i) => {
        const isActive = openIndex === i;
        return (
          <div
            key={faq.q}
            className="accordion-item bg-surface-white rounded-lg border border-border-low-alpha overflow-hidden"
          >
            <button
              type="button"
              className="w-full p-6 text-left flex justify-between items-center focus:outline-none"
              onClick={() => setOpenIndex(isActive ? null : i)}
              aria-expanded={isActive}
            >
              <span className="font-headline-md text-[18px] text-primary">{faq.q}</span>
              <span
                className="material-symbols-outlined icon-rotate transition-transform"
                style={{ transform: isActive ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                expand_more
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-0 font-body-md text-on-surface-variant">{faq.a}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
