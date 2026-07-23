import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";

/**
 * Shared "admin-only" empty state — replaces the identical block previously
 * duplicated verbatim in Billing and Team. Pages render this in place of
 * their normal content when `profile.role !== "admin"`.
 */
export function AdminGate({ description }: { description: string }) {
  return (
    <AppShell>
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center rounded-xl border border-border-low-alpha bg-surface-white p-8">
          <div className="w-16 h-16 bg-error text-on-error rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-[36px]">shield_person</span>
          </div>
          <h2 className="font-headline-md text-[24px] text-primary serif-text mb-3">Admin Access Required</h2>
          <p className="font-body-md text-on-surface-variant mb-6 text-[14px]">{description}</p>
          <Button asChild variant="gradient">
            <Link href="/dashboard">
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
