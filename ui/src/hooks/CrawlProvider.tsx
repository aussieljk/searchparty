import { useMemo } from "react";
import { CrawlContext } from "@/hooks/useCrawlData";
import { useCrawl } from "@/hooks/useCrawl";

/**
 * Wraps the app and feeds {pages, stats} from the SSE hook into context so
 * feature plugins can read crawl data via useCrawlData().
 */
export function CrawlProvider({ children }: { children: React.ReactNode }) {
  const { pages, stats, connected } = useCrawl();
  const value = useMemo(() => ({ pages, stats, connected }), [pages, stats, connected]);
  return <CrawlContext.Provider value={value}>{children}</CrawlContext.Provider>;
}
