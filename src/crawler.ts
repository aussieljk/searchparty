import { parse, type HTMLElement } from "node-html-parser";
import { EventEmitter } from "node:events";
import type { CrawlEvent, CrawlStats, MetaImage, PageResult } from "./types.ts";

export interface CrawlerOptions {
  origin: string; // normalized https://host
  maxPages: number;
  concurrency: number;
  /** also follow links found on pages (not just the sitemap). */
  followLinks: boolean;
  userAgent: string;
}

const SKIP_EXTENSIONS =
  /\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|pdf|zip|gz|mp4|webm|mp3|wav|woff2?|ttf|eot|rss|atom)(?:$|\?)/i;

/**
 * BFS site crawler. Emits "event" (CrawlEvent) as it discovers and scrapes
 * pages so a live dashboard can render results as they arrive.
 */
export class Crawler extends EventEmitter {
  readonly origin: string;
  readonly host: string;
  private readonly opts: CrawlerOptions;

  private readonly seen = new Set<string>();
  private readonly queue: { url: string; depth: number }[] = [];
  private readonly pages: PageResult[] = [];
  private inFlight = 0;
  private stats: CrawlStats;
  private started = false;
  private aborted = false;

  constructor(opts: CrawlerOptions) {
    super();
    this.opts = opts;
    this.origin = opts.origin;
    this.host = new URL(opts.origin).host;
    this.stats = {
      origin: this.origin,
      startedAt: 0,
      discovered: 0,
      scraped: 0,
      queued: 0,
      inFlight: 0,
      errors: 0,
      maxPages: opts.maxPages,
      done: false,
    };
  }

  getSnapshot() {
    return { stats: { ...this.stats }, pages: [...this.pages] };
  }

  abort() {
    this.aborted = true;
  }

  private emitEvent(event: CrawlEvent) {
    this.emit("event", event);
  }

  private emitStats() {
    this.stats.queued = this.queue.length;
    this.stats.inFlight = this.inFlight;
    this.emitEvent({ type: "stats", stats: { ...this.stats } });
  }

  /** Add a URL to the frontier if it's new, same-host, and looks like a page. */
  private enqueue(rawUrl: string, depth: number) {
    let url: URL;
    try {
      url = new URL(rawUrl, this.origin);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.host !== this.host) return;
    if (SKIP_EXTENSIONS.test(url.pathname)) return;

    url.hash = "";
    const key = url.toString();
    if (this.seen.has(key)) return;
    if (this.seen.size >= this.opts.maxPages) return;

    this.seen.add(key);
    this.queue.push({ url: key, depth });
    this.stats.discovered = this.seen.size;
    this.emitEvent({ type: "discovered", url: key, depth });
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.stats.startedAt = Date.now();

    // Seed: homepage + anything in sitemap.xml.
    this.enqueue(this.origin + "/", 0);
    const sitemapUrls = await this.fetchSitemapUrls();
    for (const u of sitemapUrls) this.enqueue(u, 0);
    this.emitStats();

    await this.drain();

    this.stats.done = true;
    this.stats.inFlight = 0;
    this.stats.queued = this.queue.length;
    this.stats.finishedAt = Date.now();
    this.emitEvent({ type: "done", stats: { ...this.stats } });
  }

  /** Pull from the queue while respecting the concurrency limit. */
  private async drain() {
    return new Promise<void>((resolve) => {
      const tick = () => {
        if (this.aborted) return resolve();
        while (
          this.inFlight < this.opts.concurrency &&
          this.queue.length > 0 &&
          this.stats.scraped + this.inFlight < this.opts.maxPages
        ) {
          const next = this.queue.shift()!;
          this.inFlight++;
          this.emitStats();
          this.scrape(next.url, next.depth)
            .catch(() => {})
            .finally(() => {
              this.inFlight--;
              tick();
            });
        }
        if (this.inFlight === 0 && this.queue.length === 0) resolve();
      };
      tick();
    });
  }

  private async fetchSitemapUrls(): Promise<string[]> {
    const candidates = [this.origin + "/sitemap.xml", this.origin + "/sitemap_index.xml"];
    const found: string[] = [];
    for (const sm of candidates) {
      try {
        const res = await fetch(sm, {
          headers: { "user-agent": this.opts.userAgent },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.trim());
        // Sitemap index -> fetch nested sitemaps (cap to a few).
        const nested = locs.filter((l) => /sitemap.*\.xml/i.test(l)).slice(0, 5);
        if (nested.length && /sitemapindex/i.test(xml)) {
          for (const n of nested) {
            try {
              const r = await fetch(n, {
                headers: { "user-agent": this.opts.userAgent },
                signal: AbortSignal.timeout(10_000),
              });
              if (!r.ok) continue;
              const t = await r.text();
              found.push(...[...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.trim()));
            } catch {}
          }
        } else {
          found.push(...locs);
        }
        if (found.length) break;
      } catch {}
    }
    return found;
  }

  private async scrape(url: string, depth: number) {
    const t0 = Date.now();
    const result: PageResult = {
      url,
      finalUrl: url,
      depth,
      status: 0,
      ok: false,
      elapsedMs: 0,
      images: [],
      issues: [],
    };

    try {
      const res = await fetch(url, {
        headers: { "user-agent": this.opts.userAgent, accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      result.status = res.status;
      result.finalUrl = res.url || url;
      result.ok = res.ok;
      result.contentType = res.headers.get("content-type") ?? undefined;

      if (!res.ok) {
        result.error = `HTTP ${res.status}`;
        this.stats.errors++;
      } else if (result.contentType && !/text\/html|application\/xhtml/i.test(result.contentType)) {
        result.error = `Skipped non-HTML (${result.contentType.split(";")[0]})`;
      } else {
        const html = await res.text();
        this.extract(html, result);
        if (this.opts.followLinks && depth < 6) {
          for (const href of result._links ?? []) this.enqueue(href, depth + 1);
        }
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      this.stats.errors++;
    }

    delete result._links;
    result.elapsedMs = Date.now() - t0;
    this.analyze(result);

    this.pages.push(result);
    this.stats.scraped = this.pages.length;
    this.emitEvent({ type: "page", page: result });
    this.emitStats();
  }

  /** Parse HTML and fill the SEO fields on `result`. */
  private extract(html: string, result: PageResult & { _links?: string[] }) {
    const root = parse(html, {
      blockTextElements: { script: false, style: false, noscript: false },
    });
    const base = result.finalUrl;
    const abs = (href?: string | null) => {
      if (!href) return undefined;
      try {
        return new URL(href, base).toString();
      } catch {
        return undefined;
      }
    };

    const metaContent = (selector: string): string | undefined => {
      const el = root.querySelector(selector);
      const c = el?.getAttribute("content");
      return c?.trim() || undefined;
    };

    result.title = root.querySelector("title")?.textContent?.trim() || undefined;
    result.lang = root.querySelector("html")?.getAttribute("lang")?.trim() || undefined;
    result.description = metaContent('meta[name="description"]');
    result.robots = metaContent('meta[name="robots"]');
    result.canonical = abs(root.querySelector('link[rel="canonical"]')?.getAttribute("href"));
    result.h1 = root.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") || undefined;

    result.ogTitle = metaContent('meta[property="og:title"]');
    result.ogDescription = metaContent('meta[property="og:description"]');
    result.ogType = metaContent('meta[property="og:type"]');
    result.ogSiteName = metaContent('meta[property="og:site_name"]');
    result.ogUrl = metaContent('meta[property="og:url"]');

    result.twitterCard = metaContent('meta[name="twitter:card"]');
    result.twitterTitle = metaContent('meta[name="twitter:title"]');
    result.twitterDescription = metaContent('meta[name="twitter:description"]');
    result.twitterSite = metaContent('meta[name="twitter:site"]');

    // Favicon
    const iconEl =
      root.querySelector('link[rel="icon"]') ??
      root.querySelector('link[rel="shortcut icon"]') ??
      root.querySelector('link[rel="apple-touch-icon"]');
    result.favicon = abs(iconEl?.getAttribute("href")) ?? abs("/favicon.ico");

    // Images (og + twitter), deduped, absolute.
    const images: MetaImage[] = [];
    const pushImg = (selector: string, source: string) => {
      for (const el of root.querySelectorAll(selector)) {
        const u = abs(el.getAttribute("content"));
        if (u) images.push({ url: u, source });
      }
    };
    pushImg('meta[property="og:image"]', "og:image");
    pushImg('meta[property="og:image:url"]', "og:image");
    pushImg('meta[name="twitter:image"]', "twitter:image");
    pushImg('meta[name="twitter:image:src"]', "twitter:image");
    // Pair og:image:alt / width / height with the last og:image.
    const ogAlt = metaContent('meta[property="og:image:alt"]');
    const ogW = metaContent('meta[property="og:image:width"]');
    const ogH = metaContent('meta[property="og:image:height"]');
    const firstOg = images.find((i) => i.source === "og:image");
    if (firstOg) {
      if (ogAlt) firstOg.alt = ogAlt;
      if (ogW) firstOg.width = Number(ogW) || undefined;
      if (ogH) firstOg.height = Number(ogH) || undefined;
    }
    const seenImg = new Set<string>();
    result.images = images.filter((i) => (seenImg.has(i.url) ? false : (seenImg.add(i.url), true)));

    // Word count (rough) from body text.
    const bodyText = root.querySelector("body")?.textContent ?? "";
    result.wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;

    // Collect links for the frontier.
    if (this.opts.followLinks) {
      const links: string[] = [];
      for (const a of root.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href");
        if (href) links.push(href);
      }
      result._links = links;
    }
  }

  /** Flag common SEO problems for the dashboard. */
  private analyze(r: PageResult) {
    if (r.error) return;
    if (!r.title) r.issues.push("Missing <title>");
    else if (r.title.length > 60) r.issues.push("Title over 60 chars");
    else if (r.title.length < 15) r.issues.push("Title under 15 chars");

    if (!r.description) r.issues.push("Missing meta description");
    else if (r.description.length > 160) r.issues.push("Description over 160 chars");

    if (!r.canonical) r.issues.push("No canonical URL");
    if (!r.ogTitle && !r.ogDescription) r.issues.push("No Open Graph tags");
    if (r.images.length === 0) r.issues.push("No social preview image");
    if (!r.twitterCard) r.issues.push("No Twitter card");
    if (r.robots && /noindex/i.test(r.robots)) r.issues.push("noindex");
    if (!r.h1) r.issues.push("No <h1>");
  }
}

// Allow stashing links on the result during extraction without a separate type.
declare module "./types.ts" {
  interface PageResult {
    _links?: string[];
  }
}

export function normalizeOrigin(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = new URL(s);
  return u.origin;
}
