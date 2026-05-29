import type { RouteCtx } from "../routeCtx.ts";
import type { PageResult } from "../types.ts";

/**
 * Site-wide SEO audit. Computes cross-page findings from the crawler snapshot
 * (duplicate titles/descriptions/H1s, missing/conflicting canonicals, redirect
 * chains, error pages, noindex pages, coverage notes) and returns them grouped
 * by severity.
 *
 * Shared (additive) shapes so the UI can mirror them.
 */
export type AuditSeverity = "error" | "warning" | "info";

export interface AuditItem {
  url: string;
  detail: string;
}

export interface AuditGroup {
  group: string;
  severity: AuditSeverity;
  items: AuditItem[];
}

export interface AuditReport {
  done: boolean;
  pageCount: number;
  groups: AuditGroup[];
}

/** Group a list of pages by a derived key, keeping only keys with >1 page. */
function duplicates(
  pages: PageResult[],
  keyOf: (p: PageResult) => string | undefined,
): Map<string, PageResult[]> {
  const byKey = new Map<string, PageResult[]>();
  for (const p of pages) {
    const raw = keyOf(p);
    if (!raw) continue;
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }
  for (const [key, list] of byKey) if (list.length < 2) byKey.delete(key);
  return byKey;
}

function isNoindex(p: PageResult): boolean {
  return /\bnoindex\b/i.test(p.robots ?? "");
}

function buildReport(snapshot: { stats: { done: boolean }; pages: PageResult[] }): AuditReport {
  const pages = snapshot.pages;
  // Only audit successfully-fetched HTML pages for the content checks; status
  // checks (errors/redirects) consider every crawled page.
  const htmlPages = pages.filter(
    (p) => !p.error && (p.contentType?.includes("html") ?? true),
  );
  const groups: AuditGroup[] = [];

  // ---- Duplicate <title> ----
  const dupTitles = duplicates(htmlPages, (p) => p.title);
  if (dupTitles.size) {
    const items: AuditItem[] = [];
    for (const [, list] of dupTitles)
      for (const p of list)
        items.push({ url: p.url, detail: `Duplicate title: "${p.title}"` });
    groups.push({ group: "Duplicate titles", severity: "warning", items });
  }

  // ---- Duplicate meta descriptions ----
  const dupDesc = duplicates(htmlPages, (p) => p.description);
  if (dupDesc.size) {
    const items: AuditItem[] = [];
    for (const [, list] of dupDesc)
      for (const p of list)
        items.push({ url: p.url, detail: `Duplicate description: "${truncate(p.description)}"` });
    groups.push({ group: "Duplicate meta descriptions", severity: "warning", items });
  }

  // ---- Duplicate H1s ----
  const dupH1 = duplicates(htmlPages, (p) => p.h1);
  if (dupH1.size) {
    const items: AuditItem[] = [];
    for (const [, list] of dupH1)
      for (const p of list) items.push({ url: p.url, detail: `Duplicate H1: "${p.h1}"` });
    groups.push({ group: "Duplicate H1s", severity: "info", items });
  }

  // ---- Missing canonical ----
  const missingCanonical = htmlPages.filter((p) => !p.canonical);
  if (missingCanonical.length) {
    groups.push({
      group: "Missing canonical",
      severity: "warning",
      items: missingCanonical.map((p) => ({
        url: p.url,
        detail: "No <link rel=\"canonical\"> on this page",
      })),
    });
  }

  // ---- Conflicting canonicals: same canonical target claimed by pages whose
  // own URL differs, OR canonical that points away from the page's final URL. ----
  const conflicting: AuditItem[] = [];
  // Canonical target -> set of distinct page URLs declaring it.
  const byCanonical = new Map<string, Set<string>>();
  for (const p of htmlPages) {
    if (!p.canonical) continue;
    const target = normalizeUrl(p.canonical, p.finalUrl);
    const set = byCanonical.get(target) ?? new Set<string>();
    set.add(normalizeUrl(p.finalUrl, p.finalUrl));
    byCanonical.set(target, set);
  }
  for (const [target, urls] of byCanonical) {
    if (urls.size > 1) {
      for (const u of urls)
        conflicting.push({
          url: u,
          detail: `Canonical points to ${target}, also claimed by ${urls.size - 1} other page(s)`,
        });
    }
  }
  if (conflicting.length) {
    groups.push({ group: "Conflicting canonicals", severity: "error", items: conflicting });
  }

  // ---- Redirect chains: status 3xx or finalUrl != url ----
  const redirects = pages.filter(
    (p) => (p.status >= 300 && p.status < 400) || (p.finalUrl && p.finalUrl !== p.url),
  );
  if (redirects.length) {
    groups.push({
      group: "Redirects",
      severity: "info",
      items: redirects.map((p) => ({
        url: p.url,
        detail: `${p.status || "→"} redirected to ${p.finalUrl}`,
      })),
    });
  }

  // ---- Error pages: 4xx / 5xx (or fetch error) ----
  const errorPages = pages.filter((p) => p.status >= 400 || (p.error && !p.status));
  if (errorPages.length) {
    groups.push({
      group: "Error pages",
      severity: "error",
      items: errorPages.map((p) => ({
        url: p.url,
        detail: p.error ? `Fetch error: ${p.error}` : `HTTP ${p.status}`,
      })),
    });
  }

  // ---- Noindex pages ----
  const noindex = htmlPages.filter(isNoindex);
  if (noindex.length) {
    groups.push({
      group: "Noindex pages",
      severity: "warning",
      items: noindex.map((p) => ({
        url: p.url,
        detail: `robots: "${p.robots}" — excluded from search index`,
      })),
    });
  }

  // ---- Coverage notes: thin content & missing titles/descriptions ----
  const coverage: AuditItem[] = [];
  for (const p of htmlPages) {
    if (!p.title) coverage.push({ url: p.url, detail: "Missing <title>" });
    if (!p.description) coverage.push({ url: p.url, detail: "Missing meta description" });
    if (typeof p.wordCount === "number" && p.wordCount > 0 && p.wordCount < 100)
      coverage.push({ url: p.url, detail: `Thin content (${p.wordCount} words)` });
  }
  if (coverage.length) {
    groups.push({ group: "Coverage notes", severity: "info", items: coverage });
  }

  return { done: snapshot.stats.done, pageCount: pages.length, groups };
}

function truncate(s?: string, n = 80): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Resolve a (possibly relative) url against a base, drop hash, normalize trailing slash. */
function normalizeUrl(raw: string, base: string): string {
  try {
    const u = new URL(raw, base);
    u.hash = "";
    let out = u.toString();
    if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return raw;
  }
}

export const route = {
  method: "GET" as const,
  path: "/api/audit",
  handler: (_req: Request, _url: URL, ctx: RouteCtx): Response => {
    try {
      const report = buildReport(ctx.crawler.getSnapshot());
      return Response.json(report);
    } catch (err) {
      return Response.json(
        {
          done: false,
          pageCount: 0,
          groups: [],
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }
  },
};

export default route;
