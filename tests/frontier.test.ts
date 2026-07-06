import { describe, expect, test } from "bun:test";
import { filterCrawlUrl, normalizeOrigin } from "../src/crawler.ts";

const ORIGIN = "https://acme.example";
const HOST = "acme.example";
const filter = (raw: string) => filterCrawlUrl(raw, ORIGIN, HOST);

describe("normalizeOrigin", () => {
  test("adds https:// to a bare domain", () => {
    expect(normalizeOrigin("acme.example")).toBe("https://acme.example");
  });

  test("preserves an explicit scheme and strips path/query", () => {
    expect(normalizeOrigin("http://acme.example/some/path?q=1")).toBe("http://acme.example");
  });

  test("keeps a non-default port in the origin", () => {
    expect(normalizeOrigin("acme.example:8080")).toBe("https://acme.example:8080");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeOrigin("  acme.example  ")).toBe("https://acme.example");
  });
});

describe("filterCrawlUrl — accepted URLs", () => {
  test("resolves a relative path to an absolute same-host URL", () => {
    expect(filter("/products/widgets")).toBe("https://acme.example/products/widgets");
  });

  test("accepts an absolute same-host URL", () => {
    expect(filter("https://acme.example/about")).toBe("https://acme.example/about");
  });

  test("strips the fragment/hash", () => {
    expect(filter("/page#section")).toBe("https://acme.example/page");
  });

  test("preserves the query string", () => {
    expect(filter("/search?q=widgets")).toBe("https://acme.example/search?q=widgets");
  });
});

describe("filterCrawlUrl — rejected URLs", () => {
  test("rejects a different host", () => {
    expect(filter("https://external.example/x")).toBeNull();
  });

  test("rejects a subdomain of the same host", () => {
    expect(filter("https://blog.acme.example/x")).toBeNull();
  });

  test("rejects non-http(s) protocols", () => {
    expect(filter("mailto:hi@acme.example")).toBeNull();
    expect(filter("javascript:void(0)")).toBeNull();
    expect(filter("tel:+61000")).toBeNull();
  });

  test("rejects asset extensions", () => {
    for (const asset of [
      "/logo.png",
      "/photo.JPG",
      "/style.css",
      "/app.js",
      "/data.json",
      "/feed.xml",
      "/doc.pdf",
      "/font.woff2",
    ]) {
      expect(filter(asset)).toBeNull();
    }
  });

  test("still crawls asset-looking extensions carried in the query, not the path", () => {
    expect(filter("/page?img=/logo.png")).toBe("https://acme.example/page?img=/logo.png");
  });

  test("returns null for an unparseable URL", () => {
    expect(filterCrawlUrl("http://[bad", ORIGIN, HOST)).toBeNull();
  });
});
