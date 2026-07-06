import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { loadEnrichers, resetEnricherCache, type EnricherCtx } from "../src/enrich.ts";
import imageHealth from "../src/enrichers/imageHealth.ts";
import structured from "../src/enrichers/structured.ts";
import type { PageResult } from "../src/types.ts";

const FIXTURES = join(import.meta.dir, "fixtures");

// ---------------------------------------------------------------------------
// Hard block on the network: any real fetch during the suite is a test bug.
// Enrichers must degrade gracefully when a fetch rejects, and we assert that
// here without ever touching the network.
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async () => {
    throw new Error("network blocked in tests");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function ctxFor(html: string, page: Partial<PageResult> = {}): EnricherCtx {
  const full: PageResult = {
    url: "https://acme.example/",
    finalUrl: "https://acme.example/",
    depth: 0,
    status: 200,
    ok: true,
    elapsedMs: 1,
    images: [],
    issues: [],
    ...page,
  };
  return {
    page: full,
    html,
    root: parse(html),
    // unique origin per call keeps the structured enricher's robots.txt memo from bleeding across tests
    origin: `https://acme-${Math.random().toString(36).slice(2)}.example`,
    userAgent: "test-agent",
  };
}

describe("loadEnrichers — discovery contract", () => {
  beforeEach(() => resetEnricherCache());

  test("loads the real built-in enrichers as callable functions", async () => {
    const fns = await loadEnrichers(join(import.meta.dir, "..", "src", "enrichers"));
    expect(fns.length).toBeGreaterThanOrEqual(2);
    for (const fn of fns) expect(typeof fn).toBe("function");
  });

  test("loads a directory of well-behaved enrichers", async () => {
    const fns = await loadEnrichers(join(FIXTURES, "enrichers-good"));
    expect(fns).toHaveLength(1);
    const page: any = {};
    await fns[0]!({ page } as unknown as EnricherCtx);
    expect(page.__tagged).toBe(true);
  });

  test("skips an enricher that throws at import and one with no default export", async () => {
    // enrichers-mixed has: tagger.ts (good), broken.ts (throws), no-default.ts (no default)
    const fns = await loadEnrichers(join(FIXTURES, "enrichers-mixed"));
    expect(fns).toHaveLength(1); // only the good one survives
  });

  test("returns an empty list for a missing directory (no throw)", async () => {
    const fns = await loadEnrichers(join(FIXTURES, "does-not-exist"));
    expect(fns).toEqual([]);
  });

  test("returns an empty list for an empty directory", async () => {
    const fns = await loadEnrichers(join(FIXTURES, "enrichers-empty"));
    expect(fns).toEqual([]);
  });
});

describe("imageHealth enricher — resilience", () => {
  test("no-ops (and does no fetch) when the page has no images", async () => {
    const ctx = ctxFor("<html></html>", { images: [] });
    await imageHealth(ctx); // must not throw
    expect(ctx.page.imageHealth).toBeUndefined();
  });

  test("records a failure instead of throwing when the image fetch rejects", async () => {
    const ctx = ctxFor("<html></html>", {
      images: [{ url: "https://acme.example/og.png", source: "og:image" }],
    });
    await imageHealth(ctx); // fetch is mocked to reject
    expect(ctx.page.imageHealth).toHaveLength(1);
    const health = ctx.page.imageHealth![0]!;
    expect(health.ok).toBe(false);
    expect(health.error).toBeDefined();
    expect(health.warnings.length).toBeGreaterThan(0);
  });
});

describe("structured enricher — extraction + resilience", () => {
  test("does not throw and still populates structured data when robots.txt is unreachable", async () => {
    const ctx = ctxFor(await Bun.file(join(FIXTURES, "rich.html")).text());
    await structured(ctx); // fetch (robots.txt) mocked to reject
    expect(ctx.page.structured).toBeDefined();
    // robots.txt couldn't be fetched -> verdict undefined, but the pass still completes.
    expect(ctx.page.structured!.robotsAllowed).toBeUndefined();
  });

  test("parses JSON-LD blocks, flagging valid and invalid ones", async () => {
    const ctx = ctxFor(await Bun.file(join(FIXTURES, "rich.html")).text());
    await structured(ctx);
    const s = ctx.page.structured!;
    expect(s.jsonLd.some((b) => b.valid && b.types.includes("Product"))).toBe(true);
    expect(s.jsonLd.some((b) => !b.valid)).toBe(true);
    expect(s.warnings).toContain("Invalid JSON-LD block");
  });

  test("builds a heading outline and measures image alt coverage", async () => {
    const ctx = ctxFor(await Bun.file(join(FIXTURES, "rich.html")).text());
    await structured(ctx);
    const s = ctx.page.structured!;
    expect(s.headings.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(s.imgTotal).toBe(2);
    expect(s.imgWithAlt).toBe(1);
    expect(s.warnings).toContain("1/2 images missing alt");
  });

  test("never throws even on empty/garbage input", async () => {
    const ctx = ctxFor("");
    await structured(ctx);
    expect(ctx.page.structured).toBeDefined();
  });
});
