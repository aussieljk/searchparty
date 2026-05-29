#!/usr/bin/env bun
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Crawler, normalizeOrigin } from "./src/crawler.ts";
import { Renderer } from "./src/render.ts";
import { makeDataDir, startServer, uiBuilt } from "./src/server.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, "ui", "dist");

const USER_AGENT =
  "Mozilla/5.0 (compatible; SearchPartyBot/0.1; +https://github.com/aussieljk/searchparty)";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let target: string | undefined;
  const flags: Record<string, string> = {};
  for (const a of args) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags[k!] = v ?? "true";
    } else if (!target) {
      target = a;
    }
  }
  return { target, flags };
}

function help() {
  console.log(`
  searchparty — crawl a site and preview every page's SEO + social images live.

  Usage:
    searchparty <domain> [options]

  Examples:
    searchparty veraison.com.au
    searchparty https://example.com --max=50 --no-open

  Options:
    --max=<n>        Max pages to crawl        (default 150)
    --concurrency=<n> Parallel requests        (default 6)
    --port=<n>       Dashboard port            (default 4477, auto-bumps if busy)
    --sitemap-only   Don't follow on-page links, only sitemap + homepage
    --render         Render pages with a headless Chrome (full SPA DOM + screenshots).
                     Needs a local Chrome/Chromium (or PUPPETEER_EXECUTABLE_PATH).
                     Falls back to plain fetch() if unavailable. (default off)
    --no-open        Don't auto-open the browser
`);
}

async function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    /* user can open manually */
  }
}

function pickPort(preferred: number): number {
  for (let p = preferred; p < preferred + 50; p++) {
    try {
      const s = Bun.listen({ hostname: "127.0.0.1", port: p, socket: { data() {} } });
      s.stop();
      return p;
    } catch {
      /* in use, try next */
    }
  }
  return preferred;
}

async function main() {
  const { target, flags } = parseArgs(process.argv);

  if (!target || flags.help || flags.h) {
    help();
    process.exit(target ? 0 : 1);
  }

  if (!uiBuilt(UI_DIR)) {
    console.error(
      "\n  ⚠  Dashboard UI is not built.\n" +
        "     Run `bun run build:ui` inside the searchparty package first.\n",
    );
    process.exit(1);
  }

  let origin: string;
  try {
    origin = normalizeOrigin(target);
  } catch {
    console.error(`  ✖  Invalid domain: ${target}`);
    process.exit(1);
  }

  const render = !!flags.render;
  const startTs = Date.now();
  const host = new URL(origin).host;
  const dataDir = makeDataDir(host, startTs);

  if (render && !Renderer.available()) {
    console.warn(
      "\n  ⚠  --render: no Chrome/Chromium found. Set PUPPETEER_EXECUTABLE_PATH or install Chrome.\n" +
        "     Continuing with plain fetch() (no screenshots).\n",
    );
  }

  const crawler = new Crawler({
    origin,
    maxPages: Number(flags.max) || 150,
    concurrency: Number(flags.concurrency) || 6,
    followLinks: !flags["sitemap-only"],
    userAgent: USER_AGENT,
    render,
    dataDir,
  });

  const port = pickPort(Number(flags.port) || 4477);
  await startServer({ crawler, uiDir: UI_DIR, port, userAgent: USER_AGENT, dataDir });

  const dashUrl = `http://localhost:${port}/?origin=${encodeURIComponent(origin)}`;
  console.log(`\n  🎉  search party for ${origin}`);
  console.log(`  📊  dashboard: ${dashUrl}\n`);

  if (!flags["no-open"]) await openBrowser(dashUrl);

  // Progress in the terminal too.
  crawler.on("event", (e) => {
    if (e.type === "page") {
      const tag = e.page.ok ? "✓" : "✖";
      const issues = e.page.issues.length ? `  (${e.page.issues.length} issues)` : "";
      console.log(`  ${tag} ${e.page.status} ${e.page.finalUrl}${issues}`);
    } else if (e.type === "done") {
      console.log(
        `\n  ✅  done — ${e.stats.scraped} pages, ${e.stats.errors} errors. Dashboard stays live; Ctrl+C to quit.\n`,
      );
    }
  });

  await crawler.start();
  // Keep the process alive so the dashboard remains served.
}

main();
