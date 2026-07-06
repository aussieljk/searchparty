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

## Install

searchparty runs on [Bun](https://bun.sh). Run it without installing:

```bash
bunx searchparty veraison.com.au
```

…or install it globally so `searchparty` is on your PATH:

```bash
bun add -g searchparty
searchparty veraison.com.au
```

> Requires Bun (the CLI ships as TypeScript with a `bun` shebang). The dashboard
> UI is pre-built into the published package — no build step needed.

## Usage

```bash
searchparty <domain> [options]

  --max=<n>          Max pages to crawl          (default 150)
  --concurrency=<n>  Parallel requests           (default 6)
  --port=<n>         Dashboard port              (default 4477, auto-bumps if busy)
  --sitemap-only     Only crawl sitemap + homepage, don't follow links
  --render           Render each page with a headless Chrome — full SPA DOM +
                     screenshots. Needs a local Chrome/Chromium (see below);
                     falls back to plain fetch() if none is found.
  --no-open          Don't auto-open the browser
```

Examples:

```bash
searchparty example.com
searchparty https://example.com --max=50 --sitemap-only
searchparty https://example.com --render          # SPA-aware + screenshots
```

## Features

The dashboard is built from a **plugin architecture** (see below). Out of the
box it ships these features:

1. **Live page grid** _(built-in)_ — virtualized cards stream in as pages are
   scraped; filter by issues / no-image / errors and search.
2. **Social card simulator** _(per-page detail)_ — pixel-accurate share previews
   for Google, X/Twitter, Facebook, LinkedIn, Slack, iMessage and Discord, each
   with that platform's real truncation + inline warnings.
3. **Image health** _(enricher + per-page detail)_ — fetches every og/twitter
   image and measures HTTP status, content-type, byte size and **real pixel
   dimensions**, flagging undersized / wrong-aspect / oversized social images.
4. **Site audit** _(tab)_ — cross-page findings: duplicate titles/descriptions/
   H1s, missing/conflicting canonicals, redirects, error pages, noindex pages,
   thin content, grouped by severity.
5. **Export & reports** _(tab)_ — download the crawl as CSV, JSON, or a
   self-contained styled HTML audit report (`/api/export?format=…`).
6. **History & crawl diff** _(tab)_ — every completed crawl is persisted to a
   SQLite db at `~/.searchparty/history.db`; compare any two runs to see added /
   removed / changed pages.
7. **AI meta suggestions** _(per-page detail, optional)_ — improved title, meta
   description and og:image alt text via Claude. Requires `ANTHROPIC_API_KEY`.
8. **Lighthouse / Core Web Vitals** _(per-page detail, optional)_ — on-demand
   Lighthouse audit (performance/SEO/accessibility/best-practices + LCP/CLS/TBT).
   Requires a local Chrome and the optional `lighthouse` + `chrome-launcher`
   packages.
9. **Headless render** _(`--render`)_ — capture the post-JS DOM and a screenshot
   per page so SPAs and JS-injected meta tags are scraped correctly.
10. **Live page proxy** _(built-in)_ — `/api/proxy` re-serves same-host pages
    with a `<base>` tag and framebusters stripped so previews can be framed.

### Optional requirements (graceful degradation)

These features degrade cleanly — the UI shows an "unavailable" state, the server
never crashes:

- **Local Chrome / Chromium** — needed for `--render` (screenshots + SPA DOM)
  and for the Lighthouse audit. Auto-detected at common install paths, or set
  `PUPPETEER_EXECUTABLE_PATH` (or `CHROME_PATH` for Lighthouse). Without it,
  `--render` falls back to `fetch()` and Lighthouse returns `{available:false}`.
- **`ANTHROPIC_API_KEY`** — enables AI meta suggestions. Unset → the AI panel
  shows a setup hint instead of erroring.
- **`lighthouse` + `chrome-launcher`** — optional npm deps. Not installed →
  Lighthouse returns `{available:false}`.

## Architecture

searchparty is a **plugin system**. The foundation (crawler + server + dashboard
shell) is fixed; every feature is a self-contained file that's discovered and
loaded dynamically — no central registry to edit.

- **Enrichers** — `src/enrichers/*.ts`, each `export default` an
  `(ctx: EnricherCtx) => Promise<void>`. They run after base SEO extraction and
  mutate `ctx.page` in place to add fields (declared additively via
  `declare module "../types.ts"`). Loaded by `loadEnrichers()` in `src/enrich.ts`.
  Enrichers must never throw — a misbehaving one cannot break the crawl.
- **Routes** — `src/routes/*.ts`, each exporting `route` (or `default`) of type
  `Route` (`{ method, path, handler, init? }`). `path` may end in `/*` for prefix
  matching. The optional `init(ctx)` hook runs once at server startup with the
  live `RouteCtx` — use it to subscribe to crawler events (e.g. persist on
  `"done"`). Loaded by `loadRoutes()` in `src/server.ts`.
- **UI features** — `ui/src/features/<name>/`. Drop a `tab.tsx` (`export const
  tab: FeatureTab`) to add a top-level dashboard tab, and/or a `detail.tsx`
  (`export const detail: FeatureDetail`) to append a section to the per-page
  Sheet. Collected via `import.meta.glob` in `ui/src/features/registry.ts`.

To add a feature: drop the file(s) in the right directory — they're picked up
automatically. To remove one: delete the file.

## How it works

- **Crawler** (`src/crawler.ts`) — BFS over same-host links, seeded from
  `sitemap.xml`. Extracts title, description, canonical, robots, h1, Open Graph,
  Twitter cards, favicon, and all preview images. Flags common SEO issues, runs
  enrichers, then emits a `page` event.
- **Server** (`src/server.ts`) — `Bun.serve` that streams crawl events over SSE
  (`/api/events`), serves a full state snapshot (`/api/state`), serves the built
  dashboard, proxies pages (`/api/proxy`), serves screenshots (`/api/screenshot`),
  and mounts all plugin routes.
- **Renderer** (`src/render.ts`) — optional headless Chrome (puppeteer-core),
  reused across pages, only when `--render` is set and a browser is found.
- **Dashboard** (`ui/`) — Vite + React + Tailwind v4 + [coss ui](https://coss.com/ui).

## Development

```bash
bun install          # backend deps
bun run build:ui     # build the dashboard (ui/ -> ui/dist)
bun run index.ts veraison.com.au   # run locally

# Live UI dev (run the CLI on :4477 in one terminal, then):
bun run dev:ui       # vite dev server, proxies /api to the CLI

bun test             # run the test suite (pure SEO/crawl logic, no network)
bun run typecheck    # backend tsc
bun run check:types  # verify ui/src/types.ts is in sync with src/types.ts
```

`ui/src/types.ts` is generated from `src/types.ts` by `bun run sync:types`
(also run automatically as part of `bun run build`), so the shared types never
drift. Edit `src/types.ts`, never the UI copy.

To make the `searchparty` command available globally for local use:

```bash
bun link
```

## Publishing

```bash
npm version patch
npm publish --access public   # prepublishOnly builds the UI
```
