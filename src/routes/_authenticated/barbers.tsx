import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/barbers")({
  head: () => ({
    meta: [
      { title: "Your Barberly Space" },
      { name: "description", content: "Your role-aware Barberly account space." },
      { property: "og:title", content: "Your Barberly Space" },
      { property: "og:description", content: "Your role-aware Barberly account space." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BarbersShell,
});

function BarbersShell() {
  const { user } = Route.useRouteContext();
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const isBarber = user.user_metadata?.["role"] === "shop";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/login", replace: true });
  }

  return (
    <main className="min-h-screen bg-warm">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center gap-3 px-5 py-4 md:px-8">
          <Link to="/" className="font-display text-3xl font-semibold">Barberly</Link>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            <span className="max-w-[15rem] truncate text-sm text-muted-foreground">Hi {user.email}</span>
            {isBarber && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">barber</span>}
            <Button variant="outline" className="rounded-full bg-background shadow-none" onClick={handleSignOut}>Sign Out</Button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-81px)] max-w-5xl items-center justify-center px-5 py-16 text-center md:px-8">
        <div className="fade-rise max-w-3xl">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Scissors className="size-7" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">Your Barberly space</p>
          <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.95] sm:text-7xl">
            {isBarber ? "Your chair, your craft." : "A better cut is close."}
          </h1>
          <div className="mx-auto mt-8 max-w-2xl space-y-3 text-muted-foreground">
            <p className="text-lg leading-8">
              {isBarber
                ? "理髮師後台即將上線 — 下一個里程碑會加上個人檔案、服務項目與排班管理。"
                : "附近的理髮師即將上線 — 下一個里程碑會加上瀏覽與預約功能。"}
            </p>
            <p className="text-sm leading-7">
              {isBarber
                ? "Your barber dashboard is coming soon — profile, services & schedule arrive in the next milestone."
                : "Barbers near you are coming soon — browse & booking arrive in the next milestone."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}