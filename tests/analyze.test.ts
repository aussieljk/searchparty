import { describe, expect, test } from "bun:test";
import { analyzeIssues } from "../src/crawler.ts";
import type { PageResult } from "../src/types.ts";

/** Build a PageResult with sensible, issue-free defaults, overridden per test. */
function page(overrides: Partial<PageResult> = {}): PageResult {
  return {
    url: "https://acme.example/",
    finalUrl: "https://acme.example/",
    depth: 0,
    status: 200,
    ok: true,
    elapsedMs: 10,
    title: "A perfectly reasonable page title",
    description: "A meta description that sits comfortably under the recommended limit.",
    canonical: "https://acme.example/",
    ogTitle: "OG title",
    twitterCard: "summary",
    h1: "Heading",
    images: [{ url: "https://acme.example/og.png", source: "og:image" }],
    issues: [],
    ...overrides,
  };
}

describe("analyzeIssues", () => {
  test("a fully-tagged page has no issues", () => {
    expect(analyzeIssues(page())).toEqual([]);
  });

  test("returns no issues (and does not inspect) when the page errored", () => {
    expect(analyzeIssues(page({ error: "HTTP 500", title: undefined }))).toEqual([]);
  });

  test("flags a missing title", () => {
    expect(analyzeIssues(page({ title: undefined }))).toContain("Missing <title>");
  });

  test("flags an over-long title", () => {
    expect(analyzeIssues(page({ title: "x".repeat(61) }))).toContain("Title over 60 chars");
  });

  test("flags an under-length title", () => {
    expect(analyzeIssues(page({ title: "short" }))).toContain("Title under 15 chars");
  });

  test("flags a missing description", () => {
    expect(analyzeIssues(page({ description: undefined }))).toContain("Missing meta description");
  });

  test("flags an over-long description", () => {
    expect(analyzeIssues(page({ description: "x".repeat(161) }))).toContain(
      "Description over 160 chars",
    );
  });

  test("flags a missing canonical", () => {
    expect(analyzeIssues(page({ canonical: undefined }))).toContain("No canonical URL");
  });

  test("flags missing Open Graph tags only when both title and description are absent", () => {
    expect(analyzeIssues(page({ ogTitle: undefined, ogDescription: undefined }))).toContain(
      "No Open Graph tags",
    );
    expect(analyzeIssues(page({ ogTitle: undefined, ogDescription: "present" }))).not.toContain(
      "No Open Graph tags",
    );
  });

  test("flags no social preview image", () => {
    expect(analyzeIssues(page({ images: [] }))).toContain("No social preview image");
  });

  test("flags a missing twitter card", () => {
    expect(analyzeIssues(page({ twitterCard: undefined }))).toContain("No Twitter card");
  });

  test("flags noindex (case-insensitive)", () => {
    expect(analyzeIssues(page({ robots: "NoIndex, nofollow" }))).toContain("noindex");
  });

  test("flags a missing h1", () => {
    expect(analyzeIssues(page({ h1: undefined }))).toContain("No <h1>");
  });

  test("a bare page accumulates the expected set of issues", () => {
    const issues = analyzeIssues(
      page({
        title: undefined,
        description: undefined,
        canonical: undefined,
        ogTitle: undefined,
        twitterCard: undefined,
        h1: undefined,
        images: [],
      }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        "Missing <title>",
        "Missing meta description",
        "No canonical URL",
        "No Open Graph tags",
        "No social preview image",
        "No Twitter card",
        "No <h1>",
      ]),
    );
  });
});
