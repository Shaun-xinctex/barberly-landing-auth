import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/integrations/supabase/types.js";

/**
 * Server-side Supabase client for the Vercel serverless functions.
 *
 * Stripe is not a logged-in user — the webhook carries no session — so these
 * functions talk to Supabase as a trusted server with the SERVICE-ROLE key and
 * write past RLS. That key is server-only: it is read from `SUPABASE_SECRET_KEY`
 * (never `VITE_`-prefixed, which Vite would inline into the browser bundle and
 * leak a full-database key).
 *
 * `SUPABASE_URL` must be a Vercel env var in its own right. The browser bundle
 * gets its URL from the committed `.env` at BUILD time via `VITE_SUPABASE_URL`,
 * but a serverless function only ever sees Vercel's configured env at RUNTIME —
 * a committed `.env` is not loaded for it. `VITE_SUPABASE_URL` is accepted as a
 * fallback for the case where it happens to be configured in Vercel too.
 */
const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
const SUPABASE_SECRET_KEY = process.env["SUPABASE_SECRET_KEY"];

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ["SUPABASE_URL (or VITE_SUPABASE_URL)"] : []),
    ...(!SUPABASE_SECRET_KEY ? ["SUPABASE_SECRET_KEY"] : []),
  ];
  throw new Error(
    `Missing server Supabase environment variable(s): ${missing.join(", ")}. ` +
      `Set them in the Vercel project's Environment Variables (Production scope) ` +
      `and redeploy — serverless functions do not read the repo's .env file.`,
  );
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * New-format Supabase keys (`sb_secret_…`) are opaque strings, NOT bearer JWTs.
 * supabase-js still sends them as `Authorization: Bearer <key>`, which the API
 * rejects, so strip that header and pass the key as `apikey` instead. This is the
 * same shim the browser client uses for `sb_publishable_…`.
 */
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  global: { fetch: createSupabaseFetch(SUPABASE_SECRET_KEY) },
  // A serverless function has no browser storage and no user to keep signed in.
  auth: { persistSession: false, autoRefreshToken: false },
});
