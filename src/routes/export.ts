import type { RouteCtx } from "../routeCtx.ts";
import type { PageResult } from "../types.ts";

/**
 * Export & shareable reports.
 *
 *   GET /api/export?format=csv   -> CSV of all pages
 *   GET /api/export?format=json  -> the full crawler snapshot as JSON
 *   GET /api/export?format=html  -> a self-contained, styled HTML audit report
 *
 * All responses set Content-Disposition: attachment with a sensible filename.
 * The seoScore logic is replicated from ui/src/lib/seo.ts so the report matches
 * what the dashboard shows.
 */

// ---- SEO scoring (mirror of ui/src/lib/seo.ts) -----------------------------

function seoScore(page: PageResult): number {
  if (page.error) return 0;
  let score = 100;
  score -= page.issues.length * 12;
  if (!page.title) score -= 10;
  if (!page.description) score -= 8;
  return Math.max(0, Math.min(100, score));
}

type ScoreTier = "great" | "ok" | "poor";

function scoreTier(score: number): ScoreTier {
  if (score >= 80) return "great";
  if (score >= 50) return "ok";
  return "poor";
}

function previewImage(page: PageResult): string | undefined {
  return page.images.find((i) => i.source === "og:image")?.url ?? page.images[0]?.url;
}

/** Resolve a (possibly relative) image url against the page's final URL. */
function absoluteUrl(raw: string | undefined, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

// ---- Helpers ---------------------------------------------------------------

function originSlug(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/[^a-z0-9.-]/gi, "-") || "site";
  } catch {
    return "site";
  }
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  // Always quote; escape embedded quotes by doubling. Guards against formula
  // injection by prefixing cells that start with =, +, -, @.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attachment(filename: string): string {
  return `attachment; filename="${filename.replace(/"/g, "")}"`;
}

// ---- CSV -------------------------------------------------------------------

function toCsv(pages: PageResult[]): string {
  const header = [
    "url",
    "status",
    "title",
    "description",
    "canonical",
    "images",
    "issues",
    "score",
  ];
  const rows = pages.map((p) =>
    [
      p.finalUrl || p.url,
      p.error ? `ERR ${p.error}` : p.status,
      p.title ?? "",
      p.description ?? "",
      p.canonical ?? "",
      p.images.length,
      p.issues.join("; "),
      seoScore(p),
    ]
      .map(csvCell)
      .join(","),
  );
  // BOM so Excel reads UTF-8 correctly.
  return `﻿${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

// ---- HTML report -----------------------------------------------------------

interface IssueCount {
  issue: string;
  count: number;
}

function issueBreakdown(pages: PageResult[]): IssueCount[] {
  const counts = new Map<string, number>();
  for (const p of pages) {
    for (const issue of p.issues) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count);
}

function thumb(page: PageResult): string {
  const src = absoluteUrl(previewImage(page), page.finalUrl || page.url);
  if (!src) return '<span class="muted">—</span>';
  return `<img class="thumb" src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
}

function tierColor(tier: ScoreTier): string {
  return tier === "great" ? "#34d399" : tier === "ok" ? "#fbbf24" : "#f87171";
}

function toHtml(snapshot: {
  stats: { origin?: string; done: boolean };
  pages: PageResult[];
}): string {
  const pages = snapshot.pages;
  const origin = snapshot.stats.origin ?? "";
  const generatedAt = new Date().toISOString();

  const scored = pages.map((p) => ({ page: p, score: seoScore(p) }));
  const totalPages = pages.length;
  const errorPages = pages.filter((p) => p.error || p.status >= 400).length;
  const okPages = pages.filter((p) => p.ok && !p.error).length;
  const avgScore = totalPages
    ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / totalPages)
    : 0;
  const breakdown = issueBreakdown(pages);
  const totalIssues = breakdown.reduce((sum, b) => sum + b.count, 0);

  const statCard = (label: string, value: string | number, color?: string): string =>
    `<div class="stat"><div class="stat-value"${color ? ` style="color:${color}"` : ""}>${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;

  const issueRows = breakdown.length
    ? breakdown
        .map(
          (b) =>
            `<tr><td>${escapeHtml(b.issue)}</td><td class="num">${b.count}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="muted">No issues flagged 🎉</td></tr>`;

  const pageRows = scored
    .map(({ page, score }) => {
      const tier = scoreTier(score);
      const url = page.finalUrl || page.url;
      const statusLabel = page.error ? `ERR` : String(page.status);
      const statusClass = page.error || page.status >= 400 ? "bad" : "good";
      return `<tr>
        <td>${thumb(page)}</td>
        <td><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>${
          page.error ? `<div class="muted small">${escapeHtml(page.error)}</div>` : ""
        }</td>
        <td><span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
        <td>${escapeHtml(page.title ?? "")}<div class="muted small">${escapeHtml(page.description ?? "")}</div></td>
        <td class="small mono">${escapeHtml(page.canonical ?? "—")}</td>
        <td class="num">${page.issues.length}</td>
        <td class="num"><span class="score" style="color:${tierColor(tier)}">${score}</span></td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SEO audit — ${escapeHtml(origin)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0a0a0b; color: #e5e5e7;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 650; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin: 32px 0 12px; }
  .muted { color: #71717a; }
  .small { font-size: 12px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  a { color: #7dd3fc; text-decoration: none; word-break: break-all; }
  a:hover { text-decoration: underline; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .stat { background: #141416; border: 1px solid #232327; border-radius: 12px; padding: 16px; }
  .stat-value { font-size: 26px; font-weight: 650; }
  .stat-label { color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #141416; border: 1px solid #232327; border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #1f1f23; vertical-align: top; }
  th { background: #18181b; color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .thumb { width: 96px; height: 54px; object-fit: cover; border-radius: 6px; background: #232327; display: block; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge.good { background: rgba(52,211,153,.14); color: #34d399; }
  .badge.bad { background: rgba(248,113,113,.14); color: #f87171; }
  .score { font-weight: 700; font-variant-numeric: tabular-nums; }
  footer { margin-top: 28px; color: #52525b; font-size: 12px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>SEO audit report</h1>
      <div class="muted">${escapeHtml(origin)} · generated ${escapeHtml(generatedAt)}${
        snapshot.stats.done ? "" : " · crawl in progress"
      }</div>
    </header>

    <div class="stats">
      ${statCard("Pages crawled", totalPages)}
      ${statCard("OK pages", okPages, "#34d399")}
      ${statCard("Error pages", errorPages, errorPages ? "#f87171" : undefined)}
      ${statCard("Total issues", totalIssues)}
      ${statCard("Avg. score", avgScore, tierColor(scoreTier(avgScore)))}
    </div>

    <h2>Issues breakdown</h2>
    <table>
      <thead><tr><th>Issue</th><th class="num">Pages affected</th></tr></thead>
      <tbody>${issueRows}</tbody>
    </table>

    <h2>Pages</h2>
    <table>
      <thead><tr>
        <th>Preview</th><th>URL</th><th>Status</th><th>Title / description</th>
        <th>Canonical</th><th class="num">Issues</th><th class="num">Score</th>
      </tr></thead>
      <tbody>${pageRows || `<tr><td colspan="7" class="muted">No pages crawled yet.</td></tr>`}</tbody>
    </table>

    <footer>Generated by searchparty.</footer>
  </div>
</body>
</html>`;
}

// ---- Route -----------------------------------------------------------------

export const route = {
  method: "GET" as const,
  path: "/api/export",
  handler: (_req: Request, url: URL, ctx: RouteCtx): Response => {
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    const slug = originSlug(ctx.origin);
    try {
      const snapshot = ctx.crawler.getSnapshot();
      if (format === "json") {
        return new Response(JSON.stringify(snapshot, null, 2), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": attachment(`searchparty-${slug}.json`),
          },
        });
      }
      if (format === "html") {
        return new Response(toHtml(snapshot), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": attachment(`searchparty-${slug}-report.html`),
          },
        });
      }
      // default: csv
      return new Response(toCsv(snapshot.pages), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": attachment(`searchparty-${slug}.csv`),
        },
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  },
};

export default route;
