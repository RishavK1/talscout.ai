"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Can I change plans at any time?",
    a: "Yes, you can upgrade or downgrade your plan at any time from your account settings. Changes to your billing will be prorated.",
  },
  {
    q: 'What is a "seat"?',
    a: "A seat refers to a single user account with login credentials. Typically, each recruiter on your team will require their own seat.",
  },
  {
    q: "Do you offer discounts for non-profits?",
    a: "Yes, we support organizations making a difference. Contact our sales team to discuss non-profit and educational pricing.",
  },
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-4">
      {faqs.map((faq, i) => {
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
            <div
              className="overflow-hidden transition-all duration-300 ease-out"
              style={{ maxHeight: isActive ? "200px" : "0px" }}
            >
              <div className="p-6 pt-0 font-body-md text-on-surface-variant">{faq.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
