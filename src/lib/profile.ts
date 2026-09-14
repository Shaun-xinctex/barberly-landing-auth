import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

/**
 * The signed-in user's `profiles` row — the single source of truth for role.
 * Never read the role from auth `user_metadata`: M0 captured it there before
 * the `profiles` table existed, but from M1.1 on `profiles.role` is what every
 * surface gates on.
 */
export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function useMyProfile() {
  return useQuery({ queryKey: ["my-profile"], queryFn: fetchMyProfile });
}

/**
 * Where a user lands after signing in.
 *
 * M1.1 deliberately branched `shop` and `customer` only — an admin branch would
 * have pointed at a page that did not exist. M2.2 builds `/admin/payouts`, so the
 * admin branch is added HERE, now that it has somewhere real to land. Without it
 * an admin is dumped on the customer marketplace after every login.
 */
export function routeForRole(role: string | null | undefined): string {
  if (role === "shop") return "/shop";
  if (role === "admin") return "/admin/payouts";
  return "/barbers";
}

/** True for the promotion-only `admin` role (granted by migration, never in-app). */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

/** Shop onboarding is only complete once all three shop-level fields are filled. */
export function isShopOnboarded(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    profile.display_name?.trim() &&
    profile.bank_account_name?.trim() &&
    profile.bank_account_number?.trim(),
  );
}
