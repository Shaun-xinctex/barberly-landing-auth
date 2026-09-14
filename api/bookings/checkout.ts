import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

// NOTE the `.js` ESM extension. package.json is `"type": "module"` and Vercel
// transpiles each /api file separately, so a bare '../_supabaseAdmin' resolves at
// build time but 500s at RUNTIME with ERR_MODULE_NOT_FOUND. `vite build` stays green.
import { supabaseAdmin } from "../_supabaseAdmin.js";

const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"] ?? "");

/**
 * Stripe's TRUE zero-decimal currencies — the only ones whose smallest unit is the
 * whole unit. TWD is NOT in this list: Stripe treats it as 2-decimal and charges it
 * in 1/100 units exactly like USD, so a NT$300 cut is `unit_amount: 30000`.
 *
 * Do NOT drive this off `platform_settings.currency_minor_units` (0 for TWD) — that
 * column is a DISPLAY concept (show whole TWD in the UI), a different thing from
 * Stripe's per-currency exponent. Using it would send `300` = NT$3.00, which is below
 * Stripe's ~US$0.50 minimum: the Session is REJECTED and the customer never reaches
 * the payment page.
 */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

/**
 * A to-one PostgREST embed comes back as an object, but the shape is decided at RUNTIME
 * by how PostgREST reads the foreign keys — it can arrive as a one-element ARRAY, and it
 * is null when the row is missing. TypeScript's generated types promise an object either
 * way, so reading `.barber_id` straight off it is a latent TypeError that only fires in
 * production. Normalise instead of trusting the type.
 */
function one<T>(embed: T | T[] | null | undefined): T | null {
  if (embed == null) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  // EVERY failure below answers with JSON naming the stage it failed at. An unhandled
  // throw here would be a bare 500 with no body, which is exactly the kind of silent
  // failure that costs an hour to trace from the browser side.
  try {
    const bookingId = (req.body as { booking_id?: unknown } | undefined)?.booking_id;
    if (typeof bookingId !== "string" || !bookingId) {
      return res.status(400).json({ error: "booking_id is required", stage: "input" });
    }

    // Load the pending_payment booking and its PRICE SNAPSHOT (written by create_booking
    // in M1.2) — never trust a price sent by the client.
    //
    // `bookings` has no barber_id and no start_slot_id: the barber is reached through the
    // service (bookings.service_id -> services.barber_id -> barbers) and the slots live in
    // booking_slots. Neither is needed to build the line item beyond the display name.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, status, price, services(name, barber_id, barbers(name))")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({
        error: "booking not found",
        stage: "load-booking",
        detail: bookingError?.message ?? null,
      });
    }
    if (booking.status !== "pending_payment") {
      return res
        .status(400)
        .json({ error: "booking not payable", stage: "status", status: booking.status });
    }

    const service = one(booking.services);
    if (!service) {
      return res.status(500).json({ error: "booking has no service", stage: "embed-service" });
    }
    const barberId = service.barber_id;
    const barberName = one(service.barbers)?.name ?? "";

    // The currency comes from platform_settings (created in M1.1) — do not hard-code TWD.
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("platform_settings")
      .select("currency")
      .single();

    if (settingsError || !settings) {
      return res.status(500).json({
        error: "platform_settings unavailable",
        stage: "load-settings",
        detail: settingsError?.message ?? null,
      });
    }

    const currency = settings.currency.toLowerCase();
    const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
    const unitAmount = booking.price * factor; // TWD 300 -> 30000 (NT$300.00)

    // Same-origin POSTs do send an Origin header, but fall back to the Host so a proxy
    // that strips it cannot produce a Session with a broken redirect.
    const origin =
      (req.headers.origin as string | undefined) ??
      (req.headers.host ? `https://${req.headers.host}` : "");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: barberName ? `${service.name} @ ${barberName}` : service.name,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      // booking_id is the ONLY join key the webhook needs, and it is set here by the
      // server — the customer cannot forge it. Never look the booking up by email.
      metadata: { booking_id: booking.id, customer_id: booking.customer_id },
      client_reference_id: booking.id,
      // The success page polls THE BOOKING, and nothing on the booking maps a Stripe
      // session_id back to a booking_id — so booking_id has to travel in the URL.
      // session_id is carried for display/debugging only.
      success_url: `${origin}/bookings/success?booking_id=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/barbers/${barberId}`,
    });

    if (!session.url) {
      return res.status(502).json({ error: "Stripe returned no checkout url", stage: "stripe" });
    }
    return res.status(200).json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message, stage: "unhandled" });
  }
}
