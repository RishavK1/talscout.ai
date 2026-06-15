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
  logo: string | null;
  avatar: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  workspaceName: string | null;
  refreshProfile: (skipRedirect?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  const fetchProfile = async (skipRedirect = false) => {
    try {
      const data = await api.get<{
        userId: string;
        tenantId: string;
        role: string;
        email: string;
        workspaceName?: string;
        subscriptionStatus?: string;
        plan?: string;
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
        logo: data.logo ?? null,
        avatar: data.avatar ?? null,
      });
      // The session route might return workspaceName or we can query it later
      setWorkspaceName(data.workspaceName ?? "Workspace");
      
      // If we are on login, signup, or onboarding/workspace, redirect accordingly.
      if (!skipRedirect) {
        const isActive = ["active", "trialing"].includes(data.subscriptionStatus ?? "incomplete");
        if (pathname === "/onboarding/workspace" || pathname === "/login" || pathname === "/signup") {
          if (isActive) {
            router.push("/dashboard");
          } else {
            router.push("/onboarding/plan");
          }
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.message.includes("No account provisioned")) {
        // User exists in Supabase but no workspace provisioned in DB
        setProfile(null);
        // Redirect to onboarding
        if (!pathname.startsWith("/onboarding")) {
          router.push("/onboarding/workspace");
        }
      } else {
        // General error or token invalid
        setProfile(null);
        if (!["/", "/login", "/signup", "/pricing", "/privacy", "/terms"].includes(pathname)) {
          router.push("/login");
        }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (session) {
        setUser(session.user);
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          await fetchProfile(true); // skip redirect here
        }
      } else {
        setUser(null);
        setProfile(null);
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
    const hasSessionId = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("session_id");

    if (!user) {
      if (!isPublicPath) {
        router.push("/login");
      }
    } else {
      if (profile) {
        const isActive = ["active", "trialing"].includes(profile.subscriptionStatus);
        if (!isActive) {
          // If subscription is incomplete, they MUST go through onboarding plan/checkout
          if (!isOnboardingPath && !isPublicPath && !(pathname === "/billing" && hasSessionId)) {
            router.push("/onboarding/plan");
          }
        } else {
          // If subscription is active, redirect them away from auth/onboarding paths to dashboard
          if (pathname === "/login" || pathname === "/signup" || pathname === "/onboarding/workspace" || pathname === "/onboarding/plan") {
            router.push("/dashboard");
          }
        }
      } else {
        if (!isPublicPath && !isOnboardingPath) {
          router.push("/onboarding/workspace");
        }
      }
    }
  }, [user, profile, loading, pathname, router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        workspaceName,
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
