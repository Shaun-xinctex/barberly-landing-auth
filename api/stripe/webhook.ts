import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

// `.js` ESM extension — see the note in api/bookings/checkout.ts.
import { supabaseAdmin } from "../_supabaseAdmin.js";

/**
 * REQUIRED. A Vercel Node function auto-parses the request body, and any parse
 * re-serializes it (key order, whitespace, number formatting) — which breaks the
 * HMAC and makes every event fail signature verification with a 400.
 */
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"] ?? "");

// NOTE: no commission rate here. The webhook does NOT compute a split. The rate lives
// in the commission_rates table and the split is computed at payout-build time (M2.2).

/** Buffer the raw request stream. App Router's `await req.text()` does not exist here. */
async function rawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const buf = await rawBody(req); // RAW bytes — never req.body, never a JSON parse first
  const signature = req.headers["stripe-signature"];

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      signature as string,
      process.env["STRIPE_WEBHOOK_SECRET"] ?? "",
    );
  } catch {
    return res.status(400).json({ error: "signature verification failed" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true }); // ack unrelated events with 200
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return res.status(200).json({ received: true }); // only a genuinely paid session acts
  }

  const bookingId = session.metadata?.["booking_id"];
  if (!bookingId) {
    // metadata is written by our own authenticated server at session creation, so a
    // missing key is OUR bug — never something the customer did.
    return res.status(400).json({ error: "missing booking_id metadata" });
  }

  // FIRST TO PAY WINS. Flip the BOOKING pending_payment -> paid exactly once and stamp
  // paid_at. That is the whole job: NO split is computed, NO ledger row is written
  // (there is no transactions table), and payout_id is never touched — "money in" is
  // simply this paid booking's price snapshot. M2.2 computes the platform/shop split at
  // payout-build time from the picked paid bookings x commission_rates.
  //
  // There is NO slot status to mirror — slots have no status. The booking already holds
  // its N slots via booking_slots (UNIQUE(slot_id) allows one live booking per slot) and
  // the browse anti-join stopped offering them the moment the pending booking existed.
  //
  // IDEMPOTENCY: Stripe retries any non-2xx. The .eq("status", "pending_payment") guard
  // is the source of truth — a re-delivered event matches ZERO rows and no-ops, so
  // paid_at is never re-stamped. The UNIQUE index on stripe_payment_intent_id is the
  // hard backstop for a concurrent double-fire that races past the status check.
  const { error } = await supabaseAdmin
    .from("bookings")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
    })
    .eq("id", bookingId)
    .eq("status", "pending_payment");

  if (error) {
    // A non-2xx tells Stripe to retry, which is what we want for a transient DB failure.
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ received: true });
}
