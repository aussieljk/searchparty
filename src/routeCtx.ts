import type { Crawler } from "./crawler.ts";

/**
 * Context handed to every dynamically-loaded route module (`src/routes/*.ts`).
 * Route modules may also subscribe to crawler events at import time (e.g. to
 * persist results on "done").
 */
export interface RouteCtx {
  crawler: Crawler;
  /** Normalized crawl origin, e.g. https://example.com. */
  origin: string;
  /** User agent string the crawler uses. */
  userAgent: string;
  /** Per-run data directory (screenshots, sqlite, etc.). Already created. */
  dataDir: string;
}

/**
 * A pluggable HTTP route. Drop a `src/routes/<name>.ts` exporting `route` (or a
 * default export) and the server mounts it automatically.
 *
 * `path` may end in `/*` for prefix matching (e.g. "/api/foo/*").
 */
export interface Route {
  method?: "GET" | "POST";
  /** Exact path, or a "/prefix/*" for prefix matching. */
  path: string;
  handler: (req: Request, url: URL, ctx: RouteCtx) => Response | Promise<Response>;
  /**
   * Optional one-time setup, called by the server at startup with the live
   * RouteCtx (after the crawler exists). Use this to subscribe to crawler events
   * — e.g. to persist results on "done" — instead of relying on a request to
   * arrive first. Must not throw.
   */
  init?: (ctx: RouteCtx) => void;
}
