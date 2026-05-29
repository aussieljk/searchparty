import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Crawler } from "./crawler.ts";
import type { Route, RouteCtx } from "./routeCtx.ts";
import type { CrawlEvent } from "./types.ts";

export interface ServeOptions {
  crawler: Crawler;
  uiDir: string;
  port: number;
  userAgent: string;
  /** Per-run data dir (screenshots etc.). Defaults to a tmp dir per host+start. */
  dataDir?: string;
}

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), "routes");

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
};

/** Create (and return) the per-run data directory. */
export function makeDataDir(host: string, startTs: number): string {
  const dir = join(tmpdir(), "searchparty", `${host}-${startTs}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

interface LoadedRoute extends Route {
  prefix?: string; // set when path ends with /*
}

/** Dynamically load every src/routes/*.ts and normalize prefix matching. */
async function loadRoutes(dir: string): Promise<LoadedRoute[]> {
  const routes: LoadedRoute[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(
      (f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"),
    );
  } catch {
    return routes;
  }
  for (const file of files.sort()) {
    try {
      const mod = await import(join(dir, file));
      const r: Route | undefined = mod.route ?? mod.default;
      if (!r || typeof r.handler !== "function" || !r.path) continue;
      const loaded: LoadedRoute = {
        method: r.method ?? "GET",
        path: r.path,
        handler: r.handler,
        init: r.init,
      };
      if (r.path.endsWith("/*")) loaded.prefix = r.path.slice(0, -1); // keep trailing slash
      routes.push(loaded);
    } catch (err) {
      console.error(`  ⚠  Failed to load route ${file}:`, err);
    }
  }
  return routes;
}

export async function startServer(opts: ServeOptions) {
  const { crawler, uiDir } = opts;
  const dataDir =
    opts.dataDir ?? makeDataDir(crawler.host, crawler.getSnapshot().stats.startedAt || Date.now());

  const clients = new Set<ReadableStreamDefaultController>();
  const encoder = new TextEncoder();

  const broadcast = (event: CrawlEvent) => {
    const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const c of clients) {
      try {
        c.enqueue(chunk);
      } catch {
        clients.delete(c);
      }
    }
  };
  crawler.on("event", broadcast);

  // Plugin routes. Modules may subscribe to crawler events at import time.
  const ctx: RouteCtx = { crawler, origin: crawler.origin, userAgent: opts.userAgent, dataDir };
  const routes = await loadRoutes(ROUTES_DIR);

  // One-time route setup (e.g. subscribe to crawler events to persist on "done").
  for (const r of routes) {
    if (typeof r.init === "function") {
      try {
        r.init(ctx);
      } catch (err) {
        console.error(`  ⚠  Route init failed for ${r.path}:`, err);
      }
    }
  }

  const matchRoute = (method: string, path: string): LoadedRoute | undefined => {
    for (const r of routes) {
      if ((r.method ?? "GET") !== method) continue;
      if (r.prefix) {
        if (path.startsWith(r.prefix)) return r;
      } else if (r.path === path) {
        return r;
      }
    }
    return undefined;
  };

  return Bun.serve({
    port: opts.port,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // ---- Realtime event stream ----
      if (path === "/api/events") {
        const stream = new ReadableStream({
          start(controller) {
            clients.add(controller);
            // Replay current state so a fresh client is immediately in sync.
            const snap = crawler.getSnapshot();
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "stats", stats: snap.stats })}\n\n`),
            );
            for (const page of snap.pages) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "page", page })}\n\n`),
              );
            }
          },
          cancel(controller) {
            clients.delete(controller as ReadableStreamDefaultController);
          },
        });
        return new Response(stream, { headers: SSE_HEADERS });
      }

      // ---- Full state snapshot (REST fallback) ----
      if (path === "/api/state") {
        return Response.json(crawler.getSnapshot());
      }

      // ---- Proxy a page so it can be framed (bypasses X-Frame-Options) ----
      if (path === "/api/proxy") {
        return proxyPage(url.searchParams.get("url"), crawler.host, opts.userAgent);
      }

      // ---- Built-in: serve captured screenshots from the data dir ----
      if (path === "/api/screenshot") {
        return serveScreenshot(url.searchParams.get("id"), dataDir);
      }

      // ---- Plugin routes (src/routes/*.ts) ----
      const route = matchRoute(req.method, path);
      if (route) {
        try {
          return await route.handler(req, url, ctx);
        } catch (err) {
          return new Response(`Route error: ${err instanceof Error ? err.message : err}`, {
            status: 500,
          });
        }
      }

      // ---- Static UI ----
      return serveStatic(path, uiDir);
    },
  });
}

async function serveScreenshot(id: string | null, dataDir: string): Promise<Response> {
  if (!id || !/^[a-f0-9]{1,64}$/i.test(id)) return new Response("Bad id", { status: 400 });
  const file = Bun.file(join(dataDir, "screenshots", `${id}.png`));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: { "content-type": "image/png", "cache-control": "no-cache" },
  });
}

async function proxyPage(target: string | null, host: string, userAgent: string): Promise<Response> {
  if (!target) return new Response("Missing url", { status: 400 });
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (u.host !== host) return new Response("Cross-host proxying is not allowed", { status: 403 });

  try {
    const res = await fetch(u, {
      headers: { "user-agent": userAgent },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const ct = res.headers.get("content-type") ?? "text/html";
    if (!/text\/html|application\/xhtml/i.test(ct)) {
      // Pass binary/other through untouched (e.g. an og image).
      return new Response(res.body, { headers: { "content-type": ct } });
    }
    let html = await res.text();
    // Inject <base> so relative assets resolve, and strip framebusters.
    const baseTag = `<base href="${u.toString()}">`;
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
    } else {
      html = baseTag + html;
    }
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`Proxy error: ${err instanceof Error ? err.message : err}`, {
      status: 502,
    });
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

async function serveStatic(path: string, uiDir: string): Promise<Response> {
  let rel = path === "/" ? "/index.html" : path;
  const filePath = join(uiDir, rel);
  // Prevent path traversal.
  if (!filePath.startsWith(uiDir)) return new Response("Forbidden", { status: 403 });

  let file = Bun.file(filePath);
  if (!(await file.exists())) {
    // SPA fallback to index.html.
    file = Bun.file(join(uiDir, "index.html"));
    if (!(await file.exists())) {
      return new Response("UI not built. Run `bun run build:ui` in the searchparty package.", {
        status: 404,
      });
    }
    rel = "/index.html";
  }
  const ext = rel.slice(rel.lastIndexOf("."));
  return new Response(file, { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
}

export function uiBuilt(uiDir: string): boolean {
  return existsSync(join(uiDir, "index.html"));
}
