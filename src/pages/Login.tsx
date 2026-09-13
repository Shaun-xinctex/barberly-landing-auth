import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile, routeForRole } from "@/lib/profile";

type Role = "customer" | "shop";
type Mode = "signin" | "signup";

export default function LoginPage({ initialMode = "signin" }: { initialMode?: Mode }) {
  usePageMeta({
    title: "Sign In or Join — Barberly",
    description: "Sign in to Barberly or create an account as a customer or barber.",
  });

  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [role, setRole] = useState<Role>("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !active) return;
      const profile = await fetchMyProfile();
      if (active) navigate(routeForRole(profile?.role), { replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const result = mode === "signup"
      ? await supabase.auth.signUp({
          email,
          password,
          options: { data: { role }, emailRedirectTo: `${window.location.origin}/login` },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      setBusy(false);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      setBusy(false);
      return;
    }

    // Route by profiles.role — M1.1 branches shop / customer only.
    const profile = await fetchMyProfile();
    navigate(routeForRole(profile?.role), { replace: true });
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-warm-deep/20" />
        <Link to="/" className="relative z-10 font-display text-3xl font-semibold">Barberly</Link>
        <div className="relative z-10 max-w-lg">
          <Scissors className="mb-8 size-9" strokeWidth={1.25} aria-hidden="true" />
          <p className="font-display text-6xl font-semibold leading-[0.95]">Good hair starts with the right hands.</p>
          <p className="mt-6 max-w-sm text-sm leading-7 text-primary-foreground/65">Find a trusted stylist or bring your craft to a new community.</p>
        </div>
        <p className="relative z-10 text-xs text-primary-foreground/50">© 2026 Barberly</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="fade-rise w-full max-w-md">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Link to="/" className="font-display text-3xl font-semibold">Barberly</Link>
            <Button variant="ghost" size="icon" asChild aria-label="Back to home"><Link to="/"><ArrowLeft /></Link></Button>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">Welcome to Barberly</p>
          <h1 className="font-display mt-3 text-5xl font-semibold leading-none">{mode === "signin" ? "Welcome back" : "Create an account"}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === "signin" ? "Sign in to continue to your account." : "Join as a customer or bring your barber business online."}</p>

          <div className="mt-8 grid grid-cols-2 rounded-full bg-muted p-1">
            <Button type="button" variant={mode === "signin" ? "default" : "ghost"} className="rounded-full shadow-none" onClick={() => { setMode("signin"); setMessage(null); }}>Sign In</Button>
            <Button type="button" variant={mode === "signup" ? "default" : "ghost"} className="rounded-full shadow-none" onClick={() => { setMode("signup"); setMessage(null); }}>Sign Up</Button>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div>
                <Label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">I’m joining as</Label>
                <Tabs value={role} onValueChange={(value) => setRole(value as Role)}>
                  <TabsList className="grid h-12 w-full grid-cols-2 rounded-full bg-muted p-1">
                    <TabsTrigger value="customer" className="h-10 rounded-full">Customer</TabsTrigger>
                    <TabsTrigger value="shop" className="h-10 rounded-full">Barber</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-12 rounded-lg bg-card px-4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" className="h-12 rounded-lg bg-card px-4 pr-12" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1.5" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>

            {message && <p role="alert" className="rounded-md bg-secondary px-4 py-3 text-sm text-secondary-foreground">{message}</p>}

            <Button type="submit" disabled={busy} className="h-12 w-full rounded-full text-sm">
              {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className="mt-7 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to Barberly?" : "Already have an account?"}{" "}
            <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </Button>
          </p>
        </div>
      </section>
    </main>
  );
}