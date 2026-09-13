import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Scissors, Search } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { Input } from "@/components/ui/input";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";
import { publicPhotoUrl, sortPhotos } from "@/lib/photos";

const CATEGORIES = ["cut", "color", "perm", "beard"] as const;
type Category = (typeof CATEGORIES)[number];
type Filter = "all" | Category;

const CATEGORY_LABEL: Record<Filter, string> = {
  all: "All",
  cut: "Cut",
  color: "Color",
  perm: "Perm",
  beard: "Beard",
};

type BarberCard = {
  id: string;
  name: string;
  intro: string | null;
  address: string | null;
  services: { category: string; price: number }[];
  barber_photos: { storage_path: string; is_featured: boolean; sort_order: number }[];
};

/**
 * Every barber, with the two things a card needs: the categories they offer (for the
 * filter chips and the "from" price) and their portfolio photos (for the rep image).
 *
 * Reads `barbers` directly rather than the `barbers_public` view: the view exists to
 * keep a public read free of sensitive columns, but `barbers` carries none by design
 * (bank details are shop-level, on `profiles`), it has a public-select policy, and its
 * generated row type is non-nullable, which the view's is not.
 */
function useBarbers() {
  return useQuery({
    queryKey: ["barbers-browse"],
    queryFn: async (): Promise<BarberCard[]> => {
      const { data, error } = await supabase
        .from("barbers")
        .select("id, name, intro, address, services(category, price), barber_photos(storage_path, is_featured, sort_order)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as BarberCard[];
    },
  });
}

function repPhoto(barber: BarberCard): string | null {
  const [first] = sortPhotos(barber.barber_photos ?? []);
  return first ? publicPhotoUrl(first.storage_path) : null;
}

function fromPrice(barber: BarberCard): number | null {
  const prices = (barber.services ?? []).map((service) => service.price);
  return prices.length ? Math.min(...prices) : null;
}

function BarberCardTile({ barber }: { barber: BarberCard }) {
  const photo = repPhoto(barber);
  const price = fromPrice(barber);
  const categories = [...new Set((barber.services ?? []).map((service) => service.category))];

  return (
    <Link
      to={`/barbers/${barber.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-background transition-shadow hover:shadow-lg"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-secondary">
        {photo ? (
          <img
            src={photo}
            alt={`Work by ${barber.name}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Scissors className="size-10" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold leading-tight">{barber.name}</h2>
          {price !== null ? (
            <span className="shrink-0 text-sm font-bold">from {price}</span>
          ) : null}
        </div>

        {barber.intro ? (
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{barber.intro}</p>
        ) : null}

        {barber.address ? (
          <p className="mt-auto flex items-start gap-1.5 pt-2 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">{barber.address}</span>
          </p>
        ) : null}

        {categories.length ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {categories.map((category) => (
              <span
                key={category}
                className="rounded-full bg-secondary px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-secondary-foreground"
              >
                {category}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export default function Barbers() {
  usePageMeta({
    title: "Barbers · Barberly",
    description: "Browse barbers, see their work, and book a slot.",
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { data: barbers, isPending, isError, error } = useBarbers();

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (barbers ?? []).filter((barber) => {
      const matchesTerm =
        !term ||
        [barber.name, barber.address, barber.intro]
          .filter(Boolean)
          .some((field) => (field as string).toLowerCase().includes(term));

      const matchesFilter =
        filter === "all" ||
        (barber.services ?? []).some((service) => service.category === filter);

      return matchesTerm && matchesFilter;
    });
  }, [barbers, search, filter]);

  return (
    <main className="min-h-screen bg-warm">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
          Find your barber
        </h1>
        <p className="mt-2 text-muted-foreground">
          瀏覽所有理髮師、看他們的作品，選一個時段預約。
        </p>

        <div className="mt-8 flex flex-col gap-4">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or address…"
              aria-label="Search barbers"
              className="rounded-full bg-background pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", ...CATEGORIES] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  filter === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {CATEGORY_LABEL[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10">
          {isPending ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-80 animate-pulse rounded-3xl bg-secondary" />
              ))}
            </div>
          ) : isError ? (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
              Couldn’t load barbers: {error instanceof Error ? error.message : "unknown error"}
            </p>
          ) : visible.length === 0 ? (
            <p className="rounded-2xl border border-border bg-background p-8 text-center text-muted-foreground">
              {barbers?.length
                ? "No barber matches that search yet — try another keyword or category."
                : "No barbers have been published yet."}
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((barber) => (
                <BarberCardTile key={barber.id} barber={barber} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
