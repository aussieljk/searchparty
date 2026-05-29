import { existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Browser } from "puppeteer-core";

/** Common Chrome/Chromium locations to probe when no env var is set. */
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
  const env = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return env;
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

export interface RenderResult {
  renderedHtml: string;
  screenshotPath: string;
}

/**
 * Headless renderer that reuses a single Chrome instance across pages. Locates a
 * local Chrome via PUPPETEER_EXECUTABLE_PATH then common paths. If no browser is
 * found or launch fails, every render() returns null (graceful — the crawler
 * falls back to fetch()).
 */
export class Renderer {
  private browser: Browser | null = null;
  private launchAttempted = false;
  private launchFailed = false;
  private readonly screenshotDir: string;
  private readonly userAgent: string;

  constructor(opts: { dataDir: string; userAgent: string }) {
    this.screenshotDir = join(opts.dataDir, "screenshots");
    this.userAgent = opts.userAgent;
  }

  /** True if a Chrome binary could be located (does not launch). */
  static available(): boolean {
    return findChrome() !== null;
  }

  private async ensureBrowser(): Promise<Browser | null> {
    if (this.browser) return this.browser;
    if (this.launchFailed) return null;
    if (this.launchAttempted && !this.browser) return null;
    this.launchAttempted = true;

    const executablePath = findChrome();
    if (!executablePath) {
      this.launchFailed = true;
      console.error(
        "  ⚠  --render: no Chrome/Chromium found. Set PUPPETEER_EXECUTABLE_PATH or install Chrome. Falling back to fetch().",
      );
      return null;
    }

    try {
      const puppeteer = await import("puppeteer-core");
      mkdirSync(this.screenshotDir, { recursive: true });
      this.browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      return this.browser;
    } catch (err) {
      this.launchFailed = true;
      this.browser = null;
      console.error(
        `  ⚠  --render: failed to launch Chrome (${err instanceof Error ? err.message : err}). Falling back to fetch().`,
      );
      return null;
    }
  }

  /**
   * Render a URL and capture a screenshot. Returns null when no browser is
   * available or anything fails (caller falls back to fetch()).
   */
  async render(url: string): Promise<RenderResult | null> {
    const browser = await this.ensureBrowser();
    if (!browser) return null;

    let page;
    try {
      page = await browser.newPage();
      await page.setUserAgent(this.userAgent);
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });

      const renderedHtml = await page.content();

      const id = createHash("sha1").update(url).digest("hex").slice(0, 16);
      const screenshotPath = join(this.screenshotDir, `${id}.png`);
      await page.screenshot({ path: screenshotPath as `${string}.png`, fullPage: false });

      return { renderedHtml, screenshotPath };
    } catch (err) {
      console.error(
        `  ⚠  --render: failed to render ${url} (${err instanceof Error ? err.message : err}).`,
      );
      return null;
    } finally {
      try {
        await page?.close();
      } catch {}
    }
  }

  /** Map a URL to its screenshot id (used by the screenshot route / PageResult). */
  static screenshotId(url: string): string {
    return createHash("sha1").update(url).digest("hex").slice(0, 16);
  }

  async close(): Promise<void> {
    try {
      await this.browser?.close();
    } catch {}
    this.browser = null;
  }
}
