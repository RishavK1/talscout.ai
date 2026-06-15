"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";

type BillingCycle = "monthly" | "annual";

interface Plan {
  name: string;
  description: string;
  monthly: number;
  annual: number;
  highlighted?: boolean;
  features: { icon: string; label: string; emphasized?: boolean }[];
}

const plans: Plan[] = [
  {
    name: "Starter",
    description: "For small teams starting out.",
    monthly: 99,
    annual: 79,
    features: [
      { icon: "check_circle", label: "1 Recruiter seat limit" },
      { icon: "check_circle", label: "50 resume uploads / mo" },
      { icon: "check_circle", label: "Simple keyword search" },
      { icon: "check_circle", label: "Up to 3 custom shortlists" },
    ],
  },
  {
    name: "Growth",
    description: "Scale your hiring with AI.",
    monthly: 199,
    annual: 159,
    highlighted: true,
    features: [
      { icon: "check_circle", label: "Up to 5 Recruiter seats" },
      { icon: "check_circle", label: "500 resume uploads / mo" },
      { icon: "stars", label: "Full Semantic AI Search", emphasized: true },
      { icon: "check_circle", label: "Unlimited custom shortlists" },
    ],
  },
  {
    name: "Scale",
    description: "Enterprise-grade power.",
    monthly: 399,
    annual: 319,
    features: [
      { icon: "check_circle", label: "Everything in Growth" },
      { icon: "check_circle", label: "5,000 resume uploads / mo" },
      { icon: "check_circle", label: "Priority email & chat support" },
      { icon: "check_circle", label: "Custom API & webhook access" },
    ],
  },
];

const PLAN_RANK: Record<string, number> = { starter: 0, growth: 1, scale: 2 };
const planRank = (name?: string) => (name ? PLAN_RANK[name.toLowerCase()] ?? 0 : 0);

export function PricingPlans() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const isAnnual = billing === "annual";

  const { user, loading: authLoading } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoadingPlan(false);
      return;
    }
    const loadBilling = async () => {
      try {
        const res = await api.get<{ plan: string }>("/api/billing");
        setCurrentPlan(res.plan);
      } catch {
        // Fall back to starter or public mode
      } finally {
        setLoadingPlan(false);
      }
    };
    loadBilling();
  }, [user, authLoading]);

  return (
    <>
      {/* Pricing Toggle */}
      <div className="mt-12 flex justify-center items-center gap-4">
        <span
          className={`font-label-md text-label-md ${
            isAnnual ? "text-on-surface-variant" : "text-on-surface"
          }`}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isAnnual}
          aria-label="Toggle annual billing"
          onClick={() => setBilling(isAnnual ? "monthly" : "annual")}
          className="relative w-14 h-7 bg-surface-container-high rounded-full p-1 transition-colors focus:outline-none"
        >
          <div
            className={`dot absolute w-5 h-5 bg-primary rounded-full transition-transform ${
              isAnnual ? "translate-x-7" : "translate-x-0"
            }`}
          ></div>
        </button>
        <span className="font-label-md text-label-md text-on-surface flex items-center gap-2">
          Annual{" "}
          <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Save 20%
          </span>
        </span>
      </div>

      {/* Pricing Cards */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 grid grid-cols-1 md:grid-cols-3 gap-8 mb-24 mt-16 text-left">
        {plans.map((plan) => {
          const price = isAnnual ? plan.annual : plan.monthly;
          const planKey = plan.name.toLowerCase();
          
          // Render button dynamically based on subscription rank
          let buttonText = "Get started";
          let buttonHref = "/signup";
          let isDisabled = false;

          if (user && currentPlan) {
            const currentR = planRank(currentPlan);
            const thisR = planRank(planKey);

            if (thisR === currentR) {
              buttonText = "Current Plan";
              buttonHref = "/billing";
              isDisabled = true;
            } else if (thisR < currentR) {
              buttonText = "Downgrade Unavailable";
              buttonHref = "#";
              isDisabled = true;
            } else {
              buttonText = "Upgrade to " + plan.name;
              buttonHref = "/billing";
            }
          }

          return (
            <div
              key={plan.name}
              className={
                plan.highlighted
                  ? "pricing-card bg-surface-white p-8 rounded-lg border-2 border-primary relative flex flex-col shadow-lg"
                  : "pricing-card bg-surface-white p-8 rounded-lg border border-border-low-alpha flex flex-col"
              }
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-secondary text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  Most popular
                </div>
              )}
              <h3 className="font-headline-md text-headline-md text-primary mb-2">{plan.name}</h3>
              <p className="font-body-md text-body-md text-on-surface-variant mb-6">{plan.description}</p>
              <div className="mb-8">
                <span className="font-display-lg text-headline-lg text-primary">${price}</span>
                <span className="text-on-surface-variant">/seat/mo</span>
                {isAnnual && (
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                    billed annually (${price * 12}/seat/yr)
                  </p>
                )}
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-secondary text-xl">{feature.icon}</span>
                    <span
                      className={
                        feature.emphasized
                          ? "font-body-md text-body-md font-medium"
                          : "font-body-md text-body-md"
                      }
                    >
                      {feature.label}
                    </span>
                  </li>
                ))}
              </ul>
              {loadingPlan ? (
                <button
                  disabled
                  className="w-full py-3 rounded-lg bg-surface-container-high text-on-surface-variant/40 font-label-md text-label-md text-center cursor-not-allowed border border-border-low-alpha flex items-center justify-center gap-2"
                >
                  <span className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></span>
                  Checking status...
                </button>
              ) : isDisabled ? (
                <button
                  disabled
                  className="w-full py-3 rounded-lg bg-surface-container-high text-on-surface-variant/40 font-label-md text-label-md text-center cursor-not-allowed border border-border-low-alpha"
                >
                  {buttonText}
                </button>
              ) : (
                <Link
                  href={buttonHref}
                  className={
                    plan.highlighted
                      ? "w-full py-3 rounded-lg bg-primary text-white font-label-md text-label-md hover:opacity-90 transition-all text-center"
                      : "w-full py-3 rounded-lg border border-primary text-primary font-label-md text-label-md hover:bg-primary/5 transition-colors text-center"
                  }
                >
                  {buttonText}
                </Link>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
