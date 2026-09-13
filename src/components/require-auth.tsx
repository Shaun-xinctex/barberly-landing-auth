import type { User } from "@supabase/supabase-js";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { AuthedUserContext } from "@/lib/authed-user-context";

type AuthState =
  { status: "loading" } | { status: "authenticated"; user: User } | { status: "anonymous" };

/**
 * Client-side replacement for the `_authenticated` TanStack route guard.
 * Same behaviour: resolve the Supabase user, redirect to /login when absent.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) setState({ status: "anonymous" });
      else setState({ status: "authenticated", user: data.user });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) setState({ status: "authenticated", user: session.user });
      else setState({ status: "anonymous" });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (state.status === "loading") {
    return <div className="min-h-screen bg-background" aria-busy="true" aria-live="polite" />;
  }

  if (state.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  return <AuthedUserContext.Provider value={state.user}>{children}</AuthedUserContext.Provider>;
}
