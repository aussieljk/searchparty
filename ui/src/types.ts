// AUTO-GENERATED from src/types.ts by scripts/sync-ui-types.ts — do not edit by hand.
// Run `bun run sync:types` after changing src/types.ts.

/** A single image referenced by a page's metadata (og:image, twitter:image, etc.). */
export interface MetaImage {
  url: string;
  /** Which tag it came from, e.g. "og:image", "twitter:image". */
  source: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** Fully scraped SEO snapshot for one page. */
export interface PageResult {
  /** The URL we requested. */
  url: string;
  /** The URL after redirects. */
  finalUrl: string;
  /** Crawl depth from the seed (0 = seed). */
  depth: number;
  status: number;
  ok: boolean;
  /** ms to fetch + parse. */
  elapsedMs: number;
  contentType?: string;
  error?: string;

  // Core SEO
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  lang?: string;
  h1?: string;
  favicon?: string;
  wordCount?: number;

  // Open Graph
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  ogSiteName?: string;
  ogUrl?: string;

  // Twitter
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterSite?: string;

  /** All social/preview images discovered, deduped, absolute URLs. */
  images: MetaImage[];

  /** Issues we flag during analysis (missing title, no og:image, etc.). */
  issues: string[];

  /** Screenshot id (served via /api/screenshot?id=...) when --render captured one. */
  screenshot?: string;
  /** True when this page was rendered with a headless browser (--render). */
  rendered?: boolean;
}

export interface CrawlStats {
  origin: string;
  startedAt: number;
  finishedAt?: number;
  discovered: number;
  scraped: number;
  queued: number;
  inFlight: number;
  errors: number;
  maxPages: number;
  done: boolean;
}

/** Events streamed over SSE from server -> dashboard. */
export type CrawlEvent =
  | { type: "stats"; stats: CrawlStats }
  | { type: "discovered"; url: string; depth: number }
  | { type: "page"; page: PageResult }
  | { type: "done"; stats: CrawlStats };

