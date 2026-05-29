import type { PageResult } from "@/types";

/** Best preview image for a page, preferring og:image. */
export function previewImage(page: PageResult): string | undefined {
  return (
    page.images.find((i) => i.source === "og:image")?.url ??
    page.images[0]?.url
  );
}

/** Title as a social platform would show it. */
export function displayTitle(page: PageResult): string {
  return page.ogTitle || page.twitterTitle || page.title || pathOf(page.finalUrl);
}

export function displayDescription(page: PageResult): string | undefined {
  return page.ogDescription || page.twitterDescription || page.description;
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search) || "/";
  } catch {
    return url;
  }
}

/** Rough 0-100 SEO health score from the flagged issues + presence of key tags. */
export function seoScore(page: PageResult): number {
  if (page.error) return 0;
  let score = 100;
  score -= page.issues.length * 12;
  if (!page.title) score -= 10;
  if (!page.description) score -= 8;
  return Math.max(0, Math.min(100, score));
}

export type ScoreTier = "great" | "ok" | "poor";

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return "great";
  if (score >= 50) return "ok";
  return "poor";
}
