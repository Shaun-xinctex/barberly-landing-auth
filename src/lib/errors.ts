/**
 * Supabase returns a `PostgrestError` — a PLAIN OBJECT `{message, details, hint, code}`,
 * NOT an instance of `Error`. So the reflex `err instanceof Error ? err.message : "..."`
 * always falls through to the generic branch for a failed query or RPC, swallowing the
 * exact message the database raised ("one or more of those time slots were just taken",
 * "…the barber has a gap", …) and leaving you to debug blind.
 *
 * Read `.message` off the PostgrestError shape first, then fall back.
 */
type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** The most specific message we can get out of `err`, or `fallback`. */
export function errMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") {
    return firstNonEmptyString(err) ?? fallback;
  }
  if (err && typeof err === "object") {
    const { message, details, hint } = err as ErrorLike;
    return firstNonEmptyString(message, details, hint) ?? fallback;
  }
  return fallback;
}
