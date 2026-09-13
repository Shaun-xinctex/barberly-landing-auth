import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/profile";
import { useOptionalUser } from "@/lib/session";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
  ].join(" ");

/**
 * Shared chrome for the CUSTOMER surfaces (/barbers, /barbers/:id, /bookings).
 *
 * Unlike <ShopHeader> this renders for anonymous visitors too, because browsing
 * barbers does not require an account — only booking does. It also carries the
 * "開店 / Become a shop" action that used to live on the retired /barbers shell
 * page, so a customer can still upgrade without a page of its own.
 */
export function SiteHeader() {
  const { user } = useOptionalUser();
  const { data: profile } = useMyProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const isShop = profile?.role === "shop";

  const becomeShop = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not signed in");
      // The upgrade path only ever writes 'shop'. 'admin' is never self-served —
      // it is granted by migration only.
      const { error } = await supabase.from("profiles").update({ role: "shop" }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      navigate("/shop", { replace: true });
    },
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/barbers", { replace: true });
  }

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center gap-3 px-5 py-4 md:px-8">
        <Link to="/" className="font-display text-3xl font-semibold">
          Barberly
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/barbers" end className={navLinkClass}>
            Barbers
          </NavLink>
          {user ? (
            <NavLink to="/bookings" className={navLinkClass}>
              My bookings
            </NavLink>
          ) : null}
        </nav>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {user ? (
            <>
              <span className="max-w-[15rem] truncate text-sm text-muted-foreground">
                {user.email}
              </span>
              {isShop ? (
                <Button asChild variant="outline" className="rounded-full bg-background shadow-none">
                  <Link to="/shop">理髮店後台 / Shop dashboard</Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="rounded-full bg-background shadow-none"
                  disabled={becomeShop.isPending}
                  onClick={() => becomeShop.mutate()}
                >
                  {becomeShop.isPending ? "Please wait…" : "開店 / Become a shop"}
                </Button>
              )}
              <Button
                variant="outline"
                className="rounded-full bg-background shadow-none"
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </>
          ) : (
            <Button asChild className="rounded-full">
              <Link to="/sign-in">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
