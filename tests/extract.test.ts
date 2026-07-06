import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { extractSeo } from "../src/crawler.ts";

const FIXTURES = join(import.meta.dir, "fixtures");
const readFixture = (name: string) => Bun.file(join(FIXTURES, name)).text();

const BASE = "https://acme.example/products/widgets";

describe("extractSeo — core SEO fields", () => {
  test("pulls and trims title, description, robots, lang", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields.title).toBe("Acme Widgets — Premium Hardware Store");
    expect(fields.description).toBe("Buy premium widgets, gadgets and doohickeys from Acme.");
    expect(fields.robots).toBe("index, follow");
    expect(fields.lang).toBe("en-AU");
  });

  test("collapses whitespace in h1", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields.h1).toBe("Acme Widgets Store");
  });

  test("resolves a relative canonical against finalUrl", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields.canonical).toBe("https://acme.example/products/widgets");
  });

  test("counts body words", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields.wordCount).toBeGreaterThan(5);
  });
});

describe("extractSeo — Open Graph & Twitter", () => {
  test("extracts og:* tags", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields.ogTitle).toBe("Acme Widgets");
    expect(fields.ogDescription).toBe("The finest widgets on the web.");
    expect(fields.ogType).toBe("website");
    expect(fields.ogSiteName).toBe("Acme");
    expect(fields.ogUrl).toBe("https://acme.example/products/widgets");
  });

  test("extracts twitter:* tags", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields.twitterCard).toBe("summary_large_image");
    expect(fields.twitterTitle).toBe("Acme Widgets on Twitter");
    expect(fields.twitterDescription).toBe("Widgets, but make it social.");
    expect(fields.twitterSite).toBe("@acme");
  });
});

describe("extractSeo — images", () => {
  test("collects og + twitter images, dedupes by URL, keeps source", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    const urls = fields.images.map((i) => i.url);
    // og:image and twitter:image share a URL -> single entry; twitter:image:src is distinct.
    expect(urls).toEqual([
      "https://acme.example/og/widgets.png",
      "https://acme.example/og/twitter-only.png",
    ]);
    expect(fields.images[0]!.source).toBe("og:image");
  });

  test("pairs og:image:alt/width/height onto the first og image", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    const og = fields.images.find((i) => i.source === "og:image")!;
    expect(og.alt).toBe("A shiny widget");
    expect(og.width).toBe(1200);
    expect(og.height).toBe(630);
  });

  test("absolutises relative image URLs against finalUrl", () => {
    const html = `<html><head>
      <meta property="og:image" content="/og/rel.png" />
    </head><body></body></html>`;
    const { fields } = extractSeo(html, "https://x.example/deep/page");
    expect(fields.images[0]!.url).toBe("https://x.example/og/rel.png");
  });
});

describe("extractSeo — favicon", () => {
  test("uses the declared icon when present (absolutised)", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields.favicon).toBe("https://acme.example/assets/favicon.png");
  });

  test("falls back to /favicon.ico when no icon link", async () => {
    const { fields } = extractSeo(await readFixture("bare.html"), "https://acme.example/x");
    expect(fields.favicon).toBe("https://acme.example/favicon.ico");
  });
});

describe("extractSeo — links & followLinks", () => {
  test("does not collect links unless followLinks is set", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE);
    expect(fields._links).toBeUndefined();
  });

  test("collects raw hrefs when followLinks is set", async () => {
    const { fields } = extractSeo(await readFixture("rich.html"), BASE, { followLinks: true });
    expect(fields._links).toContain("/products/gadgets");
    expect(fields._links).toContain("https://external.example/x");
    expect(fields._links).toContain("mailto:hi@acme.example");
  });
});

describe("extractSeo — sparse document", () => {
  test("leaves absent fields undefined and images empty", async () => {
    const { fields } = extractSeo(await readFixture("bare.html"), "https://acme.example/x");
    expect(fields.title).toBeUndefined();
    expect(fields.description).toBeUndefined();
    expect(fields.canonical).toBeUndefined();
    expect(fields.ogTitle).toBeUndefined();
    expect(fields.twitterCard).toBeUndefined();
    expect(fields.h1).toBeUndefined();
    expect(fields.images).toEqual([]);
  });

  test("returns a parsed root the caller can query", async () => {
    const { root } = extractSeo(await readFixture("rich.html"), BASE);
    expect(root.querySelectorAll("h1, h2, h3").length).toBe(3);
  });
});
