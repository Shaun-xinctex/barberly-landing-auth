import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Slot = Pick<Tables<"bookable_slots">, "id" | "starts_at" | "ends_at">;

/**
 * Create a booking spanning N consecutive slots (N = `services.required_slots`).
 *
 * The whole write is the `create_booking` RPC — ONE transaction that inserts the
 * `pending_payment` booking plus its N `booking_slots` rows, snapshots the price
 * server-side, and rolls the lot back if any of the N slots is already held (the
 * `UNIQUE(slot_id)` on `booking_slots`). Never assemble this client-side as a
 * booking insert followed by N join-row inserts: a half-held booking could exist.
 *
 * `startSlotId` is only the argument the RPC derives the run from — it is NOT
 * stored on the booking. The start time is `MIN(starts_at)` over the booking's
 * slots, read back from the `bookings_with_start` view.
 *
 * Throws the raw `PostgrestError`; surface it with `errMessage()`.
 */
export async function createBooking(serviceId: string, startSlotId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_booking", {
    p_service_id: serviceId,
    p_start_slot_id: startSlotId,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Hand a `pending_payment` booking to Stripe and get back its hosted Checkout URL.
 *
 * The amount is NEVER sent from here. `/api/bookings/checkout` re-reads the booking's
 * `price` snapshot with the service-role key and builds the line item server-side, so a
 * tampered client cannot change what gets charged. All this call carries is the id.
 */
export async function startCheckout(bookingId: string): Promise<string> {
  const response = await fetch("/api/bookings/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ booking_id: bookingId }),
  });

  // The route always answers JSON. An HTML body here means the SPA catch-all rewrite
  // swallowed /api/* (see vercel.json) — surface that rather than a JSON parse error.
  const raw = await response.text();
  let payload: { url?: string; error?: string };
  try {
    payload = JSON.parse(raw) as { url?: string; error?: string };
  } catch {
    throw new Error(
      `The checkout route returned ${response.status} but not JSON — /api/* is probably ` +
        `being served the SPA shell instead of the serverless function.`,
    );
  }

  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? `Could not start checkout (HTTP ${response.status}).`);
  }
  return payload.url;
}

/**
 * A barber's still-bookable slots, soonest first.
 *
 * Availability is DERIVED, never stored: `bookable_slots` has no status column, so a
 * slot is offered unless a `booking_slots` row references it. The embed below is that
 * anti-join — `booking_slots` is public-select precisely so an anonymous browser can
 * read it — and a slot with a non-empty embed is held by a live booking. Cancelling a
 * booking deletes its `booking_slots` rows, so the slot reappears here on the next read.
 */
export async function fetchAvailableSlots(barberId: string): Promise<Slot[]> {
  const { data, error } = await supabase
    .from("bookable_slots")
    .select("id, starts_at, ends_at, booking_slots(slot_id)")
    .eq("barber_id", barberId)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => (row.booking_slots ?? []).length === 0)
    .map(({ id, starts_at, ends_at }) => ({ id, starts_at, ends_at }));
}

export function useAvailableSlots(barberId: string | undefined) {
  return useQuery({
    queryKey: ["available-slots", barberId],
    queryFn: () => fetchAvailableSlots(barberId as string),
    enabled: Boolean(barberId),
  });
}

/**
 * The run of `n` back-to-back slots beginning at `slots[index]`, or null if it can't
 * be formed.
 *
 * `slots` must be the AVAILABLE list, sorted by `starts_at`. This mirrors what
 * `create_booking` enforces server-side: every slot after the first must start exactly
 * where the previous one ended. A slot held by someone else drops out of the available
 * list and therefore shows up here as a broken `ends_at → starts_at` chain, so a start
 * time whose run is blocked is rejected the same way the RPC would reject it.
 *
 * N comes straight from `service.required_slots` — never `ceil(duration / 30)`.
 */
export function consecutiveRun(slots: Slot[], index: number, n: number): Slot[] | null {
  if (n < 1 || index < 0 || index + n > slots.length) return null;

  const run = slots.slice(index, index + n);
  for (let i = 1; i < run.length; i += 1) {
    const previous = run[i - 1];
    const current = run[i];
    // `noUncheckedIndexedAccess` is on, so an index read is `Slot | undefined`.
    // The bounds check above already rules this out; satisfy the compiler rather
    // than assert past it.
    if (!previous || !current) return null;
    if (new Date(previous.ends_at).getTime() !== new Date(current.starts_at).getTime()) {
      return null;
    }
  }
  return run;
}

/**
 * Every slot that can legally START a booking of `n` slots, mapped to the full run it
 * would consume — so the dialog can highlight all N and say "18:00–19:30 (3 slots)"
 * instead of leaving the customer to guess that a 90-minute perm eats three cells.
 */
export function startSlotRuns(slots: Slot[], n: number): Map<string, Slot[]> {
  const runs = new Map<string, Slot[]>();
  slots.forEach((slot, index) => {
    const run = consecutiveRun(slots, index, n);
    if (run) runs.set(slot.id, run);
  });
  return runs;
}
