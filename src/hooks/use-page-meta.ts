import { useEffect } from "react";

type PageMeta = {
  title: string;
  description: string;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

/**
 * Client-side replacement for TanStack Start's route `head()` option.
 * Keeps the same title / description / og / twitter tags each page declared
 * before the SPA conversion.
 */
export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("name", "twitter:card", "summary_large_image");
  }, [title, description]);
}
