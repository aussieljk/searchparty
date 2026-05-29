import { useEffect, useRef, useState } from "react";
import type { CrawlEvent, CrawlStats, PageResult } from "@/types";

export interface CrawlState {
  pages: PageResult[];
  stats: CrawlStats | null;
  connected: boolean;
}

/**
 * Subscribes to the CLI's /api/events SSE stream and keeps a live list of
 * scraped pages + crawl stats. The server replays existing state on connect,
 * so this is correct even when the dashboard opens mid-crawl.
 */
export function useCrawl(): CrawlState {
  const [pages, setPages] = useState<PageResult[]>([]);
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [connected, setConnected] = useState(false);
  // Map url -> index so updates are O(1) and stay ordered by discovery.
  const indexRef = useRef(new Map<string, number>());

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      const event: CrawlEvent = JSON.parse(e.data);
      if (event.type === "stats" || event.type === "done") {
        setStats(event.stats);
      } else if (event.type === "page") {
        setPages((prev) => {
          const idx = indexRef.current.get(event.page.url);
          if (idx === undefined) {
            indexRef.current.set(event.page.url, prev.length);
            return [...prev, event.page];
          }
          const next = prev.slice();
          next[idx] = event.page;
          return next;
        });
      }
    };

    return () => es.close();
  }, []);

  return { pages, stats, connected };
}
