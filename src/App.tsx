import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppErrorBoundary } from "@/components/error-boundary";
import { RequireAuth } from "@/components/require-auth";
import { RequireShop } from "@/components/require-shop";
import { supabase } from "@/integrations/supabase/client";
import Barbers from "@/pages/Barbers";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import ShopBookings from "@/pages/ShopBookings";
import ShopOnboarding from "@/pages/ShopOnboarding";

export default function App() {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<Landing />} />

          {/* Combined sign-in / sign-up page, plus direct entry points for each mode. */}
          <Route path="/login" element={<Login />} />
          <Route path="/sign-in" element={<Login initialMode="signin" />} />
          <Route path="/sign-up" element={<Login initialMode="signup" />} />

          {/* Customer surfaces. /barbers is the canonical post-login route for this
              project (see .claude/skills/m0-landing-page) and, from M1.2 on, the
              PUBLIC browse page: anyone may look at barbers, only booking needs an
              account. The signed-in shell that used to live here is gone — its one
              action, "Become a shop", moved into <SiteHeader>. */}
          <Route path="/barbers" element={<Barbers />} />

          {/* Shop-side surfaces. RequireShop gates on profiles.role === "shop". */}
          <Route
            path="/shop"
            element={
              <RequireAuth>
                <RequireShop>
                  <ShopOnboarding />
                </RequireShop>
              </RequireAuth>
            }
          />
          <Route
            path="/shop/bookings"
            element={
              <RequireAuth>
                <RequireShop>
                  <ShopBookings />
                </RequireShop>
              </RequireAuth>
            }
          />

          {/* Earlier alias kept working so old links don't break. */}
          <Route path="/app" element={<Navigate to="/barbers" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
