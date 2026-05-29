// Shared helpers for the Social Card Simulator. Pure functions only — no React.
import type { PageResult } from "@/types";
import { previewImage } from "@/lib/seo";

export type Platform =
  | "google"
  | "twitter"
  | "facebook"
  | "linkedin"
  | "slack"
  | "imessage"
  | "discord";

/** Truncate to `max` chars on a word boundary, appending an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/** Resolve the image a platform unfurl would show: rendered screenshot first, then og:image. */
export function shareImage(page: PageResult): string | undefined {
  if (page.screenshot) {
    return `/api/screenshot?id=${encodeURIComponent(page.screenshot)}`;
  }
  return previewImage(page);
}

/** og:image specifically (some platforms only honour og:image, not a screenshot). */
export function ogImage(page: PageResult): string | undefined {
  return page.images.find((i) => i.source === "og:image")?.url;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function fullPathDisplay(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    return host + path;
  } catch {
    return url;
  }
}

/** Google SERP-style breadcrumb: example.com › section › page */
export function breadcrumb(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    return [host, ...parts].join(" › ");
  } catch {
    return url;
  }
}

export interface CardData {
  title: string;
  description: string;
  image?: string;
  host: string;
  card: "summary" | "summary_large_image" | string;
}

/** Title/description per the platform's own preference order. */
export function cardData(page: PageResult): CardData {
  const title = page.ogTitle || page.twitterTitle || page.title || "";
  const description =
    page.ogDescription || page.twitterDescription || page.description || "";
  return {
    title,
    description,
    image: shareImage(page),
    host: hostOf(page.finalUrl),
    card: page.twitterCard || "summary",
  };
}

export interface Warning {
  text: string;
  level: "warn" | "error";
}

/** Inline, platform-specific warnings (truncation, missing tags, wrong card type). */
export function warningsFor(platform: Platform, page: PageResult): Warning[] {
  const w: Warning[] = [];
  const d = cardData(page);
  const titleLen = d.title.length;
  const descLen = d.description.length;
  const hasImage = !!d.image;

  switch (platform) {
    case "google":
      if (!page.title) w.push({ text: "No <title> — Google will synthesize one", level: "error" });
      if (titleLen > 60)
        w.push({ text: `Title truncated by Google at ~60 chars (${titleLen})`, level: "warn" });
      if (!page.description)
        w.push({ text: "No meta description — Google picks page text", level: "warn" });
      else if (descLen > 160)
        w.push({ text: `Description truncated at ~160 chars (${descLen})`, level: "warn" });
      break;
    case "twitter":
      if (!page.twitterCard && !ogImage(page))
        w.push({ text: "No twitter:card and no og:image — falls back to a plain link", level: "warn" });
      if (d.card !== "summary_large_image" && hasImage)
        w.push({ text: `twitter:card is "${d.card}" — set summary_large_image for a big image`, level: "warn" });
      if (titleLen > 70)
        w.push({ text: `Title truncated by X at ~70 chars (${titleLen})`, level: "warn" });
      if (descLen > 200)
        w.push({ text: `Description truncated at ~200 chars (${descLen})`, level: "warn" });
      if (!hasImage)
        w.push({ text: "No image — X shows a small text-only card", level: "warn" });
      break;
    case "facebook":
      if (!page.ogTitle) w.push({ text: "No og:title — falls back to <title>", level: "warn" });
      if (!ogImage(page))
        w.push({ text: "No og:image — Facebook may pick a random image", level: "error" });
      if (titleLen > 88)
        w.push({ text: `Title truncated by Facebook at ~88 chars (${titleLen})`, level: "warn" });
      if (descLen > 300)
        w.push({ text: `Description truncated at ~300 chars (${descLen})`, level: "warn" });
      break;
    case "linkedin":
      if (!ogImage(page))
        w.push({ text: "No og:image — LinkedIn shows a title-only card", level: "warn" });
      if (titleLen > 119)
        w.push({ text: `Title truncated by LinkedIn at ~119 chars (${titleLen})`, level: "warn" });
      break;
    case "slack":
      if (!d.title && !d.description)
        w.push({ text: "No og: tags — Slack shows a bare link, no unfurl", level: "warn" });
      if (descLen > 200)
        w.push({ text: `Description clamped at ~200 chars (${descLen})`, level: "warn" });
      break;
    case "imessage":
      if (!hasImage)
        w.push({ text: "No image — iMessage shows a compact title-only bubble", level: "warn" });
      if (titleLen > 50)
        w.push({ text: `Title clamped to ~50 chars in the rich link (${titleLen})`, level: "warn" });
      break;
    case "discord":
      if (!page.ogTitle && !page.title)
        w.push({ text: "No title — Discord won't embed", level: "error" });
      if (titleLen > 256)
        w.push({ text: `Title truncated by Discord at 256 chars (${titleLen})`, level: "warn" });
      if (descLen > 350)
        w.push({ text: `Description truncated at ~350 chars (${descLen})`, level: "warn" });
      break;
  }
  return w;
}

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "twitter", label: "X" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "slack", label: "Slack" },
  { id: "imessage", label: "iMessage" },
  { id: "discord", label: "Discord" },
];
