import { describe, expect, test } from "bun:test";
import { parseSitemap } from "../src/crawler.ts";

describe("parseSitemap", () => {
  test("extracts <loc> entries from a urlset sitemap", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://acme.example/</loc></url>
        <url><loc>https://acme.example/about</loc><lastmod>2024-01-01</lastmod></url>
        <url><loc>https://acme.example/contact</loc></url>
      </urlset>`;
    const { locs, isIndex } = parseSitemap(xml);
    expect(isIndex).toBe(false);
    expect(locs).toEqual([
      "https://acme.example/",
      "https://acme.example/about",
      "https://acme.example/contact",
    ]);
  });

  test("trims whitespace/newlines inside <loc>", () => {
    const xml = `<urlset><url><loc>
        https://acme.example/spaced
      </loc></url></urlset>`;
    expect(parseSitemap(xml).locs).toEqual(["https://acme.example/spaced"]);
  });

  test("is case-insensitive on the loc tag", () => {
    const xml = `<URLSET><URL><LOC>https://acme.example/upper</LOC></URL></URLSET>`;
    expect(parseSitemap(xml).locs).toEqual(["https://acme.example/upper"]);
  });

  test("detects a sitemap index and returns nested sitemap URLs", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://acme.example/sitemap-pages.xml</loc></sitemap>
        <sitemap><loc>https://acme.example/sitemap-posts.xml</loc></sitemap>
      </sitemapindex>`;
    const { locs, isIndex } = parseSitemap(xml);
    expect(isIndex).toBe(true);
    expect(locs).toEqual([
      "https://acme.example/sitemap-pages.xml",
      "https://acme.example/sitemap-posts.xml",
    ]);
  });

  test("returns empty for a document with no <loc> entries", () => {
    expect(parseSitemap("<urlset></urlset>").locs).toEqual([]);
    expect(parseSitemap("not xml at all").locs).toEqual([]);
  });
});
