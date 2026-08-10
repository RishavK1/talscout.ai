"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight, HelpCircle } from "lucide-react";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";

export default function SetUpWorkspacePage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [agencyName, setAgencyName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyName.trim()) {
      toast.error("Please enter your agency name");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/signup", {
        workspaceName: agencyName,
      });
      toast.success("Workspace created successfully!");
      // Re-fetch profile in AuthProvider so the client-side session is fully synchronized
      await refreshProfile(true);
      router.push("/onboarding/plan");
    } catch (err: any) {
      toast.error(err.message || "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-bg-cream min-h-screen flex items-center justify-center font-body-md text-on-surface antialiased p-4 sm:p-6 md:p-12">
      {/* Top Left Brand — same icon (travel_explore) and chip as the main site nav */}
      <div className="fixed top-6 left-6 lg:top-12 lg:left-12 hidden md:block">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container shadow-sm">
            <span className="material-symbols-outlined text-[20px]">travel_explore</span>
          </span>
          <h1 className="font-headline-md text-headline-md text-primary tracking-tight">TalScout</h1>
        </Link>
      </div>
      {/* Main Container */}
      <main className="w-full max-w-[560px] mx-auto">
        {/* Progress Indicator */}
        <div className="mb-8 flex flex-col items-center">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-border-low-alpha bg-surface-white px-3 py-1.5 font-label-md text-label-md text-on-surface-variant">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-tertiary-fixed">
              <Zap className="size-[12px] text-on-tertiary-fixed" />
            </span>
            Step 1 of 3
          </span>
          <div className="flex gap-2 w-48">
            <div className="h-1 flex-1 rounded-full bg-primary-container"></div>
            <div className="h-1 flex-1 bg-border-low-alpha rounded-full"></div>
            <div className="h-1 flex-1 bg-border-low-alpha rounded-full"></div>
          </div>
        </div>
        {/* Card */}
        <Reveal>
        <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
          <CardContent>
          <header className="mb-8 text-center">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Create Workspace</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Set up your agency&apos;s digital headquarters to start collaborating with your team.</p>
          </header>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Agency Name */}
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-2" htmlFor="agency_name">Agency name</label>
              <input
                className="w-full bg-surface-bright border border-outline-variant rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-outline-variant/60"
                id="agency_name"
                name="agency_name"
                placeholder="Acme Recruitment"
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                disabled={loading}
              />
            </div>
            {/* Actions */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={loading}
                variant="gradient"
                size="lg"
                className="w-full justify-center"
              >
                <span>{loading ? "Creating..." : "Continue"}</span>
                <ArrowRight className="size-[18px]" />
              </Button>
            </div>
          </form>
          {/* Contextual Help */}
          <div className="mt-8 text-center">
            <a className="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors inline-flex items-center gap-1" href="mailto:support@talscout.ai">
              <HelpCircle className="size-[16px]" />
              Need help setting up?
            </a>
          </div>
          </CardContent>
        </Card>
        </Reveal>
      </main>
    </div>
  );
}
