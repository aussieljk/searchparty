// ============================================================================
// FEATURE #7 — PERSISTENCE & CRAWL DIFF (UI)
//
// "History" tab: lists past crawl runs for the current origin (persisted by the
// backend src/routes/history.ts into ~/.searchparty/history.db) and lets you
// pick two runs to compare. Renders added / removed / changed pages clearly.
//
// Empty/first-run state is handled gracefully: the first crawl just shows a
// hint that history accumulates across runs.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, GitCompareArrows, History, MinusCircle, PencilLine, PlusCircle } from "lucide-react";
import type { FeatureTab } from "@/features/registry";
import { useCrawlData } from "@/hooks/useCrawlData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";

// ---- API shapes (mirror src/routes/history.ts) -----------------------------
interface RunRow {
  id: number;
  origin: string;
  timestamp: number;
  pageCount: number;
  issueCount: number;
}

interface StoredPage {
  url: string;
  status: number | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  issueCount: number;
  imageCount: number;
}

type DiffField = "status" | "title" | "description" | "canonical" | "issueCount" | "imageCount";

interface PageFieldChange {
  field: DiffField;
  before: string | number | null;
  after: string | number | null;
}

interface ChangedPage {
  url: string;
  changes: PageFieldChange[];
}

interface HistoryDiff {
  a: { id: number; timestamp: number } | null;
  b: { id: number; timestamp: number } | null;
  added: StoredPage[];
  removed: StoredPage[];
  changed: ChangedPage[];
}

const FIELD_LABEL: Record<DiffField, string> = {
  status: "Status",
  title: "Title",
  description: "Description",
  canonical: "Canonical",
  issueCount: "Issues",
  imageCount: "Images",
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtVal(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return String(v);
}

function HistoryTab() {
  const { stats } = useCrawlData();
  const origin = stats?.origin ?? null;

  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selA, setSelA] = useState<number | null>(null);
  const [selB, setSelB] = useState<number | null>(null);
  const [diff, setDiff] = useState<HistoryDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const loadRuns = useCallback(async () => {
    if (!origin) return;
    try {
      setLoadError(null);
      const res = await fetch(`/api/history/list?origin=${encodeURIComponent(origin)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setLoadError(body?.error ?? `History unavailable (HTTP ${res.status}).`);
        setRuns([]);
        return;
      }
      const data = (await res.json()) as { runs: RunRow[] };
      setRuns(data.runs);
    } catch {
      setLoadError("Could not reach the history endpoint.");
      setRuns([]);
    }
  }, [origin]);

  // Load on mount and whenever a crawl completes (a new run is persisted).
  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);
  useEffect(() => {
    if (stats?.done) void loadRuns();
  }, [stats?.done, loadRuns]);

  // Default the two selectors to the two most recent runs.
  useEffect(() => {
    if (!runs || runs.length < 2) return;
    setSelB((prev) => prev ?? runs[0]!.id);
    setSelA((prev) => prev ?? runs[1]!.id);
  }, [runs]);

  const runCompare = useCallback(async () => {
    if (!origin || selA == null || selB == null) return;
    setDiffLoading(true);
    setDiff(null);
    try {
      const res = await fetch(
        `/api/history/diff?origin=${encodeURIComponent(origin)}&a=${selA}&b=${selB}`,
      );
      if (!res.ok) {
        setDiff(null);
        return;
      }
      setDiff((await res.json()) as HistoryDiff);
    } catch {
      setDiff(null);
    } finally {
      setDiffLoading(false);
    }
  }, [origin, selA, selB]);

  const runById = useMemo(() => {
    const m = new Map<number, RunRow>();
    for (const r of runs ?? []) m.set(r.id, r);
    return m;
  }, [runs]);

  // ---- Render states --------------------------------------------------------
  if (!origin) {
    return (
      <div className="px-5 py-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>No crawl yet</EmptyTitle>
            <EmptyDescription>
              History appears once a crawl has started. Each completed crawl is saved so you can
              compare runs over time.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (runs === null) {
    return (
      <div className="flex items-center justify-center gap-2 px-5 py-16 text-muted-foreground text-sm">
        <Spinner /> Loading history…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <History size={18} />
          <h2 className="font-semibold text-lg">Crawl history</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          Past crawls of <span className="font-mono">{origin}</span>, saved across runs. Pick two to
          compare.
        </p>
      </header>

      {loadError && (
        <div className="rounded-lg border border-warning/40 bg-warning/8 px-4 py-3 text-sm text-warning-foreground">
          {loadError}
        </div>
      )}

      {runs.length === 0 && !loadError ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>No saved runs yet</EmptyTitle>
            <EmptyDescription>
              When this crawl finishes it will be saved here. Run searchparty again later to build up
              a history and diff changes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* ---- Run list ---- */}
          <section className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </div>
            <ScrollArea className="max-h-72">
              <ul className="divide-y">
                {runs.map((r, i) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm tabular-nums"
                  >
                    <span className="w-16 shrink-0 font-mono text-muted-foreground text-xs">
                      #{r.id}
                    </span>
                    <span className="flex-1 truncate">{fmtTime(r.timestamp)}</span>
                    {i === 0 && (
                      <Badge size="sm" variant="secondary">
                        latest
                      </Badge>
                    )}
                    <span className="w-20 shrink-0 text-right text-muted-foreground">
                      {r.pageCount} pages
                    </span>
                    <Badge size="sm" variant={r.issueCount ? "warning" : "success"}>
                      {r.issueCount} issues
                    </Badge>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </section>

          {/* ---- Compare picker ---- */}
          {runs.length < 2 ? (
            <p className="text-muted-foreground text-sm">
              At least two saved runs are needed to compare. Run searchparty again to add another.
            </p>
          ) : (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <RunPicker
                  label="Base (older)"
                  runs={runs}
                  value={selA}
                  onChange={setSelA}
                />
                <ArrowRight className="mb-2.5 text-muted-foreground" size={16} />
                <RunPicker
                  label="Compare (newer)"
                  runs={runs}
                  value={selB}
                  onChange={setSelB}
                />
                <Button
                  className="mb-px"
                  disabled={selA == null || selB == null || selA === selB}
                  loading={diffLoading}
                  onClick={() => void runCompare()}
                  variant="default"
                >
                  <GitCompareArrows size={15} /> Compare
                </Button>
              </div>

              {selA === selB && selA != null && (
                <p className="text-muted-foreground text-sm">Pick two different runs to diff.</p>
              )}

              {diff && (
                <DiffView
                  diff={diff}
                  aRun={diff.a ? runById.get(diff.a.id) ?? null : null}
                  bRun={diff.b ? runById.get(diff.b.id) ?? null : null}
                />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ---- A native <select> styled to match (avoids needing the coss Select API)
function RunPicker({
  label,
  runs,
  value,
  onChange,
}: {
  label: string;
  runs: RunRow[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <select
        className="min-h-9 min-w-56 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none ring-ring/24 transition-shadow focus-visible:border-ring focus-visible:ring-[3px] dark:bg-input/32"
        onChange={(e) => onChange(Number(e.target.value))}
        value={value ?? ""}
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            #{r.id} · {fmtTime(r.timestamp)} · {r.pageCount}p / {r.issueCount}i
          </option>
        ))}
      </select>
    </label>
  );
}

// ---- The diff result --------------------------------------------------------
function DiffView({
  diff,
  aRun,
  bRun,
}: {
  diff: HistoryDiff;
  aRun: RunRow | null;
  bRun: RunRow | null;
}) {
  const { added, removed, changed } = diff;
  const nothing = added.length === 0 && removed.length === 0 && changed.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
        <Badge variant="outline">{aRun ? fmtTime(aRun.timestamp) : `#${diff.a?.id}`}</Badge>
        <ArrowRight size={14} />
        <Badge variant="outline">{bRun ? fmtTime(bRun.timestamp) : `#${diff.b?.id}`}</Badge>
        <span className="ms-2">
          <span className="text-success-foreground">+{added.length}</span>{" "}
          <span className="text-destructive-foreground">−{removed.length}</span>{" "}
          <span className="text-warning-foreground">~{changed.length}</span>
        </span>
      </div>

      {nothing && (
        <div className="rounded-lg border bg-card px-4 py-3 text-muted-foreground text-sm">
          No differences between these two runs.
        </div>
      )}

      {added.length > 0 && (
        <DiffSection
          color="success"
          icon={<PlusCircle size={15} />}
          title={`${added.length} page${added.length === 1 ? "" : "s"} added`}
        >
          {added.map((p) => (
            <li key={p.url} className="truncate px-4 py-2 font-mono text-sm">
              {p.url}
            </li>
          ))}
        </DiffSection>
      )}

      {removed.length > 0 && (
        <DiffSection
          color="destructive"
          icon={<MinusCircle size={15} />}
          title={`${removed.length} page${removed.length === 1 ? "" : "s"} removed`}
        >
          {removed.map((p) => (
            <li key={p.url} className="truncate px-4 py-2 font-mono text-sm">
              {p.url}
            </li>
          ))}
        </DiffSection>
      )}

      {changed.length > 0 && (
        <DiffSection
          color="warning"
          icon={<PencilLine size={15} />}
          title={`${changed.length} page${changed.length === 1 ? "" : "s"} changed`}
        >
          {changed.map((c) => (
            <li key={c.url} className="flex flex-col gap-1.5 px-4 py-3">
              <span className="truncate font-mono text-sm">{c.url}</span>
              <div className="flex flex-col gap-1">
                {c.changes.map((ch) => (
                  <div
                    key={ch.field}
                    className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs"
                  >
                    <Badge size="sm" variant="outline">
                      {FIELD_LABEL[ch.field]}
                    </Badge>
                    <span className="line-through opacity-70">{fmtVal(ch.before)}</span>
                    <ArrowRight size={12} />
                    <span className="text-foreground">{fmtVal(ch.after)}</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </DiffSection>
      )}
    </div>
  );
}

function DiffSection({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  color: "success" | "destructive" | "warning";
  children: React.ReactNode;
}) {
  const tone =
    color === "success"
      ? "text-success-foreground"
      : color === "destructive"
        ? "text-destructive-foreground"
        : "text-warning-foreground";
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div
        className={`flex items-center gap-2 border-b px-4 py-2.5 font-medium text-sm ${tone}`}
      >
        {icon}
        {title}
      </div>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

export const tab: FeatureTab = {
  id: "history",
  label: "History",
  icon: <History size={15} />,
  order: 70,
  Component: HistoryTab,
};
