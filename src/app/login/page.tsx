"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  const redirectPath = (
    rawRedirect.startsWith("/") &&
    !rawRedirect.startsWith("//") &&
    !/:|javascript|data/i.test(rawRedirect)
  ) ? rawRedirect : "/dashboard";

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Signed in successfully!");
      router.push(redirectPath);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initialize Google login";
      toast.error(msg);
    }
  };

  return (
    <div className="bg-bg-cream text-on-background min-h-screen flex items-center justify-center p-0 sm:p-6 lg:p-12 font-body-md text-body-md overflow-x-hidden">
      <div className="max-w-[1440px] w-full h-full lg:h-[800px] flex flex-col lg:flex-row bg-surface-white rounded-none sm:rounded-2xl overflow-hidden shadow-warm">
        {/* Left Side: Login Form */}
        <div className="w-full lg:w-1/2 p-6 sm:p-12 lg:p-24 flex flex-col justify-center relative bg-surface-white z-10">
          <div className="max-w-md w-full mx-auto space-y-8">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2 text-primary">
              <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>work</span>
              <span className="font-headline-lg text-headline-lg font-bold tracking-tight">TalScout</span>
            </Link>
            {/* Headers */}
            <div className="space-y-2">
              <h1 className="font-display-lg text-display-lg text-on-surface">Welcome back</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant">Log in to continue transforming your recruitment process.</p>
            </div>
            {/* Google Auth */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center space-x-3 py-3 px-4 border border-outline-variant rounded-lg hover:bg-surface-container-lowest transition-colors text-on-surface font-label-md text-label-md group relative overflow-hidden"
            >
              <span className="material-symbols-outlined text-xl z-10">login</span>
              <span className="z-10">Continue with Google</span>
              <div className="absolute inset-0 bg-surface-container opacity-0 group-hover:opacity-100 transition-opacity z-0"></div>
            </button>
            {/* Divider */}
            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-border-low-alpha"></div>
              <span className="flex-shrink-0 mx-4 text-on-surface-variant font-label-md text-label-md text-sm">or email</span>
              <div className="flex-grow border-t border-border-low-alpha"></div>
            </div>
            {/* Form */}
            <form onSubmit={handleEmailSignIn} className="space-y-6">
              <div className="space-y-2">
                <label className="block font-label-md text-label-md text-on-surface" htmlFor="email">Email address</label>
                <input
                  className="w-full px-4 py-3 bg-surface-bright border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-on-surface placeholder-outline"
                  id="email"
                  placeholder="name@company.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block font-label-md text-label-md text-on-surface" htmlFor="password">Password</label>
                  <a className="font-label-md text-label-md text-primary hover:text-primary-container transition-colors" href="#">Forgot password?</a>
                </div>
                <input
                  className="w-full px-4 py-3 bg-surface-bright border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-on-surface placeholder-outline"
                  id="password"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm flex items-center justify-center space-x-2 group disabled:opacity-50"
              >
                <span>{loading ? "Signing In..." : "Sign In"}</span>
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </form>
            <div className="text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">Don&apos;t have an account? <Link className="text-primary font-label-md text-label-md hover:underline decoration-secondary underline-offset-4" href="/signup">Request access</Link></p>
            </div>
          </div>
        </div>
        {/* Right Side: Brand Panel */}
        <div className="hidden lg:flex w-1/2 bg-primary-container text-on-primary relative overflow-hidden flex-col justify-between p-16 lg:p-24 items-start">
          {/* Abstract Pattern Overlay */}
          <div className="absolute inset-0 bg-pattern opacity-20 z-0"></div>
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary rounded-full blur-[100px] opacity-50 -translate-y-1/2 translate-x-1/4 z-0"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-secondary-container rounded-full blur-[120px] opacity-20 translate-y-1/3 -translate-x-1/4 z-0"></div>
          {/* Content Area */}
          <div className="relative z-10 mt-auto mb-auto w-full max-w-lg">
            <span className="material-symbols-outlined text-5xl text-secondary-container mb-8" style={{ fontVariationSettings: "'FILL' 1" }}>format_quote</span>
            <h2 className="font-headline-lg text-headline-lg text-on-primary leading-tight mb-8">
              &quot;TalScout didn&apos;t just speed up our hiring process; it gave us an entirely new level of insight into candidate potential. We&apos;re building better teams, faster.&quot;
            </h2>
            <div className="flex items-center space-x-4 border-l-2 border-secondary-container pl-4">
              <div>
                <p className="font-label-md text-label-md text-on-primary">Sarah Jenkins</p>
                <p className="font-body-md text-body-md text-on-primary-fixed-dim text-sm">Head of Talent Acquisition, TechFlow</p>
              </div>
            </div>
          </div>
          {/* Footer Stats or Info */}
          <div className="relative z-10 w-full flex justify-between items-center pt-8 border-t border-on-primary/10 mt-12">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-secondary-fixed">verified</span>
              <span className="font-data-mono text-data-mono text-on-primary-fixed">SOC2 Type II Certified</span>
            </div>
            <div className="flex space-x-4 opacity-70">
              <span className="w-2 h-2 rounded-full bg-on-primary"></span>
              <span className="w-2 h-2 rounded-full bg-on-primary opacity-30"></span>
              <span className="w-2 h-2 rounded-full bg-on-primary opacity-30"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg-cream">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
