import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";

/**
 * Where Stripe sends the customer back after a successful Checkout.
 *
 * This page is UX ONLY — it polls and never writes. The `/api/stripe/webhook` route is
 * the single source of truth for a booking becoming `paid`: the customer can close the
 * tab the instant they pay (no redirect fires at all), the redirect can be dropped by a
 * flaky network, and anyone can open this URL by hand. If this page marked bookings paid
 * you would get both failure modes at once — paid bookings stuck on `pending_payment`,
 * and unpaid bookings marked `paid`.
 *
 * It polls on `booking_id`, not `session_id`: nothing on the booking maps a Stripe
 * session id back to a booking, so `session_id` alone would give the query no key. The
 * read stays RLS-gated to the owning customer.
 */
export default function BookingSuccess() {
  usePageMeta({
    title: "Payment · Barberly",
    description: "Confirming your booking payment.",
  });

  const [params] = useSearchParams();
  const bookingId = params.get("booking_id");

  const { data, isPending, isError } = useQuery({
    queryKey: ["booking-status", bookingId],
    enabled: Boolean(bookingId),
    // Poll until the webhook lands. Stripe usually delivers within a second or two, but
    // a retry can take longer, so keep polling rather than declaring failure.
    refetchInterval: (query) => (query.state.data?.status === "paid" ? false : 1500),
    queryFn: async (): Promise<{ status: string; price: number }> => {
      const { data: row, error } = await supabase
        .from("bookings")
        .select("status, price")
        .eq("id", bookingId as string)
        .single();

      if (error) throw error;
      return row;
    },
  });

  const status = data?.status;
  const paid = status === "paid";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        {!bookingId ? (
          <>
            <h1 className="text-2xl font-bold">Missing booking reference</h1>
            <p className="mt-3 text-muted-foreground">
              這個網址少了 <code>booking_id</code>，沒辦法查詢付款狀態。到「My
              bookings」看你的預約。
            </p>
          </>
        ) : isError ? (
          <>
            <h1 className="text-2xl font-bold">Could not read this booking</h1>
            <p className="mt-3 text-muted-foreground">
              可能是你已經登出，或這筆預約不屬於這個帳號。付款若已完成，狀態仍會由 webhook 更新。
            </p>
          </>
        ) : paid ? (
          <>
            <h1 className="text-2xl font-bold">預約成功！</h1>
            <p className="mt-3 text-muted-foreground">付款已確認，時段已經幫你鎖定。</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">付款處理中…</h1>
            <p className="mt-3 text-muted-foreground">
              {isPending
                ? "正在讀取這筆預約。"
                : "我們正在等 Stripe 通知這筆付款。這通常只要幾秒，這頁會自動更新，不用重整。"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              就算你現在關掉這頁，付款一樣會被記錄 —— 確認預約的是後端的 webhook，不是這個畫面。
            </p>
          </>
        )}

        <div className="mt-8 flex justify-center gap-3">
          <Button asChild className="rounded-full">
            <Link to="/bookings">My bookings</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/barbers">Browse barbers</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
