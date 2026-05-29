# searchparty

CLI that crawls a site and shows every page's SEO + social previews in a live dashboard.
Built as a **plugin system**: foundation is fixed, features are drop-in files
discovered dynamically (no central registry to edit).

## Structure

- `index.ts` — CLI entry (bin). Parses domain/flags, starts server, opens browser. `--render` flag wires the headless renderer.
- `src/crawler.ts` — BFS crawler + SEO/og/twitter extraction (node-html-parser). Runs enrichers, emits events.
- `src/enrich.ts` — `EnricherCtx`/`Enricher` types + `loadEnrichers()` (dynamic-imports `src/enrichers/*.ts`).
- `src/render.ts` — optional headless Chrome (puppeteer-core); used only with `--render` when a browser is found.
- `src/server.ts` — `Bun.serve`: SSE `/api/events`, `/api/state`, `/api/proxy`, `/api/screenshot`, static UI, + `loadRoutes()` mounting `src/routes/*.ts`. Calls each route's `init(ctx)` once at startup.
- `src/routeCtx.ts` — `Route` / `RouteCtx` types.
- `src/types.ts` — shared types (mirrored by hand in `ui/src/types.ts`).
- `ui/` — Vite + React + Tailwind v4 + coss ui dashboard. Built to `ui/dist`, served by the CLI.

## Plugin architecture

Three extension points, all auto-discovered — drop a file, it loads; delete it, it's gone:

- **Enrichers** `src/enrichers/*.ts` — `export default async (ctx: EnricherCtx) => {}`.
  Run after base extraction, mutate `ctx.page` in place. Add fields additively with
  `declare module "../types.ts"`. MUST NOT throw.
- **Routes** `src/routes/*.ts` — `export const route: Route` (or `default`).
  `{ method, path, handler, init? }`. `path` ending in `/*` is a prefix match.
  Use the optional `init(ctx)` hook (called once at startup with the live `RouteCtx`)
  to subscribe to crawler events — e.g. `history.ts` persists on `"done"`. Do NOT
  rely on a request arriving to wire up event listeners (the crawl can finish first).
- **UI features** `ui/src/features/<name>/` — `tab.tsx` (`export const tab: FeatureTab`)
  for a dashboard tab, `detail.tsx` (`export const detail: FeatureDetail`) for a
  per-page Sheet section. Collected via `import.meta.glob` in `features/registry.ts`.

### Current features

Built-in: live page grid, page proxy. Enrichers: imageHealth. Routes: audit, export,
history (sqlite at `~/.searchparty/history.db`), ai (Claude), lighthouse. UI details:
social-cards, image-health, ai-suggestions, lighthouse. UI tabs: site-audit, export, history.

Optional/graceful: AI needs `ANTHROPIC_API_KEY`; Lighthouse + `--render` need a local
Chrome (`PUPPETEER_EXECUTABLE_PATH`/`CHROME_PATH`); Lighthouse also needs the optional
`lighthouse`+`chrome-launcher` deps. All return `{available:false}` / fall back when missing.

## Development

```bash
bun install
bun run build:ui                  # build dashboard (required before running)
bun run index.ts <domain>         # run  (add --render for SPA DOM + screenshots)
bun run typecheck                 # backend tsc
cd ui && bun x tsc --noEmit       # UI tsc
cd ui && bun run build            # UI build
```

coss components live in `ui/src/components/ui/` (added via `bunx shadcn@latest add @coss/<name>`).
Theme tokens are in `ui/src/index.css` (`@coss/colors-neutral`).

## Notes

- The UI must be built (`ui/dist`) before the CLI will run.
- Crawl stays same-host; capped by `--max` (default 150).
- `ui/src/types.ts` mirrors `src/types.ts` by hand; enricher-added fields are
  re-declared in the UI via `declare module "@/types"` where the feature needs them.
