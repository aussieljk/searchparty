import { PartyPopper, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageCard } from "@/components/PageCard";
import { PageDetail } from "@/components/PageDetail";
import { StatsBar } from "@/components/StatsBar";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useCrawl } from "@/hooks/useCrawl";
import { displayDescription, displayTitle, previewImage } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { PageResult } from "@/types";

type Filter = "all" | "issues" | "no-image" | "errors";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "issues", label: "Has issues" },
  { key: "no-image", label: "No image" },
  { key: "errors", label: "Errors" },
];

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
  const { pages, stats, connected } = useCrawl();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PageResult | null>(null);

  const origin = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get("origin");
    return fromQuery ?? stats?.origin ?? "";
  }, [stats?.origin]);

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

  // Keep the open detail in sync as its page gets re-scraped/updated.
  const selectedLive = selected
    ? (pages.find((p) => p.url === selected.url) ?? selected)
    : null;

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
              <span className="font-mono text-xs tabular-nums opacity-70">
                {counts[f.key]}
              </span>
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

      {/* Grid */}
      <main className="flex-1 px-5 pb-10">
        {visible.length === 0 ? (
          <EmptyState hasPages={pages.length > 0} done={stats?.done ?? false} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((page) => (
              <PageCard key={page.url} page={page} onClick={() => setSelected(page)} />
            ))}
          </div>
        )}
      </main>

      <PageDetail page={selectedLive} onClose={() => setSelected(null)} />
    </div>
  );
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
          <EmptyDescription>
            Pages will appear here in realtime as they're scraped.
          </EmptyDescription>
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
