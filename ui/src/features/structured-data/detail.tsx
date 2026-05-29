// ============================================================================
// STRUCTURED DATA detail section — per-page Sheet section showing the technical
// SEO signals gathered by the backend `structured` enricher: JSON-LD blocks,
// hreflang, heading outline, image alt coverage, and the robots.txt verdict.
//
// Degrades gracefully: if `page.structured` is absent (enricher didn't run) it
// renders nothing rather than an empty shell.
// ============================================================================
import { AlertTriangle, Braces, Check, Hash, ShieldCheck, ShieldX, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FeatureDetail } from "@/features/registry";
import { cn } from "@/lib/utils";
import type { PageResult } from "@/types";

// Mirror the backend's additive field on PageResult.
export interface JsonLdBlock {
  types: string[];
  valid: boolean;
  error?: string;
}
export interface HeadingNode {
  level: number;
  text: string;
}
export interface StructuredData {
  jsonLd: JsonLdBlock[];
  hasMicrodata: boolean;
  hreflang: string[];
  hasViewport: boolean;
  hasCharset: boolean;
  headings: HeadingNode[];
  imgTotal: number;
  imgWithAlt: number;
  robotsAllowed?: boolean;
  robotsHasSitemap?: boolean;
  warnings: string[];
}

declare module "@/types" {
  interface PageResult {
    structured?: StructuredData;
  }
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
        ok ? "border-success/30 text-success" : "border-muted-foreground/20 text-muted-foreground",
      )}
    >
      {ok ? <Check size={12} /> : <X size={12} />}
      {label}
    </span>
  );
}

function StructuredSection({ page }: { page: PageResult }) {
  const s = page.structured;
  if (!s) return null;

  const altPct = s.imgTotal > 0 ? Math.round((s.imgWithAlt / s.imgTotal) * 100) : 100;

  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        <Braces size={14} />
        Structured & technical
      </h4>

      {/* Warnings */}
      {s.warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {s.warnings.map((w) => (
            <li
              key={w}
              className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-1.5 text-sm text-warning-foreground"
            >
              <AlertTriangle size={14} className="shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}

      {/* JSON-LD */}
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">
          JSON-LD ({s.jsonLd.length} {s.jsonLd.length === 1 ? "block" : "blocks"})
        </span>
        {s.jsonLd.length === 0 ? (
          <p className="text-muted-foreground/60 text-xs italic">No JSON-LD structured data</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {s.jsonLd.map((b, i) =>
              b.valid ? (
                b.types.map((t) => (
                  <Badge key={`${i}-${t}`} variant="info">
                    {t}
                  </Badge>
                ))
              ) : (
                <Badge key={i} variant="error">
                  invalid JSON-LD
                </Badge>
              ),
            )}
          </div>
        )}
      </div>

      {/* Head signals */}
      <div className="flex flex-wrap gap-1.5">
        <Flag ok={s.hasViewport} label="viewport" />
        <Flag ok={s.hasCharset} label="charset" />
        <Flag ok={s.hasMicrodata} label="microdata" />
        {s.hreflang.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md border border-info/30 px-2 py-0.5 text-info text-xs">
            hreflang: {s.hreflang.length}
          </span>
        )}
      </div>

      {/* robots.txt + alt coverage */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          {s.robotsAllowed === undefined ? (
            <span className="text-muted-foreground text-xs">robots.txt: n/a</span>
          ) : s.robotsAllowed ? (
            <>
              <ShieldCheck size={15} className="text-success" />
              <span>Allowed by robots.txt</span>
            </>
          ) : (
            <>
              <ShieldX size={15} className="text-destructive" />
              <span>Blocked by robots.txt</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Hash size={15} className="text-muted-foreground" />
          <span>
            alt coverage{" "}
            <span
              className={cn(
                "font-mono font-semibold tabular-nums",
                altPct === 100 ? "text-success" : altPct >= 60 ? "text-warning" : "text-destructive",
              )}
            >
              {altPct}%
            </span>{" "}
            <span className="text-muted-foreground text-xs">
              ({s.imgWithAlt}/{s.imgTotal})
            </span>
          </span>
        </div>
      </div>

      {/* Heading outline */}
      {s.headings.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Heading outline</span>
          <ul className="flex flex-col gap-0.5 rounded-lg border p-2 font-mono text-xs">
            {s.headings.slice(0, 20).map((h, i) => (
              <li
                key={i}
                className={cn("truncate", h.level === 1 ? "text-foreground" : "text-muted-foreground")}
                style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
              >
                <span className="text-muted-foreground/50">h{h.level}</span> {h.text}
              </li>
            ))}
            {s.headings.length > 20 && (
              <li className="text-muted-foreground/50">+{s.headings.length - 20} more…</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

export const detail: FeatureDetail = {
  id: "structured-data",
  order: 40,
  Component: StructuredSection,
};
