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

    const params = new URLSearchParams(window.location.search);
    // Password-recovery links land here too (?flow=recovery, set by our
    // resetPasswordForEmail call; type=recovery covers Supabase's implicit
    // flow). Those users go straight to setting a new password.
    const isRecovery =
      params.get("flow") === "recovery" ||
      params.get("type") === "recovery" ||
      window.location.hash.includes("type=recovery");

    const finish = (recovery = isRecovery) => {
      if (done) return;
      done = true;
      if (recovery) {
        toast.info("You're signed in — set your new password now.");
        router.replace("/settings#security");
      } else {
        router.replace("/dashboard");
      }
    };

    // OAuth provider returned an error?
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
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") finish(true);
        else if (session) finish();
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
