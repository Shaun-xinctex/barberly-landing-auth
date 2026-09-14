import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";
import { createBooking, startCheckout, startSlotRuns, type Slot } from "@/lib/bookings";
import { errMessage } from "@/lib/errors";

type Service = Pick<Tables<"services">, "id" | "name" | "category" | "price" | "required_slots">;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  services: Service[];
  slots: Slot[];
  slotMinutes: number;
  currency: string;
};

function dayKey(iso: string): string {
  const date = new Date(iso);
  // Local calendar day — the chips the customer sees are rendered in their own
  // timezone, so the grouping has to use the same clock or a boundary slot would
  // land under the wrong heading.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The booking modal. Service → date → start slot, price shown before Confirm, and the
 * customer never leaves `/barbers/:id`.
 *
 * M2.1 wired the promised seam: Confirm still calls `createBooking()` and then hands the
 * returned booking id to `/api/bookings/checkout`, redirecting to Stripe. The booking is
 * `pending_payment` until the WEBHOOK sees the payment — nothing on this screen decides
 * that, and nothing here gates on `paid` / `paid_at`.
 */
export function BookDialog({
  open,
  onOpenChange,
  barberId,
  services,
  slots,
  slotMinutes,
  currency,
}: Props) {
  const queryClient = useQueryClient();

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [startSlotId, setStartSlotId] = useState<string | null>(null);

  // Start clean every time the modal opens, so a previous attempt's picks don't
  // resurface against a slot list that has since changed.
  useEffect(() => {
    if (!open) return;
    setServiceId(services.length === 1 ? (services[0]?.id ?? null) : null);
    setDay(null);
    setStartSlotId(null);
  }, [open, services]);

  const service = useMemo(
    () => services.find((candidate) => candidate.id === serviceId) ?? null,
    [services, serviceId],
  );

  /** Legal start slots for THIS service: start → the full run of N it consumes. */
  const runs = useMemo(
    () => (service ? startSlotRuns(slots, service.required_slots) : new Map<string, Slot[]>()),
    [slots, service],
  );

  const days = useMemo(() => {
    const seen = new Map<string, string>();
    for (const slot of slots) {
      const key = dayKey(slot.starts_at);
      if (!seen.has(key)) seen.set(key, slot.starts_at);
    }
    return [...seen.entries()];
  }, [slots]);

  const daySlots = useMemo(
    () => (day ? slots.filter((slot) => dayKey(slot.starts_at) === day) : []),
    [slots, day],
  );

  const chosenRun = startSlotId ? (runs.get(startSlotId) ?? null) : null;
  const heldIds = useMemo(() => new Set((chosenRun ?? []).map((slot) => slot.id)), [chosenRun]);

  const book = useMutation({
    mutationFn: async () => {
      if (!service || !startSlotId) throw new Error("pick a service and a start time first");
      // Unchanged from M1.2: ONE transaction creates the pending_payment booking plus
      // its N booking_slots rows and snapshots the price. The slots are held from this
      // moment — holding is not tied to payment. Only "confirmed" is.
      const bookingId = await createBooking(service.id, startSlotId);
      // M2.1: hand that booking to Stripe. The route reads the price SNAPSHOT
      // server-side, so nothing about the amount travels through the browser.
      return startCheckout(bookingId);
    },
    onSuccess: async (checkoutUrl) => {
      // Invalidate BEFORE leaving: the N slots are already held by the pending booking,
      // so if the customer abandons Stripe and comes back, the availability list must
      // already reflect that rather than offering a slot that will now fail.
      await queryClient.invalidateQueries({ queryKey: ["available-slots", barberId] });
      await queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      onOpenChange(false);
      // A full navigation, not a router push — checkout.stripe.com is Stripe's own
      // hosted page, not a route in this app.
      window.location.assign(checkoutUrl);
    },
    onError: (err) => {
      // A PostgrestError is a plain object, so `instanceof Error` would swallow the
      // real message create_booking raised ("…just taken", "…has a gap").
      toast.error("Could not start the payment", {
        description: errMessage(err, "Something went wrong — please try again."),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book a slot</DialogTitle>
          <DialogDescription>
            選擇服務、日期與開始時段。按下 Confirm 會轉到 Stripe 完成付款。
          </DialogDescription>
        </DialogHeader>

        {/* 1 — service first: it fixes both the price and how many slots get held. */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            1 · Service
          </p>
          <div className="grid gap-2">
            {services.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  setServiceId(candidate.id);
                  setStartSlotId(null);
                }}
                aria-pressed={candidate.id === serviceId}
                className={[
                  "flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                  candidate.id === serviceId
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-secondary",
                ].join(" ")}
              >
                <span className="font-semibold">{candidate.name}</span>
                <span className="text-muted-foreground">
                  {candidate.required_slots * slotMinutes} min
                </span>
                <span className="ml-auto font-bold">
                  {currency} {candidate.price}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 2 — date */}
        {service ? (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              2 · Date
            </p>
            <div className="flex flex-wrap gap-2">
              {days.map(([key, sample]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDay(key);
                    setStartSlotId(null);
                  }}
                  aria-pressed={key === day}
                  className={[
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    key === day
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  ].join(" ")}
                >
                  {dayLabel(sample)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* 3 — start slot. Every free slot of the day is rendered; the ones that cannot
            START this service are dimmed AND labelled, because a silently greyed-out
            chip reads as "unavailable" when in fact it is bookable from an earlier
            start — that contradiction is what confuses people. */}
        {service && day ? (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              3 · Start time
            </p>
            <div className="flex flex-wrap gap-2">
              {daySlots.map((slot) => {
                const legal = runs.has(slot.id);
                const held = heldIds.has(slot.id);
                const isStart = slot.id === startSlotId;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!legal}
                    title={
                      legal
                        ? undefined
                        : `無法從這裡開始（後面不足 ${service.required_slots} 個連續時段）`
                    }
                    onClick={() => setStartSlotId(slot.id)}
                    aria-pressed={isStart}
                    className={[
                      "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      // `held` wins over `!legal`: the LAST slot of a 3-slot run is
                      // usually not a legal START itself, and showing it dimmed while
                      // the summary says the booking runs through it is exactly the
                      // contradiction this dialog is supposed to avoid. A held slot
                      // always reads as part of your booking; it just stays unclickable.
                      held
                        ? "border-primary bg-primary/10"
                        : legal
                          ? "border-border hover:bg-secondary"
                          : "cursor-not-allowed border-dashed border-border text-muted-foreground/50",
                      isStart ? "ring-2 ring-primary ring-offset-1" : "",
                    ].join(" ")}
                  >
                    {time(slot.starts_at)}
                  </button>
                );
              })}
            </div>

            {daySlots.some((slot) => !runs.has(slot.id)) ? (
              <p className="text-xs text-muted-foreground">
                虛線的時段無法作為<strong>開始</strong>時間（後面湊不滿 {service.required_slots}{" "}
                個連續時段），但從更早的時段開始時它仍可能被佔用。
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The whole run, spelled out — otherwise a customer picking a 90-minute perm
            only sees one chip highlighted and never learns it eats three. */}
        {service && chosenRun && chosenRun[0] ? (
          <div className="rounded-xl bg-secondary px-4 py-3 text-sm">
            <p className="font-semibold">
              你的預約：{time(chosenRun[0].starts_at)}–
              {time(chosenRun[chosenRun.length - 1]?.ends_at ?? chosenRun[0].ends_at)}
              {service.required_slots > 1 ? `（連佔 ${service.required_slots} 個時段）` : null}
            </p>
            <p className="mt-1 text-muted-foreground">
              {service.name} · {currency} {service.price}
              {service.required_slots > 1
                ? ` · 此服務會連續佔用 ${service.required_slots} 個時段`
                : null}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={book.isPending}
          >
            Cancel
          </Button>
          <Button
            className="rounded-full"
            onClick={() => book.mutate()}
            disabled={!service || !startSlotId || book.isPending}
          >
            {book.isPending ? "Redirecting…" : "Confirm & pay"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
