// Mirrors searchparty/src/types.ts (kept in sync by hand — small + stable).

export interface MetaImage {
  url: string;
  source: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface PageResult {
  url: string;
  finalUrl: string;
  depth: number;
  status: number;
  ok: boolean;
  elapsedMs: number;
  contentType?: string;
  error?: string;
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  lang?: string;
  h1?: string;
  favicon?: string;
  wordCount?: number;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  ogSiteName?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterSite?: string;
  images: MetaImage[];
  issues: string[];
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

export type CrawlEvent =
  | { type: "stats"; stats: CrawlStats }
  | { type: "discovered"; url: string; depth: number }
  | { type: "page"; page: PageResult }
  | { type: "done"; stats: CrawlStats };
