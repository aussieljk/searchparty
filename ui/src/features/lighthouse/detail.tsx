// ============================================================================
// FEATURE #9 — LIGHTHOUSE / CORE WEB VITALS (on-demand, per page)
//
// Per-page detail section with a "Run Lighthouse" button. POSTs the page's URL
// to /api/lighthouse, then renders category score gauges + key CWV metrics.
// If lighthouse / Chrome are unavailable the backend returns { available:false }
// and we render a clear "unavailable — needs Chrome + lighthouse" state.
// ============================================================================
import { useState } from "react";
import { AlertTriangle, Gauge, RotateCw } from "lucide-react";
import type { FeatureDetail } from "@/features/registry";
import type { PageResult } from "@/types";
import { Button } from "@/components/ui/button";

// ---- Response shape (mirrors src/routes/lighthouse.ts) ----------------------
interface CategoryScore {
  score: number | null;
  title: string;
}
interface CwvMetric {
  value: number | null;
  display: string;
  score: number | null;
}
interface LighthouseOk {
  available: true;
  url: string;
  finalUrl: string;
  fetchedAt: string;
  categories: {
    performance?: CategoryScore;
    seo?: CategoryScore;
    accessibility?: CategoryScore;
    "best-practices"?: CategoryScore;
  };
  metrics: { lcp?: CwvMetric; cls?: CwvMetric; tbt?: CwvMetric };
}
interface LighthouseUnavailable {
  available: false;
  reason: string;
}
type LighthouseResponse = LighthouseOk | LighthouseUnavailable;

const CATEGORY_ORDER: Array<keyof LighthouseOk["categories"]> = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
];

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

function scoreStroke(score: number | null): string {
  if (score === null) return "var(--color-muted-foreground)";
  if (score >= 90) return "var(--color-success)";
  if (score >= 50) return "var(--color-warning)";
  return "var(--color-destructive)";
}

/** Circular score gauge (0-100). */
function Gauge100({ score, title }: { score: number | null; title: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="5"
            className="stroke-border"
          />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            stroke={scoreStroke(score)}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-semibold text-sm tabular-nums ${scoreColor(
            score,
          )}`}
        >
          {score === null ? "—" : score}
        </span>
      </div>
      <span className="text-center text-[11px] text-muted-foreground leading-tight">{title}</span>
    </div>
  );
}

function MetricCard({ label, metric }: { label: string; metric?: CwvMetric }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`font-mono font-medium text-sm tabular-nums ${scoreColor(metric?.score ?? null)}`}>
        {metric?.display ?? "—"}
      </span>
    </div>
  );
}

function LighthouseDetail({ page }: { page: PageResult }) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<LighthouseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = page.finalUrl || page.url;

  async function run() {
    setState("running");
    setError(null);
    try {
      const res = await fetch("/api/lighthouse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = (await res.json()) as LighthouseResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setState("done");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          <Gauge size={13} /> Lighthouse / Core Web Vitals
        </h4>
        <Button
          size="sm"
          variant={state === "done" ? "outline" : "default"}
          loading={state === "running"}
          onClick={run}
        >
          {state === "done" ? <RotateCw /> : <Gauge />}
          {state === "running" ? "Auditing…" : state === "done" ? "Re-run" : "Run Lighthouse"}
        </Button>
      </div>

      {state === "idle" && (
        <p className="rounded-lg border px-3 py-2 text-muted-foreground text-sm">
          Run an on-demand Lighthouse audit (performance, accessibility, best practices, SEO) for{" "}
          <span className="break-all font-mono text-xs">{target}</span>. This launches a local
          Chrome and can take up to a minute.
        </p>
      )}

      {state === "running" && (
        <p className="rounded-lg border px-3 py-2 text-muted-foreground text-sm">
          Running audit — this is slow (audits run one at a time)…
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/32 bg-destructive/4 px-3 py-2 text-destructive text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>Request failed: {error}</span>
        </div>
      )}

      {result && result.available === false && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/32 bg-warning/4 px-3 py-2 text-sm text-warning">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Unavailable — needs Chrome + lighthouse installed.
            <span className="mt-0.5 block text-muted-foreground text-xs">{result.reason}</span>
          </span>
        </div>
      )}

      {result && result.available && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2 rounded-lg border px-3 py-3">
            {CATEGORY_ORDER.map((key) => {
              const cat = result.categories[key];
              return (
                <Gauge100
                  key={key}
                  score={cat?.score ?? null}
                  title={cat?.title ?? key}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MetricCard label="LCP" metric={result.metrics.lcp} />
            <MetricCard label="CLS" metric={result.metrics.cls} />
            <MetricCard label="TBT" metric={result.metrics.tbt} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Audited {new Date(result.fetchedAt).toLocaleTimeString()} ·{" "}
            <span className="break-all font-mono">{result.finalUrl}</span>
          </p>
        </div>
      )}
    </section>
  );
}

export const detail: FeatureDetail = {
  id: "lighthouse",
  order: 50,
  Component: LighthouseDetail,
};
