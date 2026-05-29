// ============================================================================
// STRUCTURED DATA & TECHNICAL SEO enricher — extracts and validates the
// machine-readable / technical signals that the base SEO pass doesn't cover:
//   • JSON-LD blocks (parsed, @type captured, parse errors flagged)
//   • hreflang alternates
//   • meta viewport + charset presence
//   • heading outline (h1–h3) with hierarchy + multiple-h1 warnings
//   • image alt-text coverage
//   • robots.txt: whether this page's path is allowed + sitemap declared
//     (fetched once per origin and memoized)
// Additive: results land on `page.structured`. Resilient by contract.
// ============================================================================
import type { EnricherCtx } from "../enrich.ts";

export interface JsonLdBlock {
  /** schema.org @type(s) found in the block ("(unknown)" if absent). */
  types: string[];
  /** True when the block parsed as valid JSON. */
  valid: boolean;
  /** Parse error message when invalid. */
  error?: string;
}

export interface HeadingNode {
  level: number; // 1–3
  text: string;
}

export interface StructuredData {
  jsonLd: JsonLdBlock[];
  /** Has any microdata (itemscope) markup. */
  hasMicrodata: boolean;
  /** hreflang values from <link rel="alternate" hreflang="…">. */
  hreflang: string[];
  hasViewport: boolean;
  hasCharset: boolean;
  /** Ordered h1–h3 outline. */
  headings: HeadingNode[];
  /** Count of <img> and how many have non-empty alt. */
  imgTotal: number;
  imgWithAlt: number;
  /** robots.txt verdict for this page (undefined if robots.txt unavailable). */
  robotsAllowed?: boolean;
  /** robots.txt declared at least one Sitemap:. */
  robotsHasSitemap?: boolean;
  /** Issues flagged for the dashboard. */
  warnings: string[];
}

declare module "../types.ts" {
  interface PageResult {
    /** Structured data + technical SEO, added by the structured enricher. */
    structured?: StructuredData;
  }
}

/** Parsed robots.txt: disallow rules for the generic (*) agent + sitemap flag. */
interface RobotsInfo {
  disallow: string[];
  hasSitemap: boolean;
}

// One robots.txt fetch per origin, shared across all pages of a crawl.
const robotsCache = new Map<string, Promise<RobotsInfo | null>>();

function fetchRobots(origin: string, userAgent: string): Promise<RobotsInfo | null> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  const p = (async (): Promise<RobotsInfo | null> => {
    try {
      const res = await fetch(origin + "/robots.txt", {
        headers: { "user-agent": userAgent },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const text = await res.text();
      const disallow: string[] = [];
      let hasSitemap = false;
      // Only honour rules in the generic `User-agent: *` group (good enough for
      // a dashboard signal — not a full robots.txt engine).
      let inStar = false;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, "").trim();
        if (!line) continue;
        const [field, ...rest] = line.split(":");
        const key = field?.trim().toLowerCase();
        const value = rest.join(":").trim();
        if (key === "user-agent") inStar = value === "*";
        else if (key === "sitemap") hasSitemap = true;
        else if (key === "disallow" && inStar && value) disallow.push(value);
      }
      return { disallow, hasSitemap };
    } catch {
      return null;
    }
  })();
  robotsCache.set(origin, p);
  return p;
}

function pathAllowed(pathname: string, robots: RobotsInfo): boolean {
  // Longest matching Disallow prefix wins; any match = blocked.
  return !robots.disallow.some((rule) => pathname.startsWith(rule));
}

export default async function structured(ctx: EnricherCtx): Promise<void> {
  try {
    const { root, page } = ctx;
    const warnings: string[] = [];

    // --- JSON-LD ---
    const jsonLd: JsonLdBlock[] = [];
    for (const el of root.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = el.textContent?.trim();
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        const types = new Set<string>();
        const collect = (node: unknown) => {
          if (Array.isArray(node)) return node.forEach(collect);
          if (node && typeof node === "object") {
            const t = (node as Record<string, unknown>)["@type"];
            if (typeof t === "string") types.add(t);
            else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
            const graph = (node as Record<string, unknown>)["@graph"];
            if (graph) collect(graph);
          }
        };
        collect(data);
        jsonLd.push({ types: types.size ? [...types] : ["(unknown)"], valid: true });
      } catch (err) {
        jsonLd.push({ types: [], valid: false, error: err instanceof Error ? err.message : "parse error" });
        warnings.push("Invalid JSON-LD block");
      }
    }

    // --- microdata / hreflang / head signals ---
    const hasMicrodata = root.querySelector("[itemscope]") != null;
    const hreflang = root
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .map((el) => el.getAttribute("hreflang")?.trim())
      .filter((v): v is string => !!v);
    const hasViewport = root.querySelector('meta[name="viewport"]') != null;
    const hasCharset =
      root.querySelector("meta[charset]") != null ||
      root.querySelector('meta[http-equiv="Content-Type" i]') != null;

    // --- heading outline (h1–h3) ---
    const headings: HeadingNode[] = [];
    for (const el of root.querySelectorAll("h1, h2, h3")) {
      const level = Number(el.tagName.slice(1));
      const text = el.textContent?.trim().replace(/\s+/g, " ") ?? "";
      if (text) headings.push({ level, text: text.slice(0, 120) });
    }
    const h1Count = headings.filter((h) => h.level === 1).length;
    if (h1Count === 0) warnings.push("No <h1>");
    if (h1Count > 1) warnings.push(`Multiple <h1> (${h1Count})`);
    // Hierarchy skip: an h3 with no preceding h2, etc.
    let prev = 0;
    for (const h of headings) {
      if (prev && h.level > prev + 1) {
        warnings.push(`Heading jumps h${prev}→h${h.level}`);
        break;
      }
      prev = h.level;
    }

    // --- image alt coverage ---
    const imgs = root.querySelectorAll("img");
    const imgTotal = imgs.length;
    const imgWithAlt = imgs.filter((el) => (el.getAttribute("alt")?.trim() ?? "") !== "").length;
    if (imgTotal > 0 && imgWithAlt < imgTotal) {
      warnings.push(`${imgTotal - imgWithAlt}/${imgTotal} images missing alt`);
    }
    if (!hasViewport) warnings.push("No viewport meta");

    // --- robots.txt ---
    let robotsAllowed: boolean | undefined;
    let robotsHasSitemap: boolean | undefined;
    const robots = await fetchRobots(ctx.origin, ctx.userAgent);
    if (robots) {
      robotsHasSitemap = robots.hasSitemap;
      try {
        robotsAllowed = pathAllowed(new URL(page.finalUrl).pathname, robots);
      } catch {
        /* leave undefined */
      }
      if (robotsAllowed === false) warnings.push("Blocked by robots.txt");
    }

    page.structured = {
      jsonLd,
      hasMicrodata,
      hreflang,
      hasViewport,
      hasCharset,
      headings,
      imgTotal,
      imgWithAlt,
      robotsAllowed,
      robotsHasSitemap,
      warnings,
    };
  } catch {
    // Resilient by contract — never throw out of an enricher.
  }
}
