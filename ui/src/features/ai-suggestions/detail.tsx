// ============================================================================
// FEATURE: AI META SUGGESTIONS — per-page detail section.
//
// Adds an "AI suggestions" section to the page detail Sheet. A button POSTs the
// current metadata to /api/ai/suggest; the response is rendered diff-style
// (current vs suggested) with per-field copy buttons.
//
// Graceful degradation: if the backend returns { available: false } (no
// ANTHROPIC_API_KEY), we render a clear setup hint instead of the generator.
// ============================================================================
import { Check, Copy, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FeatureDetail } from "@/features/registry";
import type { PageResult } from "@/types";

interface AiSuggestion {
  title: string;
  description: string;
  ogImageAlt: string;
  rationale: string;
}

type SuggestResponse =
  | { available: false; reason?: string }
  | { available: true; suggestion: AiSuggestion }
  | { available: true; error: string };

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable"; reason?: string }
  | { kind: "error"; message: string }
  | { kind: "done"; suggestion: AiSuggestion };

function currentOgImageAlt(page: PageResult): string | undefined {
  return page.images.find((i) => i.source === "og:image")?.alt ?? page.images[0]?.alt;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Copy suggestion"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

function CharCount({ len, max }: { len: number; max: number }) {
  const over = len > max;
  return (
    <span className={`font-mono text-[10px] tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
      {len}/{max}
    </span>
  );
}

function DiffRow({
  label,
  current,
  suggested,
  max,
}: {
  label: string;
  current?: string;
  suggested: string;
  max: number;
}) {
  const cur = current?.trim();
  return (
    <div className="flex flex-col gap-1 rounded-lg border px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground text-[11px] uppercase tracking-wide">
          {label}
        </span>
        <CharCount len={suggested.length} max={max} />
      </div>
      <p className="text-muted-foreground text-xs line-through decoration-destructive/50">
        {cur || "(none)"}
      </p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-success-foreground text-sm">{suggested}</p>
        <CopyButton text={suggested} />
      </div>
    </div>
  );
}

function AiSuggestionsDetail({ page }: { page: PageResult }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function generate() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: page.finalUrl,
          title: page.title,
          description: page.description,
          h1: page.h1,
          ogTitle: page.ogTitle,
          ogDescription: page.ogDescription,
          ogImageAlt: currentOgImageAlt(page),
          issues: page.issues,
        }),
      });
      const data = (await res.json()) as SuggestResponse;
      if (!data.available) {
        setState({ kind: "unavailable", reason: data.reason });
      } else if ("error" in data) {
        setState({ kind: "error", message: data.error });
      } else {
        setState({ kind: "done", suggestion: data.suggestion });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          AI suggestions
        </h4>
        {state.kind !== "unavailable" && (
          <Button
            size="sm"
            variant="outline"
            loading={state.kind === "loading"}
            onClick={generate}
          >
            <Sparkles />
            {state.kind === "done" ? "Regenerate" : "Suggest improvements"}
          </Button>
        )}
      </div>

      {state.kind === "idle" && (
        <p className="text-muted-foreground text-sm">
          Generate AI-improved title, meta description, and social image alt text for this page.
          {page.issues.length > 0 && (
            <>
              {" "}
              <span className="text-warning">
                {page.issues.length} issue{page.issues.length === 1 ? "" : "s"} flagged.
              </span>
            </>
          )}
        </p>
      )}

      {state.kind === "unavailable" && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>AI suggestions unavailable</AlertTitle>
          <AlertDescription>
            Set <span className="font-mono">ANTHROPIC_API_KEY</span> in the environment and
            restart searchparty to enable AI meta suggestions.
            {state.reason && <span className="text-xs opacity-80">{state.reason}</span>}
          </AlertDescription>
        </Alert>
      )}

      {state.kind === "error" && (
        <Alert variant="error">
          <TriangleAlert />
          <AlertTitle>Could not generate suggestions</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.kind === "done" && (
        <div className="flex flex-col gap-2">
          <DiffRow label="Title" current={page.title} suggested={state.suggestion.title} max={60} />
          <DiffRow
            label="Meta description"
            current={page.description}
            suggested={state.suggestion.description}
            max={155}
          />
          <DiffRow
            label="og:image alt"
            current={currentOgImageAlt(page)}
            suggested={state.suggestion.ogImageAlt}
            max={120}
          />
          <p className="flex items-start gap-1.5 px-1 text-muted-foreground text-xs">
            <Sparkles className="mt-0.5 size-3 shrink-0" />
            {state.suggestion.rationale}
          </p>
        </div>
      )}
    </section>
  );
}

export const detail: FeatureDetail = {
  id: "ai-suggestions",
  order: 10,
  Component: AiSuggestionsDetail,
};
