"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * OAuth redirect target. supabase-js (detectSessionInUrl) auto-exchanges the
 * `?code=` for a session on load; we wait for it, then hand off. AuthProvider
 * then routes to /onboarding/workspace if no workspace yet, else stays on
 * /dashboard. Errors fall back to /login.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      router.replace("/dashboard");
    };

    // OAuth provider returned an error?
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error_description") || params.get("error");
    if (err) {
      toast.error(decodeURIComponent(err));
      router.replace("/login");
      return;
    }

    // Session may already be set by detectSessionInUrl…
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });
    // …or arrive a moment later once the code exchange completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) finish();
      },
    );

    const timeout = setTimeout(() => {
      if (!done) {
        setMessage("Sign-in is taking longer than expected…");
        toast.error("Could not complete sign-in. Please try again.");
        router.replace("/login");
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg-cream">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="font-body-md text-body-md text-text-muted">{message}</p>
    </div>
  );
}
