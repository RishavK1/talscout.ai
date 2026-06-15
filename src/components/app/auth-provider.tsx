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

  // Helper to set/delete session cookie for Next.js Middleware
  const setSessionCookie = (token?: string, expiresSec?: number) => {
    if (token && expiresSec) {
      document.cookie = `sb-access-token=${token}; path=/; max-age=${expiresSec}; SameSite=Lax; Secure`;
    } else {
      document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax; Secure`;
    }
  };

  const fetchProfile = async (skipRedirect = false) => {
    try {
      const data = await api.get<{
        userId: string;
        tenantId: string;
        role: string;
        email: string;
        workspaceName?: string;
      }>("/api/auth/session");

      setProfile({
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role,
        email: data.email,
      });
      // The session route might return workspaceName or we can query it later
      setWorkspaceName(data.workspaceName ?? "Workspace");
      
      // If we are on login, signup, or onboarding/workspace, redirect to dashboard now that they have a workspace.
      if (!skipRedirect) {
        if (pathname === "/onboarding/workspace" || pathname === "/login" || pathname === "/signup") {
          router.push("/dashboard");
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
        setSessionCookie();
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
    setSessionCookie();
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
          setSessionCookie(session.access_token, session.expires_in);
          await fetchProfile(true); // skip redirect here, handle in the routing effect
        } else {
          setUser(null);
          setProfile(null);
          setSessionCookie();
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
        setSessionCookie(session.access_token, session.expires_in);
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          await fetchProfile(true); // skip redirect here
        }
      } else {
        setUser(null);
        setProfile(null);
        setWorkspaceName(null);
        setSessionCookie();
      }
      
      if (initializedRef.current) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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
        if (pathname === "/login" || pathname === "/signup" || pathname === "/onboarding/workspace") {
          router.push("/dashboard");
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
