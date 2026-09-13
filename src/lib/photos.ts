import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const PHOTO_BUCKET = "barber-photos";

export type BarberPhoto = Pick<
  Tables<"barber_photos">,
  "id" | "storage_path" | "caption" | "is_featured" | "sort_order"
>;

/**
 * `barber-photos` is a public bucket (public-read, shop-write), so a portfolio image
 * needs no signed URL and no session — an anonymous visitor browsing `/barbers` gets
 * the same URL a signed-in customer does.
 */
export function publicPhotoUrl(storagePath: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** Featured first, then the shop's chosen order, then newest — the gallery order. */
export function sortPhotos<T extends Pick<BarberPhoto, "is_featured" | "sort_order">>(
  photos: T[],
): T[] {
  return [...photos].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
}
