import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useMyProfile } from "@/lib/profile";

/**
 * Gate for the shop surfaces. Must sit inside <RequireAuth>, which guarantees
 * there is a signed-in user; this adds the `profiles.role = 'shop'` check.
 */
export function RequireShop({ children }: { children: ReactNode }) {
  const { data: profile, isPending, isError } = useMyProfile();

  if (isPending) {
    return <div className="min-h-screen bg-background" aria-busy="true" aria-live="polite" />;
  }

  if (isError || !profile) return <Navigate to="/login" replace />;
  if (profile.role !== "shop") return <Navigate to="/barbers" replace />;

  return <>{children}</>;
}
