import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";

import { ShopHeader } from "@/components/shop-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthedUser } from "@/lib/authed-user-context";

type Barber = Tables<"barbers">;
type Service = Tables<"services">;
type Slot = Tables<"bookable_slots">;

const CATEGORIES = ["cut", "color", "perm", "beard"] as const;
type Category = (typeof CATEGORIES)[number];

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

function formatSlot(slot: Slot): string {
  const start = new Date(slot.starts_at);
  const end = new Date(slot.ends_at);
  const date = start.toLocaleDateString();
  const time = (value: Date) =>
    value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${date}  ${time(start)} – ${time(end)}`;
}

/* ────────────────────────── A. Services & price editor ────────────────────── */

function ServicesEditor({ barberId, currency }: { barberId: string; currency: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("cut");
  const [price, setPrice] = useState("300");
  const [requiredSlots, setRequiredSlots] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["services", barberId],
    queryFn: async (): Promise<Service[]> => {
      const { data, error: queryError } = await supabase
        .from("services")
        .select("*")
        .eq("barber_id", barberId)
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      // `price` is a whole-unit integer in platform_settings.currency — never
      // cents, and never pre-multiplied by 100.
      const { error: insertError } = await supabase.from("services").insert({
        barber_id: barberId,
        name: name.trim(),
        category,
        price: Number.parseInt(price, 10),
        required_slots: Number.parseInt(requiredSlots, 10),
      });
      if (insertError) throw insertError;
    },
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["services", barberId] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  async function updateService(service: Service, patch: Partial<Service>) {
    setError(null);
    const { error: updateError } = await supabase
      .from("services")
      .update(patch)
      .eq("id", service.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["services", barberId] });
  }

  async function deleteService(service: Service) {
    setError(null);
    const { error: deleteError } = await supabase
      .from("services")
      .delete()
      .eq("id", service.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["services", barberId] });
  }

  const services = servicesQuery.data ?? [];
  const priceValid = Number.isInteger(Number(price)) && Number(price) >= 0;
  const slotsValid = Number.isInteger(Number(requiredSlots)) && Number(requiredSlots) >= 1;

  return (
    <section className="rounded-2xl border border-border bg-background p-6 md:p-8">
      <h2 className="font-display text-3xl font-semibold">服務與價格 / Services &amp; prices</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        價格直接填整數金額（單位 {currency.toUpperCase()}），例如 300 就是 NT$300 —— 不要乘 100。
        「所需時段數」是這個服務要佔掉幾個連續時段。
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="service-name">名稱 / Name</Label>
          <Input
            id="service-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Men&rsquo;s cut"
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-category">分類 / Category</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
            <SelectTrigger id="service-category" className="h-12 rounded-lg bg-card px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-price">價格 / Price</Label>
          <Input
            id="service-price"
            type="number"
            min={0}
            step={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-slots">所需時段數</Label>
          <Input
            id="service-slots"
            type="number"
            min={1}
            step={1}
            value={requiredSlots}
            onChange={(event) => setRequiredSlots(event.target.value)}
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <Button
          type="button"
          className="h-12 rounded-full px-8"
          disabled={!name.trim() || !priceValid || !slotsValid || add.isPending}
          onClick={() => {
            setError(null);
            add.mutate();
          }}
        >
          新增 / Add
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {services.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">這位理髮師還沒有服務項目。</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {services.map((service) => (
            <li
              key={service.id}
              className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-center"
            >
              <Input
                defaultValue={service.name}
                className="h-11 rounded-lg bg-background px-3"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== service.name) void updateService(service, { name: next });
                }}
              />
              <Select
                value={service.category}
                onValueChange={(value) => void updateService(service, { category: value })}
              >
                <SelectTrigger className="h-11 rounded-lg bg-background px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                step={1}
                defaultValue={service.price}
                className="h-11 rounded-lg bg-background px-3"
                onBlur={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  if (Number.isInteger(next) && next >= 0 && next !== service.price) {
                    void updateService(service, { price: next });
                  }
                }}
              />
              <Input
                type="number"
                min={1}
                step={1}
                defaultValue={service.required_slots}
                className="h-11 rounded-lg bg-background px-3"
                onBlur={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  if (Number.isInteger(next) && next >= 1 && next !== service.required_slots) {
                    void updateService(service, { required_slots: next });
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Delete service"
                onClick={() => void deleteService(service)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────── B. Bookable slot publisher ────────────────────── */

function SlotPublisher({ barberId, slotMinutes }: { barberId: string; slotMinutes: number }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [count, setCount] = useState("4");
  const [error, setError] = useState<string | null>(null);

  const slotsQuery = useQuery({
    queryKey: ["slots", barberId],
    queryFn: async (): Promise<Slot[]> => {
      const { data, error: queryError } = await supabase
        .from("bookable_slots")
        .select("*")
        .eq("barber_id", barberId)
        .order("starts_at", { ascending: true });
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      const total = Number.parseInt(count, 10);
      const first = new Date(`${date}T${startTime}`);
      if (Number.isNaN(first.getTime())) throw new Error("日期或時間格式不正確。");

      // A slot is one slot_minutes-long window. A longer opening is published as
      // a run of consecutive slots.
      const rows = Array.from({ length: total }, (_, index) => {
        const starts = new Date(first.getTime() + index * slotMinutes * 60_000);
        const ends = new Date(starts.getTime() + slotMinutes * 60_000);
        return {
          barber_id: barberId,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
        };
      });

      const { error: insertError } = await supabase.from("bookable_slots").insert(rows);
      if (insertError) throw insertError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["slots", barberId] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  async function deleteSlot(slot: Slot) {
    setError(null);
    const { error: deleteError } = await supabase
      .from("bookable_slots")
      .delete()
      .eq("id", slot.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["slots", barberId] });
  }

  const slots = slotsQuery.data ?? [];
  const countValid = Number.isInteger(Number(count)) && Number(count) >= 1;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-background p-6 md:p-8">
      <h2 className="font-display text-3xl font-semibold">可預約時段 / Bookable slots</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        每個時段長 {slotMinutes} 分鐘。想開一段比較長的可預約時間，就一次產生連續數個時段。
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="slot-date">日期 / Date</Label>
          <Input
            id="slot-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slot-start">開始時間 / Start</Label>
          <Input
            id="slot-start"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slot-count">連續幾個時段</Label>
          <Input
            id="slot-count"
            type="number"
            min={1}
            step={1}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <Button
          type="button"
          className="h-12 rounded-full px-8"
          disabled={!date || !startTime || !countValid || publish.isPending}
          onClick={() => {
            setError(null);
            publish.mutate();
          }}
        >
          發布 / Publish
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {slots.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">還沒有發布任何時段。</p>
      ) : (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
            >
              <span>{formatSlot(slot)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Delete slot"
                onClick={() => void deleteSlot(slot)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────── Page ──────────────────────────────────────── */

export default function ShopBookings() {
  usePageMeta({
    title: "Services & slots — Barberly",
    description: "Edit your services and prices, and publish bookable time slots.",
  });

  const user = useAuthedUser();
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const settingsQuery = usePlatformSettings();

  const barbersQuery = useQuery({
    queryKey: ["my-barbers"],
    queryFn: async (): Promise<Barber[]> => {
      const { data, error } = await supabase
        .from("barbers")
        .select("*")
        .eq("shop_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const barbers = barbersQuery.data ?? [];

  const firstBarberId = barbers[0]?.id;
  useEffect(() => {
    if (!selectedBarberId && firstBarberId) setSelectedBarberId(firstBarberId);
  }, [firstBarberId, selectedBarberId]);

  const slotMinutes = settingsQuery.data?.slot_minutes ?? 30;
  const currency = settingsQuery.data?.currency ?? "twd";

  return (
    <main className="min-h-screen bg-warm">
      <ShopHeader />
      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
          理髮店後台 / Shop dashboard
        </p>
        <h1 className="font-display mt-3 text-5xl font-semibold leading-none">服務與排程</h1>

        {barbersQuery.isPending ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
        ) : barbers.length === 0 ? (
          <p className="mt-8 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            還沒有理髮師。先到{" "}
            <Link to="/shop" className="font-semibold underline">
              開店設定
            </Link>{" "}
            新增一位，再回來列服務、排時段。
          </p>
        ) : (
          <>
            <div className="mt-8 max-w-sm space-y-2">
              <Label htmlFor="barber-picker">選擇理髮師 / Barber</Label>
              <Select value={selectedBarberId} onValueChange={setSelectedBarberId}>
                <SelectTrigger id="barber-picker" className="h-12 rounded-lg bg-background px-4">
                  <SelectValue placeholder="選一位理髮師" />
                </SelectTrigger>
                <SelectContent>
                  {barbers.map((barber) => (
                    <SelectItem key={barber.id} value={barber.id}>
                      {barber.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBarberId && (
              <div className="mt-8">
                <ServicesEditor barberId={selectedBarberId} currency={currency} />
                <SlotPublisher barberId={selectedBarberId} slotMinutes={slotMinutes} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
