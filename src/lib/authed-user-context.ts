import type { User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export const AuthedUserContext = createContext<User | null>(null);

/** Read the signed-in user inside a subtree wrapped by <RequireAuth>. */
export function useAuthedUser(): User {
  const user = useContext(AuthedUserContext);
  if (!user) {
    throw new Error("useAuthedUser() must be called inside <RequireAuth>");
  }
  return user;
}
