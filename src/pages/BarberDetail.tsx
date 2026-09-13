import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, MapPin, Scissors } from "lucide-react";

import { BookDialog } from "@/components/book-dialog";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { startSlotRuns, useAvailableSlots, type Slot } from "@/lib/bookings";
import { publicPhotoUrl, sortPhotos } from "@/lib/photos";
import { useOptionalUser } from "@/lib/session";

type Service = Pick<
  Tables<"services">,
  "id" | "name" | "category" | "price" | "required_slots"
>;
type Photo = Pick<Tables<"barber_photos">, "storage_path" | "caption" | "is_featured" | "sort_order">;

type BarberDetail = {
  id: string;
  name: string;
  intro: string | null;
  address: string | null;
  services: Service[];
  barber_photos: Photo[];
};

function useBarber(barberId: string | undefined) {
  return useQuery({
    queryKey: ["barber", barberId],
    enabled: Boolean(barberId),
    queryFn: async (): Promise<BarberDetail | null> => {
      const { data, error } = await supabase
        .from("barbers")
        .select(
          "id, name, intro, address, services(id, name, category, price, required_slots), barber_photos(storage_path, caption, is_featured, sort_order)",
        )
        .eq("id", barberId as string)
        .maybeSingle();

      if (error) throw error;
      return (data as BarberDetail | null) ?? null;
    },
  });
}

function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: async (): Promise<Tables<"platform_settings"> | null> => {
      const { data, error } = await supabase.from("platform_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/* ───────────────────────────── Photo carousel ───────────────────────────── */

function PhotoCarousel({ photos, barberName }: { photos: Photo[]; barberName: string }) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [zoomed, setZoomed] = useState<Photo | null>(null);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center rounded-3xl bg-secondary text-muted-foreground">
        <Scissors className="size-12" strokeWidth={1.25} aria-hidden="true" />
      </div>
    );
  }

  return (
    <>
      <Carousel setApi={setApi} className="w-full">
        <CarouselContent>
          {photos.map((photo) => (
            <CarouselItem key={photo.storage_path}>
              <button
                type="button"
                onClick={() => setZoomed(photo)}
                className="block w-full cursor-zoom-in overflow-hidden rounded-3xl bg-secondary"
                aria-label="Enlarge photo"
              >
                <img
                  src={publicPhotoUrl(photo.storage_path)}
                  alt={photo.caption ?? `Work by ${barberName}`}
                  className="aspect-[16/10] w-full object-cover"
                />
              </button>
            </CarouselItem>
          ))}
        </CarouselContent>
        {photos.length > 1 ? (
          <>
            <CarouselPrevious className="left-3" />
            <CarouselNext className="right-3" />
          </>
        ) : null}
      </Carousel>

      {photos.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <button
              key={photo.storage_path}
              type="button"
              onClick={() => api?.scrollTo(index)}
              aria-label={`Photo ${index + 1}`}
              aria-current={index === current}
              className={[
                "size-16 overflow-hidden rounded-xl border-2 transition-colors",
                index === current ? "border-primary" : "border-transparent opacity-70",
              ].join(" ")}
            >
              <img
                src={publicPhotoUrl(photo.storage_path)}
                alt=""
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <Dialog open={Boolean(zoomed)} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">{zoomed?.caption ?? `Work by ${barberName}`}</DialogTitle>
          {zoomed ? (
            <img
              src={publicPhotoUrl(zoomed.storage_path)}
              alt={zoomed.caption ?? `Work by ${barberName}`}
              className="max-h-[80vh] w-full rounded-xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────────── Available slots preview ─────────────────────── */

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function groupByDay(slots: Slot[]): [string, Slot[]][] {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = formatDay(slot.starts_at);
    const bucket = groups.get(key);
    if (bucket) bucket.push(slot);
    else groups.set(key, [slot]);
  }
  return [...groups.entries()];
}

/* ──────────────────────────────── The page ───────────────────────────────── */

export default function BarberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useOptionalUser();

  const barberQuery = useBarber(id);
  const slotsQuery = useAvailableSlots(id);
  const settingsQuery = usePlatformSettings();

  const barber = barberQuery.data;
  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);
  const slotMinutes = settingsQuery.data?.slot_minutes ?? 30;
  const currency = settingsQuery.data?.currency?.toUpperCase() ?? "";

  usePageMeta({
    title: barber ? `${barber.name} · Barberly` : "Barber · Barberly",
    description: barber?.intro ?? "See this barber’s work and book a slot.",
  });

  const photos = useMemo(() => sortPhotos(barber?.barber_photos ?? []), [barber]);

  // Why Book might have nothing to offer — the two reasons are different and the
  // button should say which. A barber with a published schedule but no service
  // still cannot be booked: the service is what carries the price and how many
  // slots get held.
  const hasServices = (barber?.services ?? []).length > 0;
  const bookableNow = useMemo(() => {
    const services = barber?.services ?? [];
    return services.some((service) => startSlotRuns(slots, service.required_slots).size > 0);
  }, [barber, slots]);

  const bookLabel = hasServices
    ? bookableNow
      ? "Book"
      : "No slots available"
    : "No services yet";

  const [bookingOpen, setBookingOpen] = useState(false);

  function handleBook() {
    if (!user) {
      // Don't hardcode /login — this build's sign-in route is /sign-in, and the
      // page we came from rides along so signing in returns here.
      navigate("/sign-in", { state: { from: location.pathname } });
      return;
    }
    // Book NEVER navigates away: it opens the modal over this page.
    setBookingOpen(true);
  }

  if (barberQuery.isPending) {
    return (
      <main className="min-h-screen bg-warm">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-5 py-10 md:px-8" aria-busy="true">
          <div className="aspect-[16/10] w-full animate-pulse rounded-3xl bg-secondary" />
        </div>
      </main>
    );
  }

  if (barberQuery.isError || !barber) {
    return (
      <main className="min-h-screen bg-warm">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-5 py-20 text-center md:px-8">
          <h1 className="font-display text-4xl font-semibold">Barber not found</h1>
          <p className="mt-3 text-muted-foreground">
            這位理髮師可能已經下架，或網址不正確。
          </p>
          <Button asChild className="mt-8 rounded-full">
            <Link to="/barbers">Back to all barbers</Link>
          </Button>
        </div>
      </main>
    );
  }

  const grouped = groupByDay(slots);

  return (
    <main className="min-h-screen bg-warm">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
        <Link
          to="/barbers"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All barbers
        </Link>

        <div className="mt-6">
          <PhotoCarousel photos={photos} barberName={barber.name} />
        </div>

        <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              {barber.name}
            </h1>
            {barber.address ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                {barber.address}
              </p>
            ) : null}
          </div>

          <Button
            size="lg"
            className="rounded-full"
            onClick={handleBook}
            disabled={!bookableNow}
          >
            {bookLabel}
          </Button>
        </div>

        {barber.intro ? (
          <p className="mt-6 max-w-2xl leading-7 text-muted-foreground">{barber.intro}</p>
        ) : null}

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold">Services</h2>
          {barber.services.length === 0 ? (
            <p className="mt-3 text-muted-foreground">
              這位理髮師還沒有上架服務。
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
              {barber.services.map((service) => (
                <li key={service.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="font-semibold">{service.name}</span>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-secondary-foreground">
                    {service.category}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {service.required_slots * slotMinutes} min
                    {service.required_slots > 1 ? ` · ${service.required_slots} slots` : null}
                  </span>
                  <span className="ml-auto font-bold">
                    {currency} {service.price}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12 pb-20">
          <h2 className="font-display text-2xl font-semibold">Available slots</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            只顯示還沒被預約的時段。一筆預約會佔用連續幾個時段，數量由服務的
            required slots 決定 —— 選好服務後，Book 對話框會標出完整的那一段。
          </p>

          {slotsQuery.isPending ? (
            <div className="mt-5 h-24 animate-pulse rounded-2xl bg-secondary" aria-busy="true" />
          ) : slots.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-border bg-background p-6 text-muted-foreground">
              目前沒有可預約的時段。
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {grouped.map(([day, daySlots]) => (
                <div key={day}>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {day}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {daySlots.map((slot) => (
                      <span
                        key={slot.id}
                        className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm"
                      >
                        {formatTime(slot.starts_at)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <BookDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        barberId={barber.id}
        services={barber.services}
        slots={slots}
        slotMinutes={slotMinutes}
        currency={currency}
      />
    </main>
  );
}
