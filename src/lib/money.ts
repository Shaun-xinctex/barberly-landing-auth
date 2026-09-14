/**
 * Money in this project is a WHOLE-UNIT integer in `platform_settings.currency`
 * (`twd`, `currency_minor_units = 0`). There are no cents anywhere in the database:
 * a NT$1,800 cut is stored as `1800`, never `180000`. So formatting is grouping +
 * a symbol — never a divide by 100.
 *
 * (Stripe is the one place that speaks minor units: `api/bookings/checkout.ts`
 * multiplies when it builds the line item. That conversion lives there, at the
 * boundary, and must not leak back into the app's own numbers.)
 */
const SYMBOL: Record<string, string> = {
  twd: "NT$",
  usd: "US$",
  jpy: "¥",
};

export function formatMoney(amount: number | null | undefined, currency = "twd"): string {
  if (amount === null || amount === undefined) return "—";
  const symbol = SYMBOL[currency.toLowerCase()] ?? `${currency.toUpperCase()} `;
  return `${symbol}${amount.toLocaleString("en-US")}`;
}
