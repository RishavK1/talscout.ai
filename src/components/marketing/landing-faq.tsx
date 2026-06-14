"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const FAQS = [
  {
    q: "How accurate is the AI résumé extraction?",
    a: "TalScout reads PDFs and Word docs and extracts name, contact, skills, full work history, and education with high accuracy. Every extraction is shown to your recruiter for a quick review before it's saved — so nothing gets locked in without a human glance.",
  },
  {
    q: "Is my candidate data secure and private?",
    a: "Yes. Every agency's data lives in its own isolated workspace, enforced at the database level (row-level security). One agency can never see another's candidates — even in the unlikely event of an app bug. Data is encrypted in transit and at rest.",
  },
  {
    q: "How fast is semantic search?",
    a: "Sub-second on typical databases. You type what you need in plain English and TalScout ranks your candidates by meaning instantly, highlighting exactly why each person matched.",
  },
  {
    q: "Can I import from Bullhorn or my current ATS?",
    a: "Bulk import and two-way ATS sync (Bullhorn, Greenhouse, Lever and more) are on the roadmap. At launch you can drag-and-drop résumés in bulk to get your database stood up in minutes.",
  },
  {
    q: "How does per-seat pricing work?",
    a: "You pay per recruiter, per month. Add a seat when you add a recruiter, remove it when they leave — billing adjusts automatically. Usage limits exist only as guardrails against abuse, never as a surprise bill.",
  },
  {
    q: "What file types can I upload?",
    a: "PDF and Word (DOCX) today, including scanned/image-based PDFs. Plain text works too. Each file is validated and stored securely under your workspace.",
  },
];

export function LandingFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {FAQS.map((faq, i) => {
        const isOpen = open === i;
        return (
          <div
            key={faq.q}
            className="overflow-hidden rounded-2xl border border-border-low-alpha bg-surface-white shadow-ambient transition-colors"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="font-headline-md text-[18px] text-on-surface">
                {faq.q}
              </span>
              <span
                className={`material-symbols-outlined shrink-0 text-primary transition-transform duration-300 ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                expand_more
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-6 font-body-md text-body-md leading-relaxed text-text-muted">
                    {faq.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
