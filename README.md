# searchparty

Crawl a website and preview **every page's SEO metadata and social images** in a
realtime dashboard, as they're scraped.

```bash
bun x searchparty veraison.com.au
```

This crawls the site (sitemap + on-page links), starts a local dashboard, and
opens it in your browser. Page cards stream in live — each shows the og:image
preview, title, description, HTTP status, and an SEO score. Click any card for a
full breakdown: live page render, every social image, all Open Graph / Twitter /
SEO tags, and flagged issues.

## Usage

```bash
searchparty <domain> [options]

  --max=<n>          Max pages to crawl          (default 150)
  --concurrency=<n>  Parallel requests           (default 6)
  --port=<n>         Dashboard port              (default 4477, auto-bumps if busy)
  --sitemap-only     Only crawl sitemap + homepage, don't follow links
  --no-open          Don't auto-open the browser
```

Examples:

```bash
searchparty example.com
searchparty https://example.com --max=50 --sitemap-only
```

## How it works

- **Crawler** (`src/crawler.ts`) — BFS over same-host links, seeded from
  `sitemap.xml`. Extracts title, description, canonical, robots, h1, Open Graph,
  Twitter cards, favicon, and all preview images. Flags common SEO issues.
- **Server** (`src/server.ts`) — `Bun.serve` that streams crawl events over SSE
  (`/api/events`), serves the built dashboard, and proxies pages (`/api/proxy`)
  so live previews can be framed.
- **Dashboard** (`ui/`) — Vite + React + Tailwind v4 + [coss ui](https://coss.com/ui).

## Development

```bash
bun install          # backend deps
bun run build:ui     # build the dashboard (ui/ -> ui/dist)
bun run index.ts veraison.com.au   # run locally

# Live UI dev (run the CLI on :4477 in one terminal, then):
bun run dev:ui       # vite dev server, proxies /api to the CLI
```

To make the `searchparty` command available globally for local use:

```bash
bun link
```

## Publishing

```bash
npm version patch
npm publish --access public   # prepublishOnly builds the UI
```
