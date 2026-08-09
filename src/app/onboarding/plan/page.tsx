"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PLANS as PLAN_CATALOG, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

// Derived from the shared catalog so onboarding, pricing and backend agree.
const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  popular: boolean;
  features: { label: string; emphasized?: boolean }[];
}[] = PLAN_ORDER.map((id) => {
  const p = PLAN_CATALOG[id];
  return {
    id: p.id,
    name: p.name,
    price: p.monthlyPrice,
    popular: !!p.recommended,
    features: p.features.map((label) => ({
      label,
      emphasized: /semantic|parsing|ai agent/i.test(label),
    })),
  };
});

const PLAN_RANK: Record<string, number> = { starter: 0, growth: 1, scale: 2 };
const planRank = (name?: string) => (name ? PLAN_RANK[name.toLowerCase()] ?? 0 : 0);

export default function ChoosePlanPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("growth");
  const [seats, setSeats] = useState(5);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [loading, setLoading] = useState(false);

  // Upgrade validations
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [currentSeats, setCurrentSeats] = useState<number>(1);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const loadCurrent = async () => {
      try {
        const res = await api.get<{ plan: string; seats: number }>("/api/billing");
        setCurrentPlan(res.plan);
        setCurrentSeats(res.seats);
        
        // Default select to current plan or higher
        if (planRank("growth") >= planRank(res.plan)) {
          setSelectedPlan("growth");
        } else {
          setSelectedPlan("scale");
        }
        setSeats(Math.max(5, res.seats + 1));
      } catch {
        // Not logged in or starter defaults
      } finally {
        setChecking(false);
      }
    };
    loadCurrent();
  }, []);

  const activePlan = PLANS.find((p) => p.id === selectedPlan)!;
  const cycleDiscount = billingCycle === "annual" ? 0.8 : 1;
  const currentPrice = Math.round(activePlan.price * cycleDiscount);
  const total = currentPrice * seats;

  const minSeats = (currentPlan && selectedPlan === currentPlan) ? currentSeats + 1 : 1;

  const isUpgrade = () => {
    if (!currentPlan) return true;
    const currentR = planRank(currentPlan);
    const selectedR = planRank(selectedPlan);
    if (selectedR < currentR) return false;
    if (selectedR === currentR) {
      return seats > currentSeats;
    }
    return true;
  };

  const handlePayment = async () => {
    if (!isUpgrade()) {
      toast.error("You are already subscribed to this plan tier/seat combination.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ url: string }>("/api/billing/checkout", {
        plan: selectedPlan,
        seats,
        billingCycle,
      });
      if (res.url) {
        window.location.href = res.url;
      } else {
        toast.error("Checkout session URL not returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create checkout session");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <main className="bg-bg-cream w-full max-w-[1000px] mx-auto min-h-screen flex flex-col items-center justify-center py-20 px-4">
        <span className="material-symbols-outlined animate-spin text-primary text-3xl">sync</span>
        <p className="mt-4 font-label-md text-text-muted">Checking current subscription plan...</p>
      </main>
    );
  }

  return (
    <main className="bg-bg-cream w-full max-w-[1000px] mx-auto min-h-screen flex flex-col items-center justify-center py-12 sm:py-16 lg:py-20 px-4 sm:px-6">
      {/* Logo — same icon (travel_explore) and chip as the main site nav */}
      <div className="flex justify-center mb-12">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container shadow-sm">
            <span className="material-symbols-outlined text-[20px]">travel_explore</span>
          </span>
          <span className="font-headline-lg text-headline-lg text-primary tracking-tight">TalScout</span>
        </Link>
      </div>
      {/* Onboarding Step Indicator */}
      <div className="flex items-center justify-center space-x-3 mb-10">
        <div className="h-1.5 w-16 rounded-full bg-primary-container"></div>
        <div className="h-1.5 w-16 rounded-full bg-primary-container"></div>
        <div className="h-1.5 w-16 rounded-full bg-border-low-alpha"></div>
      </div>
      {/* Main Card Content */}
      <Card className="w-full [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
        <CardContent>
        <div className="text-center mb-10">
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-3">Choose your plan</h2>
          <p className="font-body-md text-body-md text-text-muted max-w-lg mx-auto">
            Select the plan that fits your agency&apos;s scale. Upgrade or add seats any time — need to downgrade later? Just contact support.
          </p>
        </div>
        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex p-1 bg-bg-secondary rounded-lg border border-border-low-alpha">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBillingCycle("monthly")}
              className={
                billingCycle === "monthly"
                  ? "bg-surface-white text-primary shadow-sm font-semibold hover:bg-surface-white"
                  : "text-text-muted hover:text-on-surface hover:bg-transparent"
              }
            >
              Monthly
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBillingCycle("annual")}
              className={
                billingCycle === "annual"
                  ? "bg-surface-white text-primary shadow-sm font-semibold hover:bg-surface-white"
                  : "text-text-muted hover:text-on-surface hover:bg-transparent"
              }
            >
              Annual{" "}
              <span className="ml-1 text-secondary text-[11px] font-bold uppercase tracking-wider">
                (Save 20%)
              </span>
            </Button>
          </div>
        </div>
        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => {
            const isSelected = plan.id === selectedPlan;
            const isDowngrade = currentPlan ? planRank(plan.id) < planRank(currentPlan) : false;
            return (
              <div
                key={plan.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => {
                  if (isDowngrade) return;
                  setSelectedPlan(plan.id);
                }}
                onKeyDown={(e) => {
                  if (isDowngrade) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedPlan(plan.id);
                  }
                }}
                className={
                  isDowngrade
                    ? "opacity-40 cursor-not-allowed border border-border-low-alpha bg-surface-container-high rounded-xl p-6 flex flex-col pointer-events-none"
                    : isSelected
                    ? `plan-card-selected relative rounded-xl p-6 flex flex-col cursor-pointer transition-all${plan.popular ? " ring-2 ring-tertiary-fixed" : ""}`
                    : `plan-card-unselected relative rounded-xl p-6 flex flex-col cursor-pointer hover:border-outline-variant transition-colors group${plan.popular ? " ring-2 ring-tertiary-fixed" : ""}`
                }
              >
                {plan.popular && !isDowngrade && (
                  <StatusBadge
                    tone="brass"
                    dot={false}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-widest uppercase shadow-sm"
                  >
                    Most Popular
                  </StatusBadge>
                )}
                {isDowngrade ? (
                  <div className="absolute top-4 right-4 text-error font-label-md text-[10px] uppercase font-bold tracking-wider">
                    Downgrade
                  </div>
                ) : isSelected ? (
                  <div className="absolute top-4 right-4 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-on-primary"></div>
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
                    <span className="font-data-mono text-xl font-bold">
                      ${Math.round(plan.price * cycleDiscount)}
                    </span>
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
            <p className="font-body-md text-sm text-text-muted">Scale your team as you grow. Min seats for upgrade: {minSeats}.</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={() => setSeats((s) => Math.max(minSeats, s - 1))}
              disabled={seats <= minSeats}
              aria-label="Decrease seats"
            >
              <span className="material-symbols-outlined text-on-surface" data-icon="remove">remove</span>
            </Button>
            <div className="w-16 text-center">
              <span className="font-headline-md text-headline-md text-primary">{seats}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={() => setSeats((s) => s + 1)}
              aria-label="Increase seats"
            >
              <span className="material-symbols-outlined text-on-surface" data-icon="add">add</span>
            </Button>
          </div>
        </div>
        
        {!isUpgrade() && (
          <div className="mb-6 p-4 bg-error/10 text-error rounded-lg font-label-md text-[13px] border border-error/20">
            Selected plan and seat count must be an upgrade from your current {currentPlan?.toUpperCase()} plan ({currentSeats} seats).
          </div>
        )}

        {/* Summary */}
        <div className="flex flex-col items-center md:items-end pt-8 mt-4">
          <div className="flex flex-col items-center md:items-end">
            <p className="font-label-md text-label-md text-text-muted mb-1">Total monthly cost:</p>
            <h3 className="font-headline-lg text-headline-lg text-primary">${total.toLocaleString()}</h3>
          </div>
        </div>
        {/* Actions */}
        <div className="flex flex-col md:flex-row items-center justify-between mt-12 pt-8 border-t border-border-low-alpha gap-4">
          {/* A returning user (existing billing history — lapsed card, a
           *  cancelled subscription) isn't "setting up a workspace" anymore,
           *  so send them to billing/support instead of looping them back
           *  into new-signup onboarding, which was this page's only exit. */}
          {currentPlan ? (
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost">
                <Link href="/billing">
                  <span className="material-symbols-outlined text-sm" data-icon="arrow_back">arrow_back</span>
                  <span>Back to billing</span>
                </Link>
              </Button>
              <a
                href="mailto:support@talscout.ai"
                className="font-label-md text-label-md text-text-muted transition-colors hover:text-primary"
              >
                Need something else? Contact support
              </a>
            </div>
          ) : (
            <Button asChild variant="ghost">
              <Link href="/onboarding/workspace">
                <span className="material-symbols-outlined text-sm" data-icon="arrow_back">arrow_back</span>
                <span>Back</span>
              </Link>
            </Button>
          )}
          <Button
            type="button"
            disabled={loading || !isUpgrade()}
            onClick={handlePayment}
            variant="gradient"
            size="lg"
            className="w-full justify-center md:w-auto"
          >
            {loading ? "Preparing payment..." : "Continue to payment"}
          </Button>
        </div>
        </CardContent>
      </Card>
      {/* Trust Indicator */}
      <div className="mt-8 flex items-center justify-center gap-2 text-center opacity-60">
        <span className="material-symbols-outlined text-[16px] text-text-muted">lock</span>
        <p className="font-body-md text-xs text-text-muted">Secure checkout powered by Stripe</p>
      </div>
    </main>
  );
}
