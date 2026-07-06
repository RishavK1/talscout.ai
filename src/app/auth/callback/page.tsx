"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/app/auth-provider";
import { toast } from "sonner";

/**
 * OAuth/email-confirmation redirect target. supabase-js (detectSessionInUrl)
 * auto-exchanges the `?code=` for a session on load; AuthProvider (mounted
 * above us in the root layout) picks that session up and fetches the profile.
 * We wait for AuthProvider to finish (loading === false) and then navigate
 * straight to the correct destination — never through /dashboard first —
 * so a fresh signup can't flash real app content before onboarding/billing.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [message, setMessage] = useState("Completing sign-in…");
  const [isRecovery, setIsRecovery] = useState(false);

  // Detect OAuth errors / password-recovery links once, on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // No session means the second effect's `!user` guard already skips any
    // redirect race, so we don't need separate error state here.
    const err = params.get("error_description") || params.get("error");
    if (err) {
      toast.error(decodeURIComponent(err));
      router.replace("/login");
      return;
    }

    // Password-recovery links land here too (?flow=recovery, set by our
    // resetPasswordForEmail call; type=recovery covers Supabase's implicit
    // flow). Those users go straight to setting a new password.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRecovery(
      params.get("flow") === "recovery" ||
      params.get("type") === "recovery" ||
      window.location.hash.includes("type=recovery"),
    );

    let recoveryHandled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !recoveryHandled) {
        recoveryHandled = true;
        toast.info("You're signed in — set your new password now.");
        router.replace("/settings#security");
      }
    });

    const timeout = setTimeout(() => {
      setMessage("Sign-in is taking longer than expected…");
      toast.error("Could not complete sign-in. Please try again.");
      router.replace("/login");
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once AuthProvider has resolved session + profile, land exactly where the
  // user belongs (workspace setup / plan selection / dashboard) in one hop.
  useEffect(() => {
    if (isRecovery || loading || !user) return;
    if (!profile) {
      router.replace("/onboarding/workspace");
      return;
    }
    const isActive = ["active", "trialing"].includes(profile.subscriptionStatus);
    router.replace(isActive ? "/dashboard" : "/onboarding/plan");
  }, [isRecovery, loading, user, profile, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg-cream">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="font-body-md text-body-md text-text-muted">{message}</p>
    </div>
  );
}
