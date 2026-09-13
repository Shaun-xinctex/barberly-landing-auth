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
 * Where a user lands after signing in. M1.1 branches `shop` and `customer`
 * ONLY — there is no logged-in admin yet, so an admin branch would be
 * unreachable dead code pointing at a page that does not exist.
 */
export function routeForRole(role: string | null | undefined): string {
  return role === "shop" ? "/shop" : "/barbers";
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
