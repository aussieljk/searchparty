# searchparty

CLI that crawls a site and shows every page's SEO + social previews in a live dashboard.

## Structure

- `index.ts` — CLI entry (bin). Parses domain/flags, starts server, opens browser.
- `src/crawler.ts` — BFS crawler + SEO/og/twitter extraction (node-html-parser). Emits events.
- `src/server.ts` — `Bun.serve`: SSE `/api/events`, `/api/state`, page `/api/proxy`, static UI.
- `src/types.ts` — shared types (mirrored in `ui/src/types.ts`).
- `ui/` — Vite + React + Tailwind v4 + coss ui dashboard. Built to `ui/dist`, served by the CLI.

## Development

```bash
bun install
bun run build:ui                  # build dashboard (required before running)
bun run index.ts <domain>         # run
bun run typecheck                 # backend tsc
```

coss components live in `ui/src/components/ui/` (added via `bunx shadcn@latest add @coss/<name>`).
Theme tokens are in `ui/src/index.css` (`@coss/colors-neutral`).

## Notes

- The UI must be built (`ui/dist`) before the CLI will run.
- Crawl stays same-host; capped by `--max` (default 150).
