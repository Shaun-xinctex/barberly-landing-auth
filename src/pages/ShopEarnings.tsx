import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ShopHeader } from "@/components/shop-header";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";
import { useAuthedUser } from "@/lib/authed-user-context";
import { errMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { PAYOUT_STATUS_LABEL, useOwedBookings } from "@/lib/payouts";

/**
 * `/shop/earnings` — the shop's READ-ONLY mirror of the settlement data.
 *
 * Two groups, both derived from `bookings.payout_id`, never from a booking status:
 *   尚未撥款 / Owed — `paid` bookings with `payout_id IS NULL` (from `owed_bookings`)
 *   已納入撥款 / In a payout — `paid` bookings with `payout_id` set, grouped by batch
 *
 * A shop can never build, mark or cancel a payout — those are admin-guarded RPCs, and
 * RLS lets a shop read only its own rows. A CANCELLED payout's bookings are not shown
 * here at all: cancelling nulls their `payout_id`, so they are back under Owed.
 *
 * The isolation comes from the database: `owed_bookings` is `security_invoker`, so it
 * inherits `bookings_select_shop_owner` (the shop sees bookings whose service belongs
 * to one of its barbers), and `payouts` is admin-or-owner readable.
 */

type PayoutSummary = {
  id: string;
  status: string;
  created_at: string | null;
  marked_transferred_at: string | null;
  shop_cut: number;
  gross: number;
  platform_cut: number;
  bookings_count: number;
};

type SettledBooking = {
  id: string;
  price: number;
  paid_at: string | null;
  payout: PayoutSummary | null;
  barber_name: string | null;
  service_name: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The shop's paid bookings that are already in a payout batch. */
function useSettledBookings(shopId: string) {
  return useQuery({
    queryKey: ["shop-earnings", shopId],
    queryFn: async (): Promise<SettledBooking[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, price, paid_at, payout_id, services(name, barbers(name, shop_id)), payouts(id, status, created_at, marked_transferred_at, shop_cut, gross, platform_cut, bookings_count)",
        )
        .eq("status", "paid")
        .not("payout_id", "is", null)
        .order("paid_at", { ascending: false, nullsFirst: false });

      if (error) throw error;

      type Row = {
        id: string;
        price: number;
        paid_at: string | null;
        services?:
          | {
              name: string;
              barbers?:
                { name: string; shop_id: string } | { name: string; shop_id: string }[] | null;
            }
          | { name: string; barbers?: unknown }[]
          | null;
        payouts?: PayoutSummary | PayoutSummary[] | null;
      };

      return (data as unknown as Row[])
        .map((row) => {
          const service = one(row.services) as { name: string; barbers?: unknown } | null;
          const barber = one(service?.barbers as { name: string; shop_id: string } | null);
          return {
            id: row.id,
            price: row.price,
            paid_at: row.paid_at,
            payout: one(row.payouts),
            barber_name: barber?.name ?? null,
            service_name: service?.name ?? null,
            shop_id: barber?.shop_id ?? null,
          };
        })
        .filter((row) => !row.shop_id || row.shop_id === shopId)
        .map(({ shop_id: _shopId, ...row }) => row);
    },
  });
}

export default function ShopEarnings() {
  usePageMeta({
    title: "Earnings · Barberly",
    description: "你的收入：尚未撥款與已納入撥款的預約。",
  });

  const user = useAuthedUser();
  const owed = useOwedBookings(user.id);
  const settled = useSettledBookings(user.id);

  const owedRows = useMemo(() => owed.data ?? [], [owed.data]);
  const owedTotals = useMemo(
    () =>
      owedRows.reduce(
        (acc, row) => ({
          gross: acc.gross + (row.price ?? 0),
          platform: acc.platform + (row.platform_cut ?? 0),
          shop: acc.shop + (row.shop_cut ?? 0),
          count: acc.count + 1,
        }),
        { gross: 0, platform: 0, shop: 0, count: 0 },
      ),
    [owedRows],
  );

  /** Group the settled bookings by their payout batch (one card per batch). */
  const batches = useMemo(() => {
    const map = new Map<string, { payout: PayoutSummary; bookings: SettledBooking[] }>();
    for (const booking of settled.data ?? []) {
      if (!booking.payout) continue;
      const entry = map.get(booking.payout.id);
      if (entry) entry.bookings.push(booking);
      else map.set(booking.payout.id, { payout: booking.payout, bookings: [booking] });
    }
    return [...map.values()].sort((a, b) =>
      (b.payout.created_at ?? "").localeCompare(a.payout.created_at ?? ""),
    );
  }, [settled.data]);

  const transferredTotal = batches
    .filter((batch) => batch.payout.status === "transferred")
    .reduce((sum, batch) => sum + batch.payout.shop_cut, 0);
  const pendingTotal = batches
    .filter((batch) => batch.payout.status === "pending_transfer")
    .reduce((sum, batch) => sum + batch.payout.shop_cut, 0);

  return (
    <main className="min-h-screen bg-warm">
      <ShopHeader />

      <section className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Earnings</h1>
        <p className="mt-2 text-muted-foreground">
          你旗下所有理髮師的收入合計。平台會分批結算並撥款給你 / We settle and pay out your earnings
          in batches.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-5">
            <p className="text-sm text-muted-foreground">尚未撥款 / Owed to you</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {formatMoney(owedTotals.shop)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{owedTotals.count} 筆預約</p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5">
            <p className="text-sm text-muted-foreground">待轉帳 / In a pending payout</p>
            <p className="mt-1 font-display text-3xl font-semibold">{formatMoney(pendingTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5">
            <p className="text-sm text-muted-foreground">已轉帳 / Transferred</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {formatMoney(transferredTotal)}
            </p>
          </div>
        </div>

        {/* ---------------- Owed ---------------- */}
        <h2 className="mt-10 font-display text-2xl font-semibold">尚未撥款 / Owed</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          已經收到款、但還沒被平台納入任何撥款批次的預約。總額 {formatMoney(owedTotals.gross)} ·
          平台抽成 {formatMoney(owedTotals.platform)} · 你的收入{" "}
          <span className="font-semibold text-foreground">{formatMoney(owedTotals.shop)}</span>
        </p>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-background">
          {owed.isPending ? (
            <div className="h-28 animate-pulse bg-secondary" aria-busy="true" />
          ) : owed.isError ? (
            <p className="p-5 text-sm text-destructive">
              Couldn’t load your earnings: {errMessage(owed.error, "unknown error")}
            </p>
          ) : owedRows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">目前沒有尚未撥款的預約。</p>
          ) : (
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-semibold">理髮師 / Barber</th>
                  <th className="p-3 font-semibold">付款日 / Paid</th>
                  <th className="p-3 text-right font-semibold">金額</th>
                  <th className="p-3 text-right font-semibold">平台抽成</th>
                  <th className="p-3 text-right font-semibold">你的收入</th>
                </tr>
              </thead>
              <tbody>
                {owedRows.map((row) => (
                  <tr
                    key={row.booking_id ?? ""}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="p-3">{row.barber_name ?? "—"}</td>
                    <td className="p-3">{formatDate(row.paid_at)}</td>
                    <td className="p-3 text-right">{formatMoney(row.price)}</td>
                    <td className="p-3 text-right text-muted-foreground">
                      {formatMoney(row.platform_cut)}
                    </td>
                    <td className="p-3 text-right font-semibold">{formatMoney(row.shop_cut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ---------------- In a payout ---------------- */}
        <h2 className="mt-10 font-display text-2xl font-semibold">已納入撥款 / In a payout</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          一批 = 一次銀行轉帳。批次被取消的話，裡面的預約會自動回到上面的「尚未撥款」。
        </p>

        <div className="mt-4 space-y-4">
          {settled.isPending ? (
            <div className="h-28 animate-pulse rounded-2xl bg-secondary" aria-busy="true" />
          ) : settled.isError ? (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
              Couldn’t load your payouts: {errMessage(settled.error, "unknown error")}
            </p>
          ) : batches.length === 0 ? (
            <p className="rounded-2xl border border-border bg-background p-8 text-center text-muted-foreground">
              還沒有任何撥款批次。
            </p>
          ) : (
            batches.map(({ payout, bookings }) => (
              <div key={payout.id} className="rounded-2xl border border-border bg-background p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[0.7rem] font-bold",
                      payout.status === "transferred"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground",
                    ].join(" ")}
                  >
                    {PAYOUT_STATUS_LABEL[payout.status] ?? payout.status}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    建立於 {formatDate(payout.created_at)}
                    {payout.status === "transferred"
                      ? ` · 轉帳於 ${formatDate(payout.marked_transferred_at)}`
                      : ""}
                  </span>
                  <span className="ml-auto font-display text-2xl font-semibold">
                    {formatMoney(payout.shop_cut)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {payout.bookings_count} 筆 · 總額 {formatMoney(payout.gross)} · 平台抽成{" "}
                  {formatMoney(payout.platform_cut)}
                </p>

                <ul className="mt-3 space-y-1 text-sm">
                  {bookings.map((booking) => (
                    <li key={booking.id} className="flex flex-wrap gap-2 text-muted-foreground">
                      <span>{formatDate(booking.paid_at)}</span>
                      <span>·</span>
                      <span>{booking.barber_name ?? "—"}</span>
                      <span>·</span>
                      <span>{booking.service_name ?? "—"}</span>
                      <span className="ml-auto text-foreground">{formatMoney(booking.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
