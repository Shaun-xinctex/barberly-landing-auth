import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";
import { errMessage } from "@/lib/errors";

type BookingRow = {
  id: string;
  status: string;
  price: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  services: {
    name: string;
    category: string;
    barbers: { id: string; name: string } | null;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pending payment",
  paid: "Paid",
  cancelled: "Cancelled",
};

/**
 * The signed-in customer's own bookings.
 *
 * Reads the `bookings_with_start` VIEW, not the table, because there is no
 * `start_slot_id` column — the start time is `MIN(starts_at)` over the booking's
 * `booking_slots`, which the view derives. The view is `security_invoker`, so the
 * bookings RLS still applies through it: this returns only `auth.uid()`'s rows, and
 * that isolation is the database's job, not a front-end filter.
 *
 * `bookings` has no `barber_id` either, so the barber comes through the service.
 */
function useMyBookings() {
  return useQuery({
    queryKey: ["my-bookings"],
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from("bookings_with_start")
        .select("id, status, price, starts_at, ends_at, created_at, services(name, category, barbers(id, name))")
        .order("starts_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as BookingRow[];
    },
  });
}

function formatRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "—";
  const start = new Date(startsAt);
  const date = start.toLocaleDateString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = (value: string) =>
    new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return endsAt ? `${date} · ${time(startsAt)}–${time(endsAt)}` : `${date} · ${time(startsAt)}`;
}

export default function MyBookings() {
  usePageMeta({
    title: "My bookings · Barberly",
    description: "The appointments you have booked.",
  });

  const queryClient = useQueryClient();
  const { data: bookings, isPending, isError, error } = useMyBookings();

  const cancel = useMutation({
    mutationFn: async (bookingId: string) => {
      // Only flip the status. The trg_free_slots_on_cancel trigger DELETEs this
      // booking's booking_slots rows, which is what frees the slots — deleting them
      // from the client would duplicate the trigger and bypass its ordering.
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId);
      if (updateError) throw updateError;
    },
    onSuccess: async () => {
      toast.success("Booking cancelled", { description: "那些時段已經釋出，別人可以再預約。" });
      await queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onError: (err) => {
      toast.error("Could not cancel", {
        description: errMessage(err, "Something went wrong — please try again."),
      });
    },
  });

  return (
    <main className="min-h-screen bg-warm">
      <SiteHeader />

      <section className="mx-auto max-w-4xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
          My bookings
        </h1>
        <p className="mt-2 text-muted-foreground">你自己的預約 —— 別人看不到，也看不到別人的。</p>

        <div className="mt-8">
          {isPending ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1].map((key) => (
                <div key={key} className="h-28 animate-pulse rounded-2xl bg-secondary" />
              ))}
            </div>
          ) : isError ? (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
              Couldn’t load your bookings: {errMessage(error, "unknown error")}
            </p>
          ) : bookings.length === 0 ? (
            <div className="rounded-2xl border border-border bg-background p-10 text-center">
              <p className="text-muted-foreground">你還沒有任何預約。</p>
              <Button asChild className="mt-6 rounded-full">
                <Link to="/barbers">Find a barber</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {bookings.map((booking) => {
                const barber = booking.services?.barbers ?? null;
                const cancelled = booking.status === "cancelled";

                return (
                  <li
                    key={booking.id}
                    className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-background p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {barber ? (
                          <Link
                            to={`/barbers/${barber.id}`}
                            className="font-display text-xl font-semibold hover:underline"
                          >
                            {barber.name}
                          </Link>
                        ) : (
                          <span className="font-display text-xl font-semibold">Barber</span>
                        )}
                        <span
                          className={[
                            "rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide",
                            cancelled
                              ? "bg-muted text-muted-foreground"
                              : "bg-secondary text-secondary-foreground",
                          ].join(" ")}
                        >
                          {STATUS_LABEL[booking.status] ?? booking.status}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.services?.name ?? "Service"}
                        {booking.services?.category ? ` · ${booking.services.category}` : null}
                      </p>
                      <p className="mt-2 text-sm">{formatRange(booking.starts_at, booking.ends_at)}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="font-bold">{booking.price}</span>
                      {cancelled ? null : (
                        <Button
                          variant="outline"
                          className="rounded-full bg-background shadow-none"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate(booking.id)}
                        >
                          {cancel.isPending ? "Cancelling…" : "Cancel"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
