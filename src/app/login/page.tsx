"use client";

import Link from "next/link";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { authCallbackUrl } from "@/lib/auth-redirect";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Reveal } from "@/components/motion/reveal";
import { BorderBeam } from "@/components/ui/border-beam";
import { SpotlightCard } from "@/components/ui/spotlight-card";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  const redirectPath = (
    rawRedirect.startsWith("/") &&
    !rawRedirect.startsWith("//") &&
    !/:|javascript|data/i.test(rawRedirect)
  ) ? rawRedirect : "/dashboard";

  // Landed here via the api.ts 401 interceptor's hard redirect — that flow
  // already toasted once before reloading, but the reload can outrun it, so
  // this is the message a user reliably sees.
  const expiredToastShown = useRef(false);
  useEffect(() => {
    if (searchParams.get("expired") === "1" && !expiredToastShown.current) {
      expiredToastShown.current = true;
      toast.error("Your session expired — please sign in again.");
    }
  }, [searchParams]);

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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setSendingReset(true);
    try {
      // The recovery link returns to /auth/callback?flow=recovery, which then
      // routes the signed-in user to Settings → Security to set a new password.
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${authCallbackUrl()}?flow=recovery`,
      });
      if (error) throw error;
      toast.success(`Password reset link sent to ${forgotEmail} — check your inbox.`);
      setForgotOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reset email";
      toast.error(msg);
    } finally {
      setSendingReset(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authCallbackUrl(),
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initialize Google login";
      toast.error(msg);
    }
  };

  return (
    <div className="relative bg-bg-cream text-on-background min-h-screen flex items-center justify-center p-0 sm:p-6 lg:p-12 font-body-md text-body-md overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,var(--color-border-low-alpha)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-low-alpha)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)] dark:opacity-30"
      />
      <Reveal className="relative max-w-[1440px] w-full h-full lg:h-[800px] flex flex-col lg:flex-row bg-surface-white rounded-none sm:rounded-2xl overflow-hidden shadow-warm">
        <BorderBeam size={110} duration={15} />
        {/* Left Side: Login Form */}
        <div className="w-full lg:w-1/2 p-6 sm:p-12 lg:p-24 flex flex-col justify-center relative bg-surface-white z-10">
          <div className="max-w-md w-full mx-auto space-y-8">
            {/* Logo — same icon (travel_explore) and chip as the main site nav */}
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container shadow-sm">
                <span className="material-symbols-outlined text-[20px]">travel_explore</span>
              </span>
              <span className="font-headline-md text-headline-md text-primary tracking-tight">TalScout</span>
            </Link>
            {/* Headers */}
            <div className="space-y-2">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Welcome back</h1>
              <p className="font-body-md text-body-md text-on-surface-variant">Log in to continue transforming your recruitment process.</p>
            </div>
            {/* Google Auth */}
            <SpotlightCard className="rounded-lg">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-outline-variant rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <svg height="18" viewBox="0 0 18 18" width="18" aria-hidden="true">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                  <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.443 2.048.957 4.961l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>
            </SpotlightCard>
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
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotOpen(true);
                    }}
                    className="font-label-md text-label-md text-primary underline-offset-2 transition-[filter] hover:underline hover:brightness-110"
                  >
                    Forgot password?
                  </button>
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
                className="w-full py-3 px-4 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:brightness-110 transition-[filter] shadow-sm flex items-center justify-center space-x-2 group disabled:opacity-50"
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
        {/* Right Side: Brand Panel. Background and foreground MUST come from
         *  the same token family — `bg-primary-container` pairs with
         *  `text-on-primary-container`. Pairing it with `text-on-primary`
         *  (near-black in dark mode) or `text-on-primary-fixed-variant`
         *  (dark teal in light mode) put low-contrast text on a teal panel
         *  in one mode or the other. Decorative glows use the foreground
         *  token at low opacity so they stay subtle in both modes instead
         *  of washing the panel out with a light-sage `bg-primary` blur. */}
        <div className="hidden lg:flex w-1/2 bg-primary-container text-on-primary-container relative overflow-hidden flex-col justify-between p-16 lg:p-24 items-start">
          {/* Abstract Pattern Overlay */}
          <div className="absolute inset-0 bg-pattern opacity-20 z-0"></div>
          {/* Decorative Elements */}
          <motion.div
            aria-hidden
            className="absolute top-0 right-0 w-96 h-96 bg-on-primary-container/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 z-0"
            animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="absolute bottom-0 left-0 w-80 h-80 bg-on-primary-container/[0.07] rounded-full blur-[120px] translate-y-1/3 -translate-x-1/4 z-0"
            animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
          {/* Content Area */}
          <div className="relative z-10 mt-auto mb-auto w-full max-w-lg">
            <h2 className="font-headline-lg text-headline-lg text-on-primary-container leading-tight mb-6">
              Two AI engines, one workspace.
            </h2>
            <p className="font-body-md text-body-md text-on-primary-container/75">
              Outreach discovers businesses that fit what you sell and writes each a personal email. Talent turns your résumé pile into a database you can search in plain English. Run one, or run both.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Forgot password */}
      <Modal
        open={forgotOpen}
        onClose={() => !sendingReset && setForgotOpen(false)}
        title="Reset your password"
        subtitle="We'll email you a link to choose a new one."
      >
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div>
            <label className="block font-label-md text-[13px] text-primary mb-1.5" htmlFor="forgot-email">
              Email address
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoFocus
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setForgotOpen(false)}
              disabled={sendingReset}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sendingReset}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {sendingReset ? "Sending..." : "Send reset link"}
            </button>
          </div>
        </form>
      </Modal>
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
