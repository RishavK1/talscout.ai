"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      // Standard Supabase sign-up → sends a verification email when the project
      // has "Confirm email" enabled. The link returns to /auth/callback.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;

      if (data.session) {
        // Email confirmation is disabled → we already have a session.
        toast.success("Account created successfully!");
        router.push("/onboarding/workspace");
      } else {
        // Confirmation required → tell the user to check their inbox.
        setEmailSent(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize Google signup");
    }
  };

  if (emailSent) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-bg-cream p-4">
        <div className="w-full max-w-[480px] rounded-xl border border-border-low-alpha bg-white p-10 text-center shadow-[0_10px_40px_rgba(44,35,34,0.06)]">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container/10">
            <span className="material-symbols-outlined text-[28px] text-primary">mark_email_unread</span>
          </div>
          <h1 className="mb-2 font-headline-lg text-headline-lg text-on-surface">Check your email</h1>
          <p className="mb-6 font-body-md text-body-md text-on-surface-variant">
            We sent a verification link to{" "}
            <span className="font-semibold text-on-surface">{email}</span>. Click it to
            activate your account, then come back to log in.
          </p>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container"
          >
            Back to log in
          </Link>
          <p className="mt-4 font-body-md text-[13px] text-text-muted">
            Didn&apos;t get it? Check spam, or{" "}
            <button
              type="button"
              onClick={() => setEmailSent(false)}
              className="text-primary underline-offset-4 hover:underline"
            >
              try again
            </button>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    // Split Screen Container
    <main className="flex min-h-screen w-full overflow-hidden">
      {/* Left Panel (55%): Registration Flow */}
      <section className="w-full lg:flex-[0.55] bg-bg-cream flex items-center justify-center p-4 sm:p-6 relative overflow-y-auto">
        {/* Auth Card */}
        <div className="w-full max-w-[480px] bg-white rounded-xl p-10 shadow-[0_10px_40px_rgba(44,35,34,0.06)] border border-border-low-alpha">
          {/* Logo Cluster */}
          <Link href="/" className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            </div>
            <span className="font-headline-md text-headline-md text-primary tracking-tight">TalScout</span>
          </Link>
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-headline-lg text-headline-lg text-on-background mb-2">Create your account</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Start finding talent in minutes.</p>
          </div>
          {/* Social Auth */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-outline-variant rounded-lg font-label-md text-label-md text-on-background hover:bg-surface-container-low transition-all duration-200"
          >
            <svg height="18" viewBox="0 0 18 18" width="18">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
              <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.443 2.048.957 4.961l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-low-alpha"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-4 font-label-md text-text-muted">or</span>
            </div>
          </div>
          {/* Form */}
          <form onSubmit={handleSignUp} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block font-label-md text-label-md text-on-surface-variant" htmlFor="name">Full name</label>
              <input
                className="w-full px-4 py-3 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary transition-all font-body-md"
                id="name"
                placeholder="John Doe"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block font-label-md text-label-md text-on-surface-variant" htmlFor="email">Work email</label>
              <input
                className="w-full px-4 py-3 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary transition-all font-body-md"
                id="email"
                placeholder="name@company.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block font-label-md text-label-md text-on-surface-variant" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  className="w-full px-4 py-3 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary transition-all font-body-md pr-10"
                  id="password"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                  id="password-toggle"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-symbols-outlined text-[20px]">{showPassword ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full text-center py-4 bg-primary text-white font-label-md text-label-md rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200 mt-2 disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
          {/* Footer Links */}
          <div className="mt-8 text-center space-y-4">
            <p className="font-body-md text-body-md text-on-surface-variant">
              Already have an account?{" "}
              <Link className="text-primary font-semibold hover:underline decoration-2 underline-offset-4" href="/login">Log in</Link>
            </p>
            <p className="text-[12px] font-body-md text-text-muted leading-relaxed px-4">
              By signing up, you agree to our{" "}
              <Link className="underline" href="/terms">Terms</Link> and <Link className="underline" href="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </section>
      {/* Right Panel (45%): Brand & Social Proof */}
      <section className="lg:flex-[0.45] bg-primary relative hidden lg:flex items-center justify-center px-16">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="w-full h-full" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, #FAF7F3 1px, transparent 0)", backgroundSize: "48px 48px" }}></div>
        </div>
        <div className="relative z-10 max-w-lg">
          {/* AI Insight Badge Visual */}
          <div className="mb-12 animate-fade-in-up">
            <div className="inline-flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 pr-8 rounded-2xl border border-white/10">
              <div className="w-14 h-14 bg-secondary-container rounded-xl flex items-center justify-center shadow-lg">
                <span className="font-data-mono text-secondary font-bold text-lg">94%</span>
              </div>
              <div>
                <p className="text-bg-cream font-label-md text-label-md mb-0.5">AI Match Score</p>
                <p className="text-white/60 text-[12px] font-body-md">Precision Candidate Analysis</p>
              </div>
            </div>
          </div>
          {/* Testimonial */}
          <blockquote className="space-y-8">
            <p className="font-headline-lg text-display-lg text-bg-cream leading-tight">
              &quot;TalScout didn&apos;t just speed up our hiring process; it gave us an entirely new level of insight into candidate potential.&quot;
            </p>
            <footer className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center bg-surface-container-high text-primary font-headline-md">SJ</div>
              <div>
                <cite className="not-italic font-label-md text-label-md text-white block">Sarah Jenkins</cite>
                <span className="text-bg-cream/60 text-body-md font-body-md">Head of Talent @ TechFlow</span>
              </div>
            </footer>
          </blockquote>
          {/* Logo Anchor bottom */}
          <div className="absolute bottom-12 left-16">
            <div className="flex items-center gap-2 text-white/40">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              <span className="text-[12px] font-body-md uppercase tracking-widest">Enterprise Secured Recruitment</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
