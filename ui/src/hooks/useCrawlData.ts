import { createContext, useContext } from "react";
import type { CrawlStats, PageResult } from "@/types";

/**
 * Crawl data exposed to feature plugins. Fed by the foundation's <CrawlProvider>
 * (which wraps the existing useCrawl() SSE hook). Feature tabs/details read from
 * here so they never have to wire up their own SSE connection.
 */
export interface CrawlData {
  pages: PageResult[];
  stats: CrawlStats | null;
  /** SSE connection state (foundation/shell use; features rarely need it). */
  connected: boolean;
}

export const CrawlContext = createContext<CrawlData>({
  pages: [],
  stats: null,
  connected: false,
});

export function useCrawlData(): CrawlData {
  return useContext(CrawlContext);
}
