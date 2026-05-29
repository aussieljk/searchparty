import { existsSync } from "node:fs";
import type { Route } from "../routeCtx.ts";

/**
 * On-demand Lighthouse / Core Web Vitals audit for a single URL.
 *
 *   POST /api/lighthouse   body: { url: string }
 *
 * Runs a Lighthouse audit (performance, seo, accessibility, best-practices)
 * against a locally-launched Chrome and returns the category scores plus key
 * CWV metrics (LCP, CLS, TBT).
 *
 * Graceful degradation: the `lighthouse` and `chrome-launcher` packages may NOT
 * be installed (deps are centralized in the foundation), and a local Chrome may
 * not exist. In any of those cases we return `{ available: false, reason }` so
 * the UI can render a clear "unavailable" state instead of erroring.
 *
 * This is slow, so runs are serialized (one at a time) behind a mutex and
 * guarded with a timeout.
 */

/** Common Chrome/Chromium locations to probe (mirrors src/render.ts). */
const CHROME_PATHS = [
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/snap/bin/chromium",
];

function findChrome(): string | null {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

export interface CategoryScore {
  /** 0-100, or null if Lighthouse couldn't score it. */
  score: number | null;
  title: string;
}

export interface CwvMetric {
  /** Numeric value in ms (LCP, TBT) or unitless (CLS). */
  value: number | null;
  /** Human display string, e.g. "2.3 s" or "0.05". */
  display: string;
  /** Lighthouse metric score 0-100 (per-metric), if available. */
  score: number | null;
}

export interface LighthouseResult {
  available: true;
  url: string;
  finalUrl: string;
  fetchedAt: string;
  categories: {
    performance?: CategoryScore;
    seo?: CategoryScore;
    accessibility?: CategoryScore;
    "best-practices"?: CategoryScore;
  };
  metrics: {
    lcp?: CwvMetric;
    cls?: CwvMetric;
    tbt?: CwvMetric;
  };
}

export interface LighthouseUnavailable {
  available: false;
  reason: string;
}

type LighthouseResponse = LighthouseResult | LighthouseUnavailable;

const AUDIT_TIMEOUT_MS = 90_000;

// Serialize audits — Lighthouse is heavy and launches its own Chrome.
let running: Promise<unknown> | null = null;

function pct(score: number | null | undefined): number | null {
  return typeof score === "number" ? Math.round(score * 100) : null;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runAudit(url: string): Promise<LighthouseResponse> {
  // Dynamic imports with fallback so the build typechecks even when the deps
  // are not installed in this (centralized) workspace. The specifiers are held
  // in variables so TypeScript does not statically resolve (and error on) the
  // missing optional modules.
  const importOptional = (spec: string): Promise<unknown> =>
    // biome-ignore lint/suspicious/noExplicitAny: dynamic optional import
    (import(/* @vite-ignore */ spec as any) as Promise<unknown>).catch(() => null);
  // biome-ignore lint/suspicious/noExplicitAny: optional deps, no types available
  const lighthouseMod: any = await importOptional("lighthouse");
  // biome-ignore lint/suspicious/noExplicitAny: optional deps, no types available
  const chromeLauncher: any = await importOptional("chrome-launcher");

  if (!lighthouseMod || !chromeLauncher) {
    return {
      available: false,
      reason: "lighthouse / chrome-launcher are not installed",
    };
  }

  const chromePath = findChrome();
  if (!chromePath) {
    return {
      available: false,
      reason: "no Chrome/Chromium found — set PUPPETEER_EXECUTABLE_PATH or install Chrome",
    };
  }

  const lighthouse = lighthouseMod.default ?? lighthouseMod;

  // biome-ignore lint/suspicious/noExplicitAny: chrome-launcher instance is untyped here
  let chrome: any = null;
  try {
    chrome = await chromeLauncher.launch({
      chromePath,
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });

    const runnerResult = await lighthouse(
      url,
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "seo", "accessibility", "best-practices"],
      },
    );

    const lhr = runnerResult?.lhr;
    if (!lhr) {
      return { available: false, reason: "Lighthouse produced no report" };
    }

    const cats = lhr.categories ?? {};
    const audits = lhr.audits ?? {};

    const cat = (id: string): CategoryScore | undefined => {
      const c = cats[id];
      if (!c) return undefined;
      return { score: pct(c.score), title: c.title ?? id };
    };

    const metric = (id: string): CwvMetric | undefined => {
      const a = audits[id];
      if (!a) return undefined;
      return {
        value: typeof a.numericValue === "number" ? a.numericValue : null,
        display: a.displayValue ?? "—",
        score: pct(a.score),
      };
    };

    return {
      available: true,
      url,
      finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? url,
      fetchedAt: new Date().toISOString(),
      categories: {
        performance: cat("performance"),
        seo: cat("seo"),
        accessibility: cat("accessibility"),
        "best-practices": cat("best-practices"),
      },
      metrics: {
        lcp: metric("largest-contentful-paint"),
        cls: metric("cumulative-layout-shift"),
        tbt: metric("total-blocking-time"),
      },
    };
  } catch (err) {
    return {
      available: false,
      reason: `Lighthouse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    try {
      await chrome?.kill();
    } catch {
      // ignore
    }
  }
}

export const route: Route = {
  method: "POST",
  path: "/api/lighthouse",
  async handler(req) {
    let body: { url?: string };
    try {
      body = (await req.json()) as { url?: string };
    } catch {
      return Response.json({ available: false, reason: "Invalid JSON body" }, { status: 400 });
    }

    const url = body?.url;
    if (!url || typeof url !== "string") {
      return Response.json(
        { available: false, reason: "Missing 'url' in request body" },
        { status: 400 },
      );
    }
    try {
      new URL(url);
    } catch {
      return Response.json({ available: false, reason: "Invalid url" }, { status: 400 });
    }

    // Serialize: wait for any in-flight audit to finish, then run ours.
    const prior = running;
    let resolveSlot: () => void = () => {};
    running = new Promise<void>((res) => {
      resolveSlot = res;
    });
    try {
      if (prior) await prior.catch(() => {});
      const result = await withTimeout(runAudit(url), AUDIT_TIMEOUT_MS, "Lighthouse audit");
      return Response.json(result);
    } catch (err) {
      const unavailable: LighthouseUnavailable = {
        available: false,
        reason: err instanceof Error ? err.message : String(err),
      };
      return Response.json(unavailable);
    } finally {
      resolveSlot();
    }
  },
};

export default route;
