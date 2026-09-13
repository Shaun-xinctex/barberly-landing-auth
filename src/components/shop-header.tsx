import { useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuthedUser } from "@/lib/authed-user-context";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
  ].join(" ");

/** Shared chrome for the shop-side pages (/shop and /shop/bookings). */
export function ShopHeader() {
  const user = useAuthedUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center gap-3 px-5 py-4 md:px-8">
        <Link to="/" className="font-display text-3xl font-semibold">
          Barberly
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/shop" end className={navLinkClass}>
            Shop setup
          </NavLink>
          <NavLink to="/shop/bookings" className={navLinkClass}>
            Services &amp; slots
          </NavLink>
        </nav>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <span className="max-w-[15rem] truncate text-sm text-muted-foreground">{user.email}</span>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
            shop
          </span>
          <Button
            variant="outline"
            className="rounded-full bg-background shadow-none"
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
