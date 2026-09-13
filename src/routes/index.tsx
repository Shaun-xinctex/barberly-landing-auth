import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Award,
  CalendarCheck,
  CreditCard,
  MapPin,
  Search,
  ShieldCheck,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import heroLeft from "@/assets/hero-barber-left.jpg";
import heroRight from "@/assets/hero-stylist-right.jpg";
import kenjiPortrait from "@/assets/barber-kenji.jpg";
import marcusPortrait from "@/assets/barber-marcus.jpg";
import sofiaPortrait from "@/assets/barber-sofia.jpg";
import arjunPortrait from "@/assets/barber-arjun.jpg";

const features = [
  { label: "Verified Barbers", icon: ShieldCheck },
  { label: "Instant Booking", icon: CalendarCheck },
  { label: "Secure Payment", icon: CreditCard },
  { label: "Top-Rated Styles", icon: Award },
];

const barbers = [
  {
    name: "Kenji Sato",
    location: "Still House · SoHo",
    services: ["Cut", "Color"],
    rating: "4.9",
    reviews: 128,
    price: 48,
    image: kenjiPortrait,
  },
  {
    name: "Marcus Reed",
    location: "Common Ground · Brooklyn",
    services: ["Cut", "Beard"],
    rating: "5.0",
    reviews: 94,
    price: 42,
    image: marcusPortrait,
  },
  {
    name: "Sofia Marín",
    location: "Atelier Nueve · Chelsea",
    services: ["Color", "Perm", "Cut"],
    rating: "4.8",
    reviews: 176,
    price: 65,
    image: sofiaPortrait,
  },
  {
    name: "Arjun Mehta",
    location: "The Archive · East Village",
    services: ["Cut", "Perm", "Beard"],
    rating: "4.9",
    reviews: 112,
    price: 52,
    image: arjunPortrait,
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Barberly — Find Your Next Barber" },
      {
        name: "description",
        content: "Discover top-rated barbers and hairstylists, compare services, and find your next look with Barberly.",
      },
      { property: "og:title", content: "Barberly — Find Your Next Barber" },
      {
        property: "og:description",
        content: "Discover top-rated barbers and hairstylists in a few taps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function SearchField({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        aria-label="Search for a stylist or style"
        placeholder="Find your stylist or search a style"
        className={compact ? "h-11 rounded-full border-border bg-card pl-11 shadow-none" : "h-14 rounded-full border-border bg-card pl-12 pr-32 text-sm shadow-lg shadow-primary/5"}
      />
      {!compact && (
        <Button className="absolute right-1.5 top-1.5 h-11 rounded-full px-6">Search</Button>
      )}
    </div>
  );
}

function Index() {
  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <header className="relative z-20 border-b border-border/70 bg-background/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-5 px-5 md:px-8">
          <Link to="/" className="font-display text-3xl font-semibold text-foreground" aria-label="Barberly home">
            Barberly
          </Link>
          <div className="mx-auto hidden max-w-md flex-1 md:block">
            <SearchField compact />
          </div>
          <Button asChild className="ml-auto rounded-full px-6 shadow-none">
            <Link to="/login">Login</Link>
          </Button>
        </div>
      </header>

      <section className="relative mx-auto min-h-[720px] max-w-[1500px] px-5 pb-16 pt-16 md:min-h-[760px] md:px-8 md:pt-20">
        <div className="absolute left-0 top-20 h-[360px] w-[25%] min-w-40 overflow-hidden rounded-r-md md:h-[500px] md:w-[28%]">
          <img src={heroLeft} alt="Barber in a modern studio" width={960} height={1280} className="h-full w-full object-cover object-center" />
        </div>
        <div className="absolute right-0 top-44 h-[340px] w-[24%] min-w-36 overflow-hidden rounded-l-md md:top-28 md:h-[520px] md:w-[27%]">
          <img src={heroRight} alt="Hairstylist in a modern salon" width={960} height={1280} className="h-full w-full object-cover object-center" />
        </div>

        <div className="fade-rise relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">New Look</p>
          <h1 className="font-display max-w-3xl text-6xl font-semibold leading-[0.88] text-foreground sm:text-7xl md:text-8xl lg:text-[7.8rem]">
            Style with<br />Confident Hair
          </h1>
          <p className="mt-7 max-w-md text-sm leading-7 text-muted-foreground md:text-base">
            Discover exceptional barbers, compare their craft, and find the cut that feels unmistakably yours.
          </p>
          <div className="mt-10 w-full max-w-2xl px-2">
            <SearchField />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['All', 'Cut', 'Color', 'Perm', 'Beard'].map((filter, index) => (
              <Button key={filter} variant={index === 0 ? "default" : "outline"} size="sm" className="rounded-full px-4 shadow-none">
                {filter}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Featured salon partners" className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 items-center px-5 py-7 text-center font-display text-xl font-semibold text-ink-soft/70 sm:grid-cols-3 md:grid-cols-6 md:px-8">
          {['MIRROR', 'FORM', 'NOVA', 'ATELIER', 'COMMON', 'STILL'].map((name) => (
            <span key={name} className="py-3 tracking-[0.12em]">{name}</span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">Made for your next look</p>
        <h2 className="font-display mt-3 text-4xl font-semibold leading-none sm:text-5xl">Best booking experience</h2>
        <div className="mt-12 grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
          {features.map(({ label, icon: Icon }) => (
            <div key={label} className="flex min-h-40 flex-col justify-between border-b border-r border-border p-5 md:min-h-48 md:p-7">
              <Icon className="size-6 text-foreground" strokeWidth={1.5} aria-hidden="true" />
              <p className="max-w-32 text-sm font-semibold leading-5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-warm py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex items-end justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">Meet the artists</p>
              <h2 className="font-display mt-3 text-5xl font-semibold leading-none sm:text-6xl">Popular</h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-6 text-muted-foreground sm:block">Independent talent, local institutions, and the people behind your best hair days.</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {barbers.map((barber) => (
              <Button
                key={barber.name}
                variant="ghost"
                className="group h-auto w-full whitespace-normal rounded-lg bg-card p-0 text-left shadow-none transition duration-300 hover:-translate-y-1 hover:bg-card hover:shadow-xl hover:shadow-primary/10"
                onClick={() => undefined}
                aria-label={`View ${barber.name}'s profile`}
              >
                <article className="w-full overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <img src={barber.image} alt={`${barber.name}, featured barber`} loading="lazy" width={1024} height={1024} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
                    <span className="absolute left-3 top-3 rounded-full bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">Popular</span>
                    <span className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-2xl font-semibold">{barber.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5" aria-hidden="true" />{barber.location}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {barber.services.map((service) => <span key={service} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold">{service}</span>)}
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                      <span className="flex items-center gap-1 text-xs font-semibold"><Star className="size-3.5 fill-current" aria-hidden="true" />{barber.rating} <span className="font-normal text-muted-foreground">({barber.reviews})</span></span>
                      <span className="text-sm font-bold">from ${barber.price}</span>
                    </div>
                  </div>
                </article>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-primary px-5 py-8 text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="font-display text-2xl font-semibold">Barberly</span>
          <span className="text-xs text-primary-foreground/70">© 2026 Barberly</span>
        </div>
      </footer>
    </main>
  );
}
