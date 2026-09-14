import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/**
 * M2.2 — commission settlement (抽成撥款).
 *
 * Three facts this module is built on, all of them load-bearing:
 *
 * 1. There is NO `transactions` table and bookings carry NO split columns. "Money in"
 *    is a `paid` booking's `price`; the 20/80 split is computed LIVE by the
 *    `owed_bookings` VIEW and SNAPSHOTTED onto a `payouts` row at build time.
 * 2. Settlement state is DERIVED from `bookings.payout_id` — `paid + payout_id NULL`
 *    is OWED, `paid + payout_id set` is in that payout (read `payouts.status`).
 *    A booking's own status stays `paid` through the whole payout lifecycle.
 * 3. Every write is an admin-guarded `security definer` RPC, so the payout row and
 *    the booking stamps commit together. Never write `payouts` or `payout_id` from
 *    the client.
 */

export type OwedBooking = Tables<"owed_bookings">;
export type Payout = Tables<"payouts">;

/** A `payouts` row plus the shop's bank details (admin-readable only). */
export type PayoutWithShop = Payout & {
  bank_account_name: string | null;
  bank_account_number: string | null;
};

/**
 * PostgREST's to-one embed comes back as an object, a single-element ARRAY, or null
 * depending on how it resolved the FK — while the generated TS type always claims
 * "object". Reading a field straight off it is a TypeError that only shows up in
 * production (the same trap `api/bookings/checkout.ts` hit in M2.1).
 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * The live owed pool: one row per `paid` booking with `payout_id IS NULL`, already
 * carrying `shop_name` / `barber_name` and its derived split.
 *
 * The admin sees every shop's rows; a shop sees only its own — that isolation is the
 * VIEW's `security_invoker = true` inheriting `bookings` RLS, NOT a filter here.
 */
export function useOwedBookings(shopId?: string) {
  return useQuery({
    queryKey: ["owed-bookings", shopId ?? "all"],
    queryFn: async (): Promise<OwedBooking[]> => {
      let query = supabase
        .from("owed_bookings")
        .select("*")
        .order("paid_at", { ascending: false, nullsFirst: false });
      if (shopId) query = query.eq("shop_id", shopId);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Customer emails for the owed list, fetched SEPARATELY and joined client-side.
 *
 * Deliberately not `.select("*, profiles(email)")` on the view: the view declares no
 * FK of its own, so a PostgREST embed on it silently returns nothing.
 */
export function useProfileEmails(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["profile-emails", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from("profiles").select("id, email").in("id", key);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.id] = row.email ?? "";
      return map;
    },
  });
}

/**
 * The payouts ledger. `payouts` is a real table with a declared FK to `profiles`, so
 * a normal embed IS fine here (unlike on the view) — it is how the admin gets the
 * bank account to transfer to. RLS keeps those fields admin-or-owner only.
 */
export function usePayouts() {
  return useQuery({
    queryKey: ["payouts"],
    queryFn: async (): Promise<PayoutWithShop[]> => {
      const { data, error } = await supabase
        .from("payouts")
        .select(
          "*, profiles!payouts_shop_id_fkey(display_name, bank_account_name, bank_account_number)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((row) => {
        const { profiles, ...payout } = row as Payout & {
          profiles?:
            | { bank_account_name: string | null; bank_account_number: string | null }
            | { bank_account_name: string | null; bank_account_number: string | null }[]
            | null;
        };
        const shop = one(profiles);
        return {
          ...payout,
          bank_account_name: shop?.bank_account_name ?? null,
          bank_account_number: shop?.bank_account_number ?? null,
        };
      });
    },
  });
}

/**
 * Build a payout batch from the checked owed bookings.
 *
 * The RPC — not this call — is what enforces the rules: every booking must still be
 * `paid` with `payout_id IS NULL`, and they must ALL resolve to the same shop (it
 * raises otherwise). Returns the new payout's id.
 */
export async function buildPayout(bookingIds: string[], note?: string): Promise<string> {
  const { data, error } = await supabase.rpc("build_payout", {
    p_booking_ids: bookingIds,
    ...(note && note.trim() ? { p_note: note.trim() } : {}),
  });
  if (error) throw error;
  return data as string;
}

/**
 * Record the bank transfer the admin already made OUTSIDE the app. Flips the payout
 * `pending_transfer → transferred`; the bookings are NOT touched — they are already
 * linked by `payout_id`, and "settled" is derived from that.
 */
export async function markPayoutTransferred(payoutId: string, bankReference?: string) {
  const { error } = await supabase.rpc("mark_payout_transferred", {
    p_payout_id: payoutId,
    ...(bankReference && bankReference.trim() ? { p_bank_reference: bankReference.trim() } : {}),
  });
  if (error) throw error;
}

/**
 * Cancel a batch built by mistake — only while `pending_transfer`. Its bookings'
 * `payout_id` is nulled (they flow back into the owed pool, still `paid`) and the row
 * is KEPT as `cancelled` for audit. A `transferred` payout is immutable.
 */
export async function cancelPayout(payoutId: string) {
  const { error } = await supabase.rpc("cancel_payout", { p_payout_id: payoutId });
  if (error) throw error;
}

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending_transfer: "待轉帳 / Pending",
  transferred: "已轉帳 / Transferred",
  cancelled: "已取消 / Cancelled",
};
