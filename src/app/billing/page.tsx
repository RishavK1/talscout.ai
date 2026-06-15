"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { TopAppBar } from "@/components/app/top-app-bar";


interface BillingInfo {
  plan: string;
  pricePerSeat: number;
  status: string;
  seats: number;
  seatsUsed: number;
  renewsAt: string | null;
}

export default function BillingPage() {
  const { profile, loading: authLoading } = useAuth();
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<{ id: string; date: string; amount: string; status: string; plan?: string; seats?: number }[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [updating, setUpdating] = useState(false);

  const PLAN_RANK: Record<string, number> = { starter: 0, growth: 1, scale: 2 };
  const planRank = (p?: string) => (p ? PLAN_RANK[p.toLowerCase()] ?? 0 : 0);

  const isUpgrade = () => {
    if (!billingInfo) return false;
    const currentRank = planRank(billingInfo.plan);
    const selectedRank = planRank(selectedPlan);
    if (selectedRank < currentRank) return false;
    if (selectedRank === currentRank) {
      return selectedSeats > billingInfo.seats;
    }
    return true;
  };

  const loadBilling = async () => {
    try {
      setLoading(true);
      const res = await api.get<BillingInfo>("/api/billing");
      setBillingInfo(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load billing details";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadBilling();
    } else if (profile) {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (billingInfo && showModal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlan(billingInfo.plan);
      setSelectedSeats(billingInfo.seats);
    }
  }, [billingInfo, showModal]);

  useEffect(() => {
    if (billingInfo && profile?.tenantId) {
      if (billingInfo.status !== "active") {
        setInvoices([]);
        return;
      }

      const tenantId = profile.tenantId;
      const key = `billingTransactions_${tenantId}`;
      const saved = localStorage.getItem(key);
      const totalMonthlyPrice = billingInfo.pricePerSeat * billingInfo.seats;
      const todayStr = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      let list: any[] = [];
      if (saved) {
        try {
          list = JSON.parse(saved);
        } catch (_) {}
      }

      if (list.length === 0) {
        list = [
          {
            id: "INV-2026-001",
            date: todayStr,
            plan: billingInfo.plan,
            seats: billingInfo.seats,
            amount: `$${totalMonthlyPrice.toLocaleString()}`,
            status: "Paid",
          },
        ];
        localStorage.setItem(key, JSON.stringify(list));
      } else {
        const lastTx = list[list.length - 1];
        const lastPlan = lastTx.plan.toLowerCase();
        const lastSeats = lastTx.seats;
        
        const planUpgrade = planRank(billingInfo.plan) > planRank(lastPlan);
        const seatUpgrade = planRank(billingInfo.plan) === planRank(lastPlan) && billingInfo.seats > lastSeats;

        if (planUpgrade || seatUpgrade) {
          const nextInvNum = String(list.length + 1).padStart(3, "0");
          list.push({
            id: `INV-2026-${nextInvNum}`,
            date: todayStr,
            plan: billingInfo.plan,
            seats: billingInfo.seats,
            amount: `$${totalMonthlyPrice.toLocaleString()}`,
            status: "Paid",
          });
          localStorage.setItem(key, JSON.stringify(list));
        }
      }

      const sorted = [...list].reverse();
      setInvoices(sorted);
    }
  }, [billingInfo, profile]);

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdating(true);
      const res = await api.post<{ url: string }>("/api/billing/checkout", {
        plan: selectedPlan,
        seats: selectedSeats,
      });
      if (res.url) {
        window.location.href = res.url;
      } else {
        toast.error("Checkout session could not be created.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create checkout session";
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading || (loading && profile?.role === "admin")) {
    return (
      <AppShell>
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="font-label-md text-text-muted">Loading billing settings...</p>
          </div>
        </main>
      </AppShell>
    );
  }

  if (profile && profile.role !== "admin") {
    return (
      <AppShell>
        <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg-cream/30">
          <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl premium-shadow border border-border-low-alpha">
            <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-[36px]">shield_person</span>
            </div>
            <h2 className="font-headline-md text-[24px] text-primary serif-text mb-3">Admin Access Required</h2>
            <p className="font-body-md text-on-surface-variant mb-6 text-[14px]">
              Only workspace administrators can view billing information and manage subscription plans.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg font-label-md hover:shadow-lg transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              Back to Dashboard
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  const planDisplayName = billingInfo
    ? billingInfo.plan.charAt(0).toUpperCase() + billingInfo.plan.slice(1)
    : "Starter";

  const totalMonthlyPrice = billingInfo
    ? billingInfo.pricePerSeat * billingInfo.seats
    : 0;

  const formatRenewalDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };



  return (
    <AppShell>
      <TopAppBar
        leftContent={
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input className="w-full pl-10 pr-4 py-2 bg-surface-white border border-border-low-alpha rounded-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Search settings, invoices..." type="text" />
          </div>
        }
        rightContent={
          <Link href="/upload" className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap">
            + Upload résumés
          </Link>
        }
      />

      {/* Main Content Area */}
      <main className="pt-8 sm:pt-12 lg:pt-24 px-4 sm:px-6 lg:px-12 pb-12 sm:pb-16 lg:pb-24 max-w-[1440px] mx-auto">
        {/* Header */}
        <header className="mb-10">
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">Billing</h1>
          <p className="font-body-md text-body-md text-text-muted">Manage your workspace subscription, payment methods, and billing history.</p>
        </header>

        {billingInfo && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Section 1: Current Plan */}
            <section className="lg:col-span-8">
              <div className="bg-white rounded-[12px] p-8 card-shadow hairline-border">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-4">Current Plan</h2>
                    <p className="font-headline-md text-headline-md text-primary mb-1">
                      {planDisplayName} — ${billingInfo.pricePerSeat}/seat/mo
                    </p>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {billingInfo.seats} {billingInfo.seats === 1 ? "seat" : "seats"} · ${totalMonthlyPrice.toLocaleString()}/mo
                    </p>
                    <p className="font-body-sm text-[12px] text-outline mt-1">
                      {billingInfo.seatsUsed} {billingInfo.seatsUsed === 1 ? "seat" : "seats"} currently active.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-label-md text-label-md bg-tertiary-fixed-dim/20 text-tertiary px-3 py-1 rounded-full uppercase tracking-wider text-[11px] font-semibold">
                      {billingInfo.status}
                    </span>
                  </div>
                </div>
                {billingInfo.renewsAt && (
                  <div className="flex items-center gap-2 mb-8 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[20px]">calendar_today</span>
                    <span className="font-body-md text-body-md">Next renewal date:</span>
                    <span className="font-data-mono text-data-mono font-medium">
                      {formatRenewalDate(billingInfo.renewsAt)}
                    </span>
                  </div>
                )}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="px-6 py-2.5 rounded-lg font-label-md text-label-md bg-primary text-white hover:bg-primary-container transition-colors active:scale-95 duration-100"
                  >
                    Manage plan &amp; seats
                  </button>
                </div>
              </div>
            </section>

            {/* Section 2: Payment Method */}
            <section className="lg:col-span-4">
              <div className="bg-white rounded-[12px] p-8 card-shadow hairline-border h-full flex flex-col">
                <h2 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-6">Payment Method</h2>
                <div className="flex items-center gap-4 mb-auto">
                  <div className="w-14 h-10 bg-bg-secondary rounded border border-border-low-alpha flex items-center justify-center p-2">
                    <span className="font-label-md text-[12px] font-semibold text-primary tracking-wide">CARD</span>
                  </div>
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">Stripe Billing Enabled</p>
                    <p className="font-data-mono text-[12px] text-text-muted">Automatic renewal</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3: Invoices */}
            <section className="lg:col-span-12 mt-4">
              <div className="bg-white rounded-[12px] overflow-hidden card-shadow hairline-border">
                <div className="p-8 border-b border-border-low-alpha flex justify-between items-center">
                  <h2 className="font-headline-md text-headline-md text-on-surface">Invoice History</h2>
                </div>
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="bg-bg-secondary/50 border-b border-border-low-alpha">
                        <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Date</th>
                        <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Invoice ID</th>
                        <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Amount</th>
                        <th className="px-8 py-4 font-label-md text-label-md text-text-muted">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-low-alpha">
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-8 py-12 text-center text-text-muted font-body-md">
                            No invoices found. Billed history is generated after checkout.
                          </td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-bg-secondary/30 transition-colors group">
                            <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">{inv.date}</td>
                            <td className="px-8 py-5 font-label-md text-label-md text-on-surface-variant flex items-center flex-wrap gap-2">
                              <span>{inv.id}</span>
                              {inv.plan && (
                                <span className="text-[10px] uppercase font-bold text-text-muted bg-bg-cream border border-border-low-alpha/50 px-2 py-0.5 rounded">
                                  {inv.plan} • {inv.seats} {inv.seats === 1 ? "seat" : "seats"}
                                </span>
                              )}
                            </td>
                            <td className="px-8 py-5 font-data-mono text-data-mono text-on-surface">{inv.amount}</td>
                            <td className="px-8 py-5">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed-dim/20 text-tertiary font-label-md text-[12px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Manage Seats / Plan Dialog */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Manage Subscription"
        subtitle="Change your plan or adjust seat counts."
      >
        <form onSubmit={handleUpdateSubscription} className="space-y-6">
          <div>
            <label className="block font-label-md text-primary mb-2">Plan</label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="starter" disabled={planRank("starter") < planRank(billingInfo?.plan)}>
                Starter — $99/seat/mo {planRank("starter") < planRank(billingInfo?.plan) ? "(Downgrade Unavailable)" : ""}
              </option>
              <option value="growth" disabled={planRank("growth") < planRank(billingInfo?.plan)}>
                Growth — $199/seat/mo {planRank("growth") < planRank(billingInfo?.plan) ? "(Downgrade Unavailable)" : ""}
              </option>
              <option value="scale" disabled={planRank("scale") < planRank(billingInfo?.plan)}>
                Scale — $399/seat/mo {planRank("scale") < planRank(billingInfo?.plan) ? "(Downgrade Unavailable)" : ""}
              </option>
            </select>
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">Number of Seats</label>
            <input
              type="number"
              min={billingInfo?.seatsUsed || 1}
              max={100}
              value={selectedSeats}
              onChange={(e) => setSelectedSeats(parseInt(e.target.value) || 1)}
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-2 text-on-surface-variant font-label-md text-[13px]">
              Must be at least {billingInfo?.seatsUsed || 1} seats (currently active). Current plan has {billingInfo?.seats || 1} seats.
            </p>
          </div>
          
          {!isUpgrade() && (
            <div className="p-3 bg-error/10 text-error rounded-lg font-label-md text-[13px] border border-error/20">
              Selected plan/seat count must be an upgrade from your current {billingInfo?.plan.toUpperCase()} plan ({billingInfo?.seats} seats).
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={updating}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updating || !isUpgrade()}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {updating ? "Redirecting..." : "Checkout & Update"}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}

