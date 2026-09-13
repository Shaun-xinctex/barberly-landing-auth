import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Star, Trash2 } from "lucide-react";

import { ShopHeader } from "@/components/shop-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePageMeta } from "@/hooks/use-page-meta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuthedUser } from "@/lib/authed-user-context";
import { isShopOnboarded, useMyProfile } from "@/lib/profile";

type Barber = Tables<"barbers">;
type BarberPhoto = Tables<"barber_photos">;

const PHOTO_BUCKET = "barber-photos";

function publicPhotoUrl(storagePath: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/* ────────────────────────────── A. Payout settings ────────────────────────── */

function PayoutSettings() {
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();

  const [displayName, setDisplayName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankNumber, setBankNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setBankName(profile.bank_account_name ?? "");
    setBankNumber(profile.bank_account_number ?? "");
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profile not loaded yet.");
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          bank_account_name: bankName.trim(),
          bank_account_number: bankNumber.trim(),
        })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage("已儲存 / Saved.");
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const complete = Boolean(displayName.trim() && bankName.trim() && bankNumber.trim());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    save.mutate();
  }

  return (
    <section className="rounded-2xl border border-border bg-background p-6 md:p-8">
      <h2 className="font-display text-3xl font-semibold">撥款設定 / Payout settings</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        這是整間店共用的設定（你所有的理髮師都適用）。三個欄位都填好才算完成開店。
        <span className="ml-1 font-semibold">先用測試資料即可 / use test data first.</span>
      </p>

      <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="display-name">店名 / Shop name *</Label>
          <Input
            id="display-name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Downtown Cuts"
            className="h-12 rounded-lg bg-card px-4"
          />
          <p className="text-xs text-muted-foreground">
            你的理髮店名稱，會顯示在撥款紀錄上 / your shop&rsquo;s name, shown on payout records.
            這是店名，不是理髮師的名字。
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank-name">匯款戶名 / Bank account name *</Label>
          <Input
            id="bank-name"
            required
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            placeholder="WANG HSIAO MING"
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank-number">匯款帳號 / Bank account number *</Label>
          <Input
            id="bank-number"
            required
            value={bankNumber}
            onChange={(event) => setBankNumber(event.target.value)}
            placeholder="00123456789"
            className="h-12 rounded-lg bg-card px-4"
          />
          <p className="text-xs text-muted-foreground">
            你的理髮店收款的銀行帳戶 / the bank account where your shop gets paid.
            只有你本人和平台管理員看得到。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 md:col-span-2">
          <Button
            type="submit"
            disabled={!complete || save.isPending}
            className="h-12 rounded-full px-8 text-sm"
          >
            {save.isPending ? "Saving…" : "完成開店 / Finish shop signup"}
          </Button>
          {!complete && (
            <p className="text-sm text-muted-foreground">三個欄位都必填才能送出。</p>
          )}
          {message && <p className="text-sm font-semibold">{message}</p>}
        </div>
      </form>
    </section>
  );
}

/* ────────────────────────────── C. Photo uploader ─────────────────────────── */

function PhotoManager({ barber }: { barber: Barber }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photosQuery = useQuery({
    queryKey: ["barber-photos", barber.id],
    queryFn: async (): Promise<BarberPhoto[]> => {
      const { data, error: queryError } = await supabase
        .from("barber_photos")
        .select("*")
        .eq("barber_id", barber.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const photos = photosQuery.data ?? [];

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      for (const [index, file] of files.entries()) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        // The Storage policy authorises writes by the FIRST path segment, so the
        // path must start with a barber id owned by this shop.
        const storagePath = `${barber.id}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(storagePath, file, { contentType: file.type || undefined });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("barber_photos").insert({
          barber_id: barber.id,
          storage_path: storagePath,
          sort_order: photos.length + index,
        });
        if (insertError) throw insertError;
      }
      await queryClient.invalidateQueries({ queryKey: ["barber-photos", barber.id] });
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFeatured(photo: BarberPhoto) {
    setError(null);
    const { error: updateError } = await supabase
      .from("barber_photos")
      .update({ is_featured: !photo.is_featured })
      .eq("id", photo.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["barber-photos", barber.id] });
  }

  async function updateCaption(photo: BarberPhoto, caption: string) {
    const next = caption.trim();
    if (next === (photo.caption ?? "")) return;
    const { error: updateError } = await supabase
      .from("barber_photos")
      .update({ caption: next || null })
      .eq("id", photo.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["barber-photos", barber.id] });
  }

  async function deletePhoto(photo: BarberPhoto) {
    setError(null);
    // Delete BOTH the Storage object and the metadata row.
    const { error: storageError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .remove([photo.storage_path]);
    if (storageError) {
      setError(storageError.message);
      return;
    }
    const { error: deleteError } = await supabase
      .from("barber_photos")
      .delete()
      .eq("id", photo.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["barber-photos", barber.id] });
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
          作品照 / Sample hairstyle photos
        </h4>
        <Label
          htmlFor={`upload-${barber.id}`}
          className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold"
        >
          {busy ? "Uploading…" : "上傳照片 / Upload"}
        </Label>
        <input
          id={`upload-${barber.id}`}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={handleUpload}
        />
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {photos.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">還沒有作品照。</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="rounded-xl border border-border bg-card p-3">
              <img
                src={publicPhotoUrl(photo.storage_path)}
                alt={photo.caption ?? "Sample hairstyle"}
                className="aspect-square w-full rounded-lg object-cover"
                loading="lazy"
              />
              <Input
                defaultValue={photo.caption ?? ""}
                placeholder="說明 / caption"
                className="mt-3 h-10 rounded-lg bg-background px-3 text-sm"
                onBlur={(event) => void updateCaption(photo, event.target.value)}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant={photo.is_featured ? "default" : "outline"}
                  size="sm"
                  className="rounded-full shadow-none"
                  onClick={() => void toggleFeatured(photo)}
                >
                  <Star className="size-4" aria-hidden="true" />
                  {photo.is_featured ? "精選 / Featured" : "設為精選"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Delete photo"
                  onClick={() => void deletePhoto(photo)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────── B. My barbers ─────────────────────────────── */

function BarberCard({ barber }: { barber: Barber }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(barber.name);
  const [intro, setIntro] = useState(barber.intro ?? "");
  const [address, setAddress] = useState(barber.address ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("barbers")
        .update({ name: name.trim(), intro: intro.trim() || null, address: address.trim() || null })
        .eq("id", barber.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage("已儲存 / Saved.");
      await queryClient.invalidateQueries({ queryKey: ["my-barbers"] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("barbers").delete().eq("id", barber.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-barbers"] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  return (
    <li className="rounded-2xl border border-border bg-background p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`name-${barber.id}`}>名稱 / Name *</Label>
          <Input
            id={`name-${barber.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`address-${barber.id}`}>地址 / Address</Label>
          <Input
            id={`address-${barber.id}`}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`intro-${barber.id}`}>簡介 / Intro</Label>
          <Textarea
            id={`intro-${barber.id}`}
            rows={3}
            value={intro}
            onChange={(event) => setIntro(event.target.value)}
            placeholder="簡短介紹一下這位理髮師 / a short bio"
            className="rounded-lg bg-card px-4 py-3"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!name.trim() || save.isPending}
          className="rounded-full px-6"
          onClick={() => {
            setMessage(null);
            save.mutate();
          }}
        >
          {save.isPending ? "Saving…" : "儲存 / Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full bg-background shadow-none"
          disabled={remove.isPending}
          onClick={() => {
            setMessage(null);
            remove.mutate();
          }}
        >
          刪除 / Delete
        </Button>
        {message && <p className="text-sm font-semibold">{message}</p>}
      </div>

      <PhotoManager barber={barber} />
    </li>
  );
}

function MyBarbers() {
  const user = useAuthedUser();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const barbersQuery = useQuery({
    queryKey: ["my-barbers"],
    queryFn: async (): Promise<Barber[]> => {
      const { data, error: queryError } = await supabase
        .from("barbers")
        .select("*")
        .eq("shop_id", user.id)
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase
        .from("barbers")
        .insert({ shop_id: user.id, name: newName.trim() });
      if (insertError) throw insertError;
    },
    onSuccess: async () => {
      setNewName("");
      await queryClient.invalidateQueries({ queryKey: ["my-barbers"] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const barbers = barbersQuery.data ?? [];

  return (
    <section className="mt-8">
      <h2 className="font-display text-3xl font-semibold">我的理髮師 / My barbers</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        一間店可以有多位理髮師，想加幾位就加幾位。
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1 space-y-2">
          <Label htmlFor="new-barber">新增一位理髮師 / Add another barber</Label>
          <Input
            id="new-barber"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="理髮師名稱"
            className="h-12 rounded-lg bg-card px-4"
          />
        </div>
        <Button
          type="button"
          disabled={!newName.trim() || add.isPending}
          className="h-12 rounded-full px-8"
          onClick={() => {
            setError(null);
            add.mutate();
          }}
        >
          {add.isPending ? "Adding…" : "新增 / Add"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {barbersQuery.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : barbers.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          還沒有理髮師 —— 上面新增第一位，就能開始列服務與排時段。
        </p>
      ) : (
        <ul className="mt-6 space-y-6">
          {barbers.map((barber) => (
            <BarberCard key={barber.id} barber={barber} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────── Page ──────────────────────────────────────── */

export default function ShopOnboarding() {
  usePageMeta({
    title: "Shop setup — Barberly",
    description: "Set up your shop: payout details, your barbers, and their sample work.",
  });

  const { data: profile } = useMyProfile();

  return (
    <main className="min-h-screen bg-warm">
      <ShopHeader />
      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
          理髮店上架 / Shop onboarding
        </p>
        <h1 className="font-display mt-3 text-5xl font-semibold leading-none">
          {profile?.display_name?.trim() || "把你的店搬上線"}
        </h1>
        {!isShopOnboarded(profile) && (
          <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            還差一步：填好店名與撥款銀行資訊，開店設定才算完成。
          </p>
        )}

        <div className="mt-8">
          <PayoutSettings />
        </div>
        <MyBarbers />
      </div>
    </main>
  );
}
