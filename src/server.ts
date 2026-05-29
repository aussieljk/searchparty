import { existsSync } from "node:fs";
import { join } from "node:path";
import { Crawler } from "./crawler.ts";
import type { CrawlEvent } from "./types.ts";

export interface ServeOptions {
  crawler: Crawler;
  uiDir: string;
  port: number;
  userAgent: string;
}

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
};

export function startServer(opts: ServeOptions) {
  const { crawler, uiDir } = opts;
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

  return Bun.serve({
    port: opts.port,
    idleTimeout: 0,
    async fetch(req, server) {
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

      // ---- Static UI ----
      return serveStatic(path, uiDir);
    },
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
