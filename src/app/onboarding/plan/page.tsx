"use client";

import Link from "next/link";
import { useState } from "react";

type PlanId = "starter" | "growth" | "scale";

const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  popular: boolean;
  features: { label: string; emphasized?: boolean }[];
}[] = [
  {
    id: "starter",
    name: "Starter",
    price: 99,
    popular: false,
    features: [
      { label: "Basic parsing" },
      { label: "500 candidates" },
      { label: "Email support" },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 199,
    popular: true,
    features: [
      { label: "Full Semantic Search", emphasized: true },
      { label: "Unlimited parsing" },
      { label: "Priority support" },
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: 399,
    popular: false,
    features: [
      { label: "Custom API" },
      { label: "Dedicated manager" },
      { label: "Advanced analytics" },
    ],
  },
];

export default function ChoosePlanPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("growth");
  const [seats, setSeats] = useState(5);

  const activePlan = PLANS.find((p) => p.id === selectedPlan)!;
  const total = activePlan.price * seats;

  return (
    <main className="w-full max-w-[1000px] mx-auto min-h-screen flex flex-col items-center justify-center py-12 sm:py-16 lg:py-20 px-4 sm:px-6">
      {/* Logo/Header (Implicit from TopNavBar) */}
      <div className="flex justify-center mb-12">
        <Link href="/" className="font-headline-lg text-headline-lg text-primary tracking-tight">
          TalScout
        </Link>
      </div>
      {/* Onboarding Step Indicator */}
      <div className="flex items-center justify-center space-x-3 mb-10">
        <div className="h-1.5 w-16 rounded-full bg-primary/20"></div>
        <div className="h-1.5 w-16 rounded-full bg-primary shadow-sm"></div>
        <div className="h-1.5 w-16 rounded-full bg-border-low-alpha"></div>
      </div>
      {/* Main Card Content */}
      <section className="w-full bg-surface-white rounded-xl p-6 sm:p-8 lg:p-12 shadow-soft border border-border-low-alpha">
        <div className="text-center mb-10">
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-3">Choose your plan</h2>
          <p className="font-body-md text-body-md text-text-muted max-w-lg mx-auto">
            Select the plan that fits your agency&apos;s scale. You can change this at any time.
          </p>
        </div>
        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex p-1 bg-bg-secondary rounded-lg border border-border-low-alpha">
            <button
              type="button"
              className="px-6 py-2 rounded-md font-label-md text-label-md text-text-muted transition-all"
            >
              Monthly
            </button>
            <button
              type="button"
              className="px-6 py-2 rounded-md font-label-md text-label-md bg-surface-white text-primary shadow-sm font-semibold transition-all"
            >
              Annual{" "}
              <span className="ml-1 text-secondary text-[11px] font-bold uppercase tracking-wider">
                (Save 20%)
              </span>
            </button>
          </div>
        </div>
        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => {
            const isSelected = plan.id === selectedPlan;
            return (
              <div
                key={plan.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => setSelectedPlan(plan.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedPlan(plan.id);
                  }
                }}
                className={
                  isSelected
                    ? "plan-card-selected relative rounded-xl p-6 flex flex-col cursor-pointer transition-all shadow-md"
                    : "plan-card-unselected relative rounded-xl p-6 flex flex-col cursor-pointer hover:border-outline-variant transition-colors group"
                }
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 brass-pill rounded-full text-[10px] font-bold tracking-widest uppercase">
                    Most Popular
                  </div>
                )}
                {isSelected ? (
                  <div className="absolute top-4 right-4 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-white"></div>
                  </div>
                ) : (
                  <div className="absolute top-4 right-4 h-5 w-5 rounded-full border-2 border-outline group-hover:border-primary transition-colors flex items-center justify-center"></div>
                )}
                <div className="mb-6">
                  <h3
                    className={
                      isSelected
                        ? "font-headline-md text-headline-md text-primary mb-1"
                        : "font-headline-md text-headline-md text-on-surface mb-1"
                    }
                  >
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline space-x-1">
                    <span className="font-data-mono text-xl font-bold">${plan.price}</span>
                    <span className="font-label-md text-text-muted">/seat/mo</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-8 flex-grow">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.label}
                      className={
                        feature.emphasized
                          ? "flex items-start space-x-3 text-on-surface-variant font-body-md font-medium"
                          : "flex items-start space-x-3 text-on-surface-variant font-body-md"
                      }
                    >
                      <span className="material-symbols-outlined text-primary text-sm mt-0.5" data-icon="check">check</span>
                      <span>{feature.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {/* Seat Stepper */}
        <div className="flex flex-col md:flex-row md:items-center justify-between py-8 border-t border-border-low-alpha">
          <div className="mb-4 md:mb-0">
            <h4 className="font-label-md text-label-md text-on-surface font-semibold mb-1">How many seats?</h4>
            <p className="font-body-md text-sm text-text-muted">Scale your team as you grow.</p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={() => setSeats((s) => Math.max(1, s - 1))}
              disabled={seats <= 1}
              aria-label="Decrease seats"
              className="w-10 h-10 rounded-lg border border-border-low-alpha flex items-center justify-center hover:bg-bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-on-surface" data-icon="remove">remove</span>
            </button>
            <div className="w-16 text-center">
              <span className="font-headline-md text-headline-md text-primary">{seats}</span>
            </div>
            <button
              type="button"
              onClick={() => setSeats((s) => s + 1)}
              aria-label="Increase seats"
              className="w-10 h-10 rounded-lg border border-border-low-alpha flex items-center justify-center hover:bg-bg-secondary transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface" data-icon="add">add</span>
            </button>
          </div>
        </div>
        {/* Summary */}
        <div className="flex flex-col items-center md:items-end pt-8 mt-4">
          <div className="flex flex-col items-center md:items-end">
            <p className="font-label-md text-label-md text-text-muted mb-1">Total monthly cost:</p>
            <h3 className="font-headline-lg text-headline-lg text-primary">${total.toLocaleString()}</h3>
          </div>
        </div>
        {/* Actions */}
        <div className="flex flex-col md:flex-row items-center justify-between mt-12 pt-8 border-t border-border-low-alpha gap-4">
          <Link
            href="/onboarding/workspace"
            className="px-8 py-3 rounded-lg font-label-md text-label-md text-on-surface-variant hover:text-primary transition-all flex items-center space-x-2"
          >
            <span className="material-symbols-outlined text-sm" data-icon="arrow_back">arrow_back</span>
            <span>Back</span>
          </Link>
          <Link
            href="/onboarding/invite"
            className="w-full md:w-auto px-10 py-4 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md text-center"
          >
            Continue to payment
          </Link>
        </div>
      </section>
      {/* Trust Indicator */}
      <div className="mt-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 opacity-40 grayscale group-hover:grayscale-0 transition-all duration-700">
          <div className="h-6 flex items-center font-headline-md text-headline-md text-on-surface">Stripe</div>
          <div className="h-5 flex items-center font-headline-md text-on-surface">Revolut</div>
          <div className="h-6 flex items-center font-headline-md text-headline-md text-on-surface">Attentive</div>
        </div>
        <p className="mt-6 font-body-md text-xs text-text-muted">
          Trusted by 2,000+ recruitment teams worldwide
        </p>
      </div>
    </main>
  );
}
