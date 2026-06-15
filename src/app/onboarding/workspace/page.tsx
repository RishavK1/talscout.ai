"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function SetUpWorkspacePage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [agencyName, setAgencyName] = useState("");
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [industry, setIndustry] = useState("");
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
      {/* Top Left Brand */}
      <div className="fixed top-6 left-6 lg:top-12 lg:left-12 hidden md:block">
        <Link href="/">
          <h1 className="font-headline-md text-headline-md text-primary tracking-tight">TalScout</h1>
        </Link>
      </div>
      {/* Main Container */}
      <main className="w-full max-w-[560px] mx-auto">
        {/* Progress Indicator */}
        <div className="mb-8 flex flex-col items-center">
          <span className="font-label-md text-label-md text-on-surface-variant mb-3">Step 1 of 3</span>
          <div className="flex gap-2 w-48">
            <div className="h-1 flex-1 bg-primary rounded-full"></div>
            <div className="h-1 flex-1 bg-border-low-alpha rounded-full"></div>
            <div className="h-1 flex-1 bg-border-low-alpha rounded-full"></div>
          </div>
        </div>
        {/* Card */}
        <div className="bg-surface-white rounded-[16px] shadow-[0_4px_24px_rgba(44,35,34,0.05)] p-6 sm:p-8 md:p-10 border border-border-low-alpha/50">
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
            {/* Workspace URL */}
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-2" htmlFor="workspace_url">Workspace URL</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-outline-variant bg-surface-container-low font-body-md text-body-md text-on-surface-variant">
                  recruit-iq.com/
                </span>
                <input className="flex-1 min-w-0 block w-full px-4 py-3 rounded-none rounded-r-lg bg-surface-bright border border-outline-variant font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-outline-variant/60" id="workspace_url" name="workspace_url" placeholder="acme" type="text" value={workspaceUrl} onChange={(e) => setWorkspaceUrl(e.target.value)} disabled={loading} />
              </div>
            </div>
            {/* Industry */}
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-2" htmlFor="industry">Primary Industry</label>
              <div className="relative">
                <select className="w-full bg-surface-bright border border-outline-variant rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer" id="industry" name="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={loading}>
                  <option disabled value="">Select an industry</option>
                  <option value="tech">Technology &amp; Software</option>
                  <option value="finance">Finance &amp; Banking</option>
                  <option value="healthcare">Healthcare &amp; Medical</option>
                  <option value="retail">Retail &amp; E-commerce</option>
                  <option value="other">Other</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>expand_more</span>
                </div>
              </div>
            </div>
            {/* Actions */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-on-primary font-label-md text-label-md py-3 px-6 rounded-lg shadow-sm hover:bg-primary-container transition-colors duration-200 flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? "Creating..." : "Continue"}</span>
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>arrow_forward</span>
              </button>
            </div>
          </form>
          {/* Contextual Help */}
          <div className="mt-8 text-center">
            <a className="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors inline-flex items-center gap-1" href="#">
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>help</span>
              Need help setting up?
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
