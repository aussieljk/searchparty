import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { HTMLElement } from "node-html-parser";
import type { PageResult } from "./types.ts";

/**
 * Context passed to every enricher. Enrichers mutate `ctx.page` in place to add
 * fields (declared additively via `declare module "../types.ts"`). They run AFTER
 * base SEO extraction and BEFORE the page event is emitted.
 *
 * Enrichers MUST be resilient: wrap risky work in try/catch and never throw.
 */
export interface EnricherCtx {
  /** The page result being built. Mutate this in place to add fields. */
  page: PageResult;
  /** Raw HTML of the page (rendered DOM when --render is on, else fetch() body). */
  html: string;
  /** Parsed root node (node-html-parser). */
  root: HTMLElement;
  /** The crawl origin, e.g. https://example.com. */
  origin: string;
  /** User agent string the crawler uses. */
  userAgent: string;
  /** Absolute path to a captured screenshot PNG, if --render produced one. */
  screenshotPath?: string;
}

export type Enricher = (ctx: EnricherCtx) => Promise<void>;

let cached: Enricher[] | null = null;

/** Clear the module-level enricher cache. Exposed for tests. */
export function resetEnricherCache(): void {
  cached = null;
}

/**
 * Dynamically load every `src/enrichers/*.ts` module and return its default
 * export (an Enricher fn). No shared index file — drop a file in the dir and it
 * is picked up. The loaded list is cached after the first call.
 */
export async function loadEnrichers(dir: string): Promise<Enricher[]> {
  if (cached) return cached;
  const enrichers: Enricher[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(
      (f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"),
    );
  } catch {
    // No enrichers dir / unreadable — that's fine, zero enrichers.
    cached = enrichers;
    return enrichers;
  }
  for (const file of files.sort()) {
    try {
      const mod = await import(join(dir, file));
      const fn = mod.default;
      if (typeof fn === "function") enrichers.push(fn as Enricher);
    } catch (err) {
      console.error(`  ⚠  Failed to load enricher ${file}:`, err);
    }
  }
  cached = enrichers;
  return enrichers;
}
