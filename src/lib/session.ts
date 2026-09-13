import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type OptionalUser = { user: User | null; isPending: boolean };

/**
 * The signed-in user, or null — for surfaces that are PUBLIC but render differently
 * once you are signed in (`/barbers`, `/barbers/:id`).
 *
 * `useAuthedUser()` throws outside `<RequireAuth>` by design, so it can't be used on a
 * page anonymous visitors are meant to reach. This resolves the session the same way
 * RequireAuth does — initial `getUser()` plus an `onAuthStateChange` subscription — and
 * simply reports absence instead of redirecting.
 */
export function useOptionalUser(): OptionalUser {
  const [state, setState] = useState<OptionalUser>({ user: null, isPending: true });

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setState({ user: error ? null : data.user, isPending: false });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({ user: session?.user ?? null, isPending: false });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
