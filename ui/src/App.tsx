import { useVirtualizer } from "@tanstack/react-virtual";
import { LayoutGrid, PartyPopper, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageCard } from "@/components/PageCard";
import { PageDetail } from "@/components/PageDetail";
import { StatsBar } from "@/components/StatsBar";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { featureTabs } from "@/features/registry";
import { useCrawlData } from "@/hooks/useCrawlData";
import { displayDescription, displayTitle, previewImage } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { CrawlStats, PageResult } from "@/types";

type Filter = "all" | "issues" | "no-image" | "errors";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "issues", label: "Has issues" },
  { key: "no-image", label: "No image" },
  { key: "errors", label: "Errors" },
];

const PAGES_TAB = "pages";

function matchesFilter(page: PageResult, filter: Filter): boolean {
  switch (filter) {
    case "issues":
      return page.issues.length > 0;
    case "no-image":
      return previewImage(page) === undefined;
    case "errors":
      return !!page.error;
    default:
      return true;
  }
}

export default function App() {
  const { pages, stats, connected } = useCrawlData();
  const [tab, setTab] = useState<string>(PAGES_TAB);
  const [selected, setSelected] = useState<PageResult | null>(null);

  const origin = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get("origin");
    return fromQuery ?? stats?.origin ?? "";
  }, [stats?.origin]);

  // Keep the open detail in sync as its page gets re-scraped/updated.
  const selectedLive = selected ? (pages.find((p) => p.url === selected.url) ?? selected) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-border border-b px-5 py-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-success/15 text-success">
          <PartyPopper size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-base">search party</h1>
            {!connected && stats?.done !== true && (
              <span className="text-muted-foreground text-xs">connecting…</span>
            )}
          </div>
          <p className="truncate text-muted-foreground text-xs">{origin}</p>
        </div>
        {stats && !stats.done && (
          <Badge variant="secondary" className="ml-auto gap-1.5">
            <Spinner aria-hidden className="size-3" />
            scraping
          </Badge>
        )}
      </header>

      <StatsBar stats={stats} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="min-h-0 flex-1">
        <div className="border-border border-b px-5 py-2">
          <TabsList variant="underline">
            <TabsTab value={PAGES_TAB}>
              <LayoutGrid size={15} />
              Pages
            </TabsTab>
            {featureTabs.map((f) => (
              <TabsTab key={f.id} value={f.id}>
                {f.icon}
                {f.label}
              </TabsTab>
            ))}
          </TabsList>
        </div>

        <TabsPanel value={PAGES_TAB}>
          <PagesTab pages={pages} stats={stats} onSelect={setSelected} />
        </TabsPanel>
        {featureTabs.map((f) => (
          <TabsPanel key={f.id} value={f.id}>
            <f.Component />
          </TabsPanel>
        ))}
      </Tabs>

      <PageDetail page={selectedLive} onClose={() => setSelected(null)} />
    </div>
  );
}

function PagesTab({
  pages,
  stats,
  onSelect,
}: {
  pages: PageResult[];
  stats: CrawlStats | null;
  onSelect: (p: PageResult) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) => {
      if (!matchesFilter(p, filter)) return false;
      if (!q) return true;
      return (
        displayTitle(p).toLowerCase().includes(q) ||
        p.finalUrl.toLowerCase().includes(q) ||
        (displayDescription(p) ?? "").toLowerCase().includes(q)
      );
    });
  }, [pages, filter, query]);

  const counts = useMemo(
    () => ({
      all: pages.length,
      issues: pages.filter((p) => p.issues.length > 0).length,
      "no-image": pages.filter((p) => previewImage(p) === undefined).length,
      errors: pages.filter((p) => p.error).length,
    }),
    [pages],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/60",
              )}
            >
              {f.label}
              <span className="font-mono text-xs tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <InputGroup className="sm:w-72">
          <InputGroupInput
            type="search"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search size={15} />
          </InputGroupAddon>
        </InputGroup>
      </div>

      {visible.length === 0 ? (
        <EmptyState hasPages={pages.length > 0} done={stats?.done ?? false} />
      ) : (
        <VirtualGrid pages={visible} onSelect={onSelect} />
      )}
    </div>
  );
}

/**
 * Virtualized responsive card grid — renders only the rows in view so 1000+
 * cards stay smooth. Column count adapts to width (matches the old breakpoints).
 * Scrolls on the window, which is what users expect for a page grid.
 */
function VirtualGrid({
  pages,
  onSelect,
}: {
  pages: PageResult[];
  onSelect: (p: PageResult) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const cols = useColumns(parentRef);
  const rowCount = Math.ceil(pages.length / cols);
  const GAP = 16; // matches gap-4
  const ROW_HEIGHT = 340; // card height + gap, estimate; measured dynamically below

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 4,
  });

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * cols;
          const rowPages = pages.slice(start, start + cols);
          return (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: GAP,
                  paddingBottom: GAP,
                }}
              >
                {rowPages.map((page) => (
                  <PageCard key={page.url} page={page} onClick={() => onSelect(page)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Responsive column count (ResizeObserver on the scroll container). */
function useColumns(ref: React.RefObject<HTMLElement | null>): number {
  const [cols, setCols] = useState(() =>
    colsForWidth(typeof window === "undefined" ? 1280 : window.innerWidth),
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setCols(colsForWidth(entries[0]?.contentRect.width ?? el.clientWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

function colsForWidth(w: number): number {
  if (w >= 1280) return 4;
  if (w >= 1024) return 3;
  if (w >= 640) return 2;
  return 1;
}

function EmptyState({ hasPages, done }: { hasPages: boolean; done: boolean }) {
  if (!hasPages && !done) {
    return (
      <Empty className="mt-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Crawling the site…</EmptyTitle>
          <EmptyDescription>Pages will appear here in realtime as they're scraped.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Empty className="mt-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search aria-hidden />
        </EmptyMedia>
        <EmptyTitle>No matching pages</EmptyTitle>
        <EmptyDescription>Try a different filter or search term.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
