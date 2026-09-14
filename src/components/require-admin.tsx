import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useMyProfile } from "@/lib/profile";

/**
 * Gate for the admin surfaces (`/admin/*`). Mirrors <RequireShop>: it must sit inside
 * <RequireAuth>, which guarantees a signed-in user, and adds the
 * `profiles.role = 'admin'` check.
 *
 * This guard is UX only. The REAL enforcement is in the database: `payouts` and the
 * shop bank fields are admin-or-owner readable under RLS, and every payout write goes
 * through a `security definer` RPC that raises `admin only`. A non-admin who reached
 * this route anyway would read nothing and write nothing.
 *
 * `admin` is never self-served — it is granted by migration only (M2.1 prerequisite),
 * which is why nothing in the app ever writes `role: "admin"`.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: profile, isPending, isError } = useMyProfile();

  if (isPending) {
    return <div className="min-h-screen bg-background" aria-busy="true" aria-live="polite" />;
  }

  if (isError || !profile) return <Navigate to="/login" replace />;
  if (profile.role !== "admin") return <Navigate to="/barbers" replace />;

  return <>{children}</>;
}
