"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api, ApiError } from "@/lib/api";
import type { User } from "@supabase/supabase-js";

export interface UserProfile {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  subscriptionStatus: string;
  plan: string;
  capabilities: string[];
  logo: string | null;
  avatar: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  /** True only when the server explicitly reported no provisioned account —
   *  the sole signal that /onboarding/workspace is the right destination. */
  needsOnboarding: boolean;
  loading: boolean;
  workspaceName: string | null;
  /** True if the current plan includes the given capability. */
  can: (capability: string) => boolean;
  refreshProfile: (skipRedirect?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // True ONLY when the server explicitly said "No account provisioned" — the
  // one case where /onboarding/workspace is the right destination. A profile
  // that's null for any other reason (transient network/DB error, token
  // hydration race right after the OAuth redirect) must NOT route an
  // already-onboarded user into onboarding.
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  const fetchProfile = async (skipRedirect = false, attempt = 0) => {
    try {
      const data = await api.get<{
        userId: string;
        tenantId: string;
        role: string;
        email: string;
        workspaceName?: string;
        subscriptionStatus?: string;
        plan?: string;
        capabilities?: string[];
        logo?: string | null;
        avatar?: string | null;
      }>("/api/auth/session");

      setProfile({
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role,
        email: data.email,
        subscriptionStatus: data.subscriptionStatus ?? "incomplete",
        plan: data.plan ?? "starter",
        capabilities: data.capabilities ?? [],
        logo: data.logo ?? null,
        avatar: data.avatar ?? null,
      });
      setNeedsOnboarding(false);
      // The session route might return workspaceName or we can query it later
      setWorkspaceName(data.workspaceName ?? "Workspace");

      // If we are on login, signup, or onboarding/workspace, redirect accordingly.
      if (!skipRedirect) {
        const isActive = ["active", "trialing", "past_due"].includes(data.subscriptionStatus ?? "incomplete");
        if (pathname === "/onboarding/workspace" || pathname === "/login" || pathname === "/signup") {
          if (isActive) {
            router.push("/dashboard");
          } else {
            router.push("/onboarding/plan");
          }
        }
      }
    } catch (err) {
      // Backoff schedule for BOTH branches below — a stale/racy client-side
      // session right after a fresh OAuth redirect (logout, then sign back
      // in) can make even a genuine account transiently look unprovisioned
      // or unreachable. Re-confirm before committing to either terminal
      // action instead of trusting the very first response.
      const RETRY_DELAYS_MS = [700, 1500];
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        return fetchProfile(skipRedirect, attempt + 1);
      }

      if (err instanceof ApiError && err.status === 401 && err.message.includes("No account provisioned")) {
        // Server said this on every attempt across the retry window —
        // genuinely a new account. Onboarding is the right destination.
        setProfile(null);
        setNeedsOnboarding(true);
        // Redirect to onboarding (skip if this was a silent call — the routing
        // effect owns navigation decisions once loading settles).
        if (!skipRedirect && !pathname.startsWith("/onboarding")) {
          router.push("/onboarding/workspace");
        }
        return;
      }
      // Anything else is ambiguous: a "Missing bearer token" race right after
      // the OAuth code exchange (getSession resolving before the new token is
      // persisted), a transient network/DB blip, etc. Do NOT mark the user as
      // needing onboarding; an existing account must never be bounced into
      // /onboarding/workspace by a blip.
      setProfile(null);
      setNeedsOnboarding(false);
      if (!skipRedirect && !["/", "/login", "/signup", "/pricing", "/privacy", "/terms"].includes(pathname)) {
        router.push("/login");
      }
    }
  };

  const refreshProfile = async (skipRedirect = false) => {
    setLoading(true);
    await fetchProfile(skipRedirect);
    setLoading(false);
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setNeedsOnboarding(false);
    setWorkspaceName(null);
    setLoading(false);
    router.push("/login");
  };

  // 1. Initialize auth and listen to state changes (on mount only)
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (session) {
          setUser(session.user);
          await fetchProfile(true); // skip redirect here, handle in the routing effect
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error("Error during initAuth:", err);
      } finally {
        if (mounted) {
          initializedRef.current = true;
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (session) {
        setUser(session.user);
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          // Deferred out of the callback: supabase-js holds its auth lock
          // while emitting this event, and fetchProfile → api → getSession()
          // re-enters the client. Calling it synchronously here is the
          // documented deadlock/empty-token pitfall — the exact "Missing
          // bearer token" seen right after the OAuth redirect.
          setTimeout(async () => {
            if (!mounted) return;
            await fetchProfile(true); // skip redirect here
            if (mounted && initializedRef.current) setLoading(false);
          }, 0);
          return; // loading settles when the deferred fetch finishes
        }
      } else {
        setUser(null);
        setProfile(null);
        setNeedsOnboarding(false);
        setWorkspaceName(null);
      }

      if (initializedRef.current) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Handle redirection logic when auth state or path changes
  useEffect(() => {
    if (loading) return;

    const isPublicPath = ["/", "/login", "/signup", "/pricing", "/privacy", "/terms"].includes(pathname);
    const isOnboardingPath = pathname.startsWith("/onboarding");

    if (!user) {
      if (!isPublicPath) {
        router.push("/login");
      }
    } else {
      if (profile) {
        const isActive = ["active", "trialing", "past_due"].includes(profile.subscriptionStatus);
        if (!isActive) {
          // If subscription is incomplete/canceled, they MUST go through
          // onboarding plan/checkout — but /billing is ALWAYS reachable
          // (not just right after a fresh checkout redirect) so a locked-out
          // customer has a way to fix their payment method or see what
          // happened, instead of being bounced straight to the paywall with
          // no escape hatch.
          if (!isOnboardingPath && !isPublicPath && pathname !== "/billing") {
            router.push("/onboarding/plan");
          }
        } else {
          // If subscription is active, redirect them away from auth/onboarding paths to dashboard
          if (pathname === "/login" || pathname === "/signup" || pathname === "/onboarding/workspace" || pathname === "/onboarding/plan") {
            router.push("/dashboard");
          }
        }
      } else if (needsOnboarding) {
        // Only the server's explicit "No account provisioned" lands here —
        // a profile that failed to load for any other reason must not push
        // an existing account into onboarding.
        if (!isPublicPath && !isOnboardingPath) {
          router.push("/onboarding/workspace");
        }
      }
    }
  }, [user, profile, needsOnboarding, loading, pathname, router]);

  const can = (capability: string) =>
    !!profile?.capabilities?.includes(capability);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        needsOnboarding,
        loading,
        workspaceName,
        can,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
