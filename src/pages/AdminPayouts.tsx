import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePageMeta } from "@/hooks/use-page-meta";
import { errMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import {
  PAYOUT_STATUS_LABEL,
  buildPayout,
  cancelPayout,
  markPayoutTransferred,
  useOwedBookings,
  usePayouts,
  useProfileEmails,
  type OwedBooking,
} from "@/lib/payouts";

/**
 * `/admin/payouts` — the commission-settlement workbench (admin only).
 *
 * Part 1 is the LIVE owed pool: every `paid` booking whose `payout_id IS NULL`, read
 * from the `owed_bookings` VIEW with its split already derived from `commission_rates`.
 * The admin filters it, checks the bookings to settle, and builds a payout batch.
 *
 * Part 2 is the ledger of batches already built, with the two row actions that move a
 * batch through its life: mark-transferred (after the admin makes the bank transfer in
 * their own online banking — the app never moves money) and cancel (only before the
 * transfer; its bookings fall back into the owed pool).
 *
 * The owed list is live, so it needs no manual bookkeeping: a built payout's bookings
 * disappear from it, and a cancelled payout's bookings reappear.
 */

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `YYYY-MM-DD` in LOCAL time — `toISOString()` would shift the day in UTC+8. */
function localDay(value: string): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function statusClass(status: string): string {
  if (status === "transferred") return "bg-primary text-primary-foreground";
  if (status === "cancelled") return "bg-muted text-muted-foreground";
  return "bg-secondary text-secondary-foreground";
}

export default function AdminPayouts() {
  usePageMeta({
    title: "Payouts · Barberly",
    description: "抽成撥款：欠款池、建立撥款批次、標記已轉帳。",
  });

  const queryClient = useQueryClient();
  const owed = useOwedBookings();
  const payouts = usePayouts();

  const rows = useMemo(() => owed.data ?? [], [owed.data]);
  const emails = useProfileEmails(
    rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)),
  );

  const [shopFilter, setShopFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [bankRefs, setBankRefs] = useState<Record<string, string>>({});
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const shops = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.shop_id) map.set(row.shop_id, row.shop_name ?? "(unnamed shop)");
    }
    return [...map.entries()];
  }, [rows]);

  const visible = useMemo(() => {
    const needle = customerFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (shopFilter && row.shop_id !== shopFilter) return false;
      if (needle) {
        const email = (row.customer_id ? emails.data?.[row.customer_id] : "") ?? "";
        if (!email.toLowerCase().includes(needle)) return false;
      }
      if (row.paid_at) {
        const day = localDay(row.paid_at);
        if (fromFilter && day < fromFilter) return false;
        if (toFilter && day > toFilter) return false;
      }
      return true;
    });
  }, [rows, shopFilter, customerFilter, fromFilter, toFilter, emails.data]);

  const selectedRows = useMemo(
    () => rows.filter((row) => row.booking_id && selected.includes(row.booking_id)),
    [rows, selected],
  );

  /**
   * A payout pays ONE shop (one bank transfer, one status), so once a row is checked
   * every other shop's rows are locked. The `build_payout` RPC rejects a mixed-shop
   * selection anyway — this just stops the admin from assembling one by hand.
   */
  const lockedShopId = selectedRows[0]?.shop_id ?? null;

  const totals = useMemo(
    () =>
      selectedRows.reduce(
        (acc, row) => ({
          gross: acc.gross + (row.price ?? 0),
          platform: acc.platform + (row.platform_cut ?? 0),
          shop: acc.shop + (row.shop_cut ?? 0),
        }),
        { gross: 0, platform: 0, shop: 0 },
      ),
    [selectedRows],
  );

  function toggle(row: OwedBooking, checked: boolean) {
    const id = row.booking_id;
    if (!id) return;
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((value) => value !== id)));
  }

  /** UI shortcut only — it pre-checks rows the admin can still add to or remove from. */
  function selectShopThisMonth() {
    if (!shopFilter) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ids = rows
      .filter(
        (row) =>
          row.shop_id === shopFilter && row.paid_at && localDay(row.paid_at).startsWith(month),
      )
      .map((row) => row.booking_id)
      .filter((id): id is string => Boolean(id));
    setSelected(ids);
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["owed-bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["payouts"] }),
      queryClient.invalidateQueries({ queryKey: ["shop-earnings"] }),
    ]);
  }

  const build = useMutation({
    mutationFn: () => buildPayout(selected, note),
    onSuccess: async () => {
      toast.success("撥款批次已建立 / Payout built", {
        description: "這些預約已離開欠款池，等你轉帳後再標記為已轉帳。",
      });
      setSelected([]);
      setNote("");
      await refresh();
    },
    onError: (err) => {
      toast.error("無法建立撥款 / Could not build payout", {
        description: errMessage(err, "Something went wrong — please try again."),
      });
    },
  });

  const markTransferred = useMutation({
    mutationFn: (payoutId: string) => markPayoutTransferred(payoutId, bankRefs[payoutId]),
    onSuccess: async () => {
      toast.success("已標記為已轉帳 / Marked as transferred");
      await refresh();
    },
    onError: (err) => {
      toast.error("無法標記 / Could not mark transferred", {
        description: errMessage(err, "Something went wrong — please try again."),
      });
    },
  });

  const cancel = useMutation({
    mutationFn: (payoutId: string) => cancelPayout(payoutId),
    onSuccess: async () => {
      toast.success("撥款已取消 / Payout cancelled", {
        description: "這批預約的 payout_id 已清空，退回欠款池。",
      });
      setConfirmCancel(null);
      await refresh();
    },
    onError: (err) => {
      toast.error("無法取消 / Could not cancel", {
        description: errMessage(err, "Something went wrong — please try again."),
      });
    },
  });

  return (
    <main className="min-h-screen bg-warm">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Payouts</h1>
        <p className="mt-2 text-muted-foreground">
          抽成撥款 ——
          勾選某一間店家還沒撥款的預約，建立撥款批次，轉帳後回來標記。平台不經手金流，轉帳在你自己的網路銀行完成。
        </p>

        {/* ---------------- Part 1 — the live owed pool ---------------- */}
        <h2 className="mt-10 font-display text-2xl font-semibold">
          欠款池 / Owed bookings
          <span className="ml-2 text-base font-normal text-muted-foreground">
            已付款但還沒納入任何撥款批次
          </span>
        </h2>

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-background p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">店家 / Shop</span>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={shopFilter}
              onChange={(event) => setShopFilter(event.target.value)}
            >
              <option value="">全部 / All</option>
              {shops.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">顧客 / Customer</span>
            <Input
              className="h-10 w-56"
              placeholder="email…"
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">付款日自 / Paid from</span>
            <Input
              type="date"
              className="h-10 w-44"
              value={fromFilter}
              onChange={(event) => setFromFilter(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">至 / to</span>
            <Input
              type="date"
              className="h-10 w-44"
              value={toFilter}
              onChange={(event) => setToFilter(event.target.value)}
            />
          </label>

          <Button
            variant="outline"
            className="h-10 rounded-full bg-background shadow-none"
            disabled={!shopFilter}
            onClick={selectShopThisMonth}
          >
            全選此店本月欠款
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-background">
          {owed.isPending ? (
            <div className="h-32 animate-pulse bg-secondary" aria-busy="true" />
          ) : owed.isError ? (
            <p className="p-5 text-sm text-destructive">
              Couldn’t load the owed pool: {errMessage(owed.error, "unknown error")}
            </p>
          ) : visible.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              沒有符合條件的欠款預約。（撥款後它們就會從這裡消失；取消撥款會再回來。）
            </p>
          ) : (
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="w-10 p-3" />
                  <th className="p-3 font-semibold">店家 / Shop</th>
                  <th className="p-3 font-semibold">理髮師 / Barber</th>
                  <th className="p-3 font-semibold">顧客 / Customer</th>
                  <th className="p-3 font-semibold">付款日 / Paid</th>
                  <th className="p-3 text-right font-semibold">金額 / Price</th>
                  <th className="p-3 text-right font-semibold">平台抽成</th>
                  <th className="p-3 text-right font-semibold">店家可得</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const id = row.booking_id ?? "";
                  const checked = selected.includes(id);
                  const locked = Boolean(lockedShopId) && row.shop_id !== lockedShopId;
                  return (
                    <tr key={id} className="border-b border-border/60 last:border-0">
                      <td className="p-3">
                        <Checkbox
                          checked={checked}
                          disabled={locked}
                          aria-label={`Select booking ${id}`}
                          onCheckedChange={(value) => toggle(row, value === true)}
                        />
                      </td>
                      <td className="p-3 font-semibold">{row.shop_name ?? "—"}</td>
                      <td className="p-3">{row.barber_name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {(row.customer_id ? emails.data?.[row.customer_id] : null) ?? "—"}
                      </td>
                      <td className="p-3">{formatDate(row.paid_at)}</td>
                      <td className="p-3 text-right">{formatMoney(row.price)}</td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatMoney(row.platform_cut)}
                      </td>
                      <td className="p-3 text-right font-semibold">{formatMoney(row.shop_cut)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-background p-5">
          <div className="text-sm">
            <p className="font-semibold">
              已勾選 {selectedRows.length} 筆
              {lockedShopId ? ` · ${selectedRows[0]?.shop_name ?? ""}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              總額 {formatMoney(totals.gross)} · 平台抽成 {formatMoney(totals.platform)} ·{" "}
              <span className="font-semibold text-foreground">
                撥給店家 {formatMoney(totals.shop)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">備註 / Note（選填）</span>
              <Input
                className="h-10 w-64"
                placeholder="例如：九月上半月"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <Button
              className="h-10 rounded-full"
              disabled={selectedRows.length === 0 || build.isPending}
              onClick={() => build.mutate()}
            >
              {build.isPending ? "建立中…" : "建立撥款 / Build payout"}
            </Button>
          </div>
        </div>

        {/* ---------------- Part 2 — the payouts ledger ---------------- */}
        <h2 className="mt-12 font-display text-2xl font-semibold">
          撥款批次 / Payouts
          <span className="ml-2 text-base font-normal text-muted-foreground">
            一批 = 一間店家 = 一次銀行轉帳
          </span>
        </h2>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-background">
          {payouts.isPending ? (
            <div className="h-32 animate-pulse bg-secondary" aria-busy="true" />
          ) : payouts.isError ? (
            <p className="p-5 text-sm text-destructive">
              Couldn’t load payouts: {errMessage(payouts.error, "unknown error")}
            </p>
          ) : (payouts.data ?? []).length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">還沒有任何撥款批次。</p>
          ) : (
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-semibold">店家 / Shop</th>
                  <th className="p-3 font-semibold">建立 / Created</th>
                  <th className="p-3 text-right font-semibold">筆數</th>
                  <th className="p-3 text-right font-semibold">總額</th>
                  <th className="p-3 text-right font-semibold">平台抽成</th>
                  <th className="p-3 text-right font-semibold">撥給店家</th>
                  <th className="p-3 font-semibold">銀行帳戶 / Bank</th>
                  <th className="p-3 font-semibold">狀態 / Status</th>
                  <th className="p-3 font-semibold">動作 / Actions</th>
                </tr>
              </thead>
              <tbody>
                {(payouts.data ?? []).map((payout) => {
                  const pending = payout.status === "pending_transfer";
                  return (
                    <tr
                      key={payout.id}
                      className="border-b border-border/60 align-top last:border-0"
                    >
                      <td className="p-3 font-semibold">{payout.shop_name ?? "—"}</td>
                      <td className="p-3">{formatDate(payout.created_at)}</td>
                      <td className="p-3 text-right">{payout.bookings_count}</td>
                      <td className="p-3 text-right">{formatMoney(payout.gross)}</td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatMoney(payout.platform_cut)}
                        <span className="ml-1 text-xs">
                          ({Math.round(Number(payout.platform_pct) * 100)}%)
                        </span>
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {formatMoney(payout.shop_cut)}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        <div>{payout.bank_account_name ?? "—"}</div>
                        <div>{payout.bank_account_number ?? "—"}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={[
                            "rounded-full px-2.5 py-1 text-[0.7rem] font-bold",
                            statusClass(payout.status),
                          ].join(" ")}
                        >
                          {PAYOUT_STATUS_LABEL[payout.status] ?? payout.status}
                        </span>
                        {payout.status === "transferred" ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(payout.marked_transferred_at)}
                            {payout.bank_reference ? ` · ${payout.bank_reference}` : ""}
                          </div>
                        ) : null}
                        {payout.note ? (
                          <div className="mt-1 text-xs text-muted-foreground">{payout.note}</div>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {pending ? (
                          <div className="flex flex-col gap-2">
                            <Input
                              className="h-9 w-44"
                              placeholder="轉帳備註 / ref（選填）"
                              value={bankRefs[payout.id] ?? ""}
                              onChange={(event) =>
                                setBankRefs((prev) => ({
                                  ...prev,
                                  [payout.id]: event.target.value,
                                }))
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                className="h-9 rounded-full"
                                disabled={markTransferred.isPending}
                                onClick={() => markTransferred.mutate(payout.id)}
                              >
                                標記為已轉帳
                              </Button>
                              <Button
                                variant="outline"
                                className="h-9 rounded-full bg-background shadow-none"
                                disabled={cancel.isPending}
                                onClick={() =>
                                  confirmCancel === payout.id
                                    ? cancel.mutate(payout.id)
                                    : setConfirmCancel(payout.id)
                                }
                              >
                                {confirmCancel === payout.id ? "再按一次確認取消" : "取消"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {payout.status === "transferred"
                              ? "已轉帳，不可再更動"
                              : "已取消（預約已退回欠款池）"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
