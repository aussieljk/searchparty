// ============================================================================
// IMAGE HEALTH detail section — per-page Sheet section showing each social /
// preview image with its measured pixel size, file size, HTTP status and any
// warnings flagged by the backend `imageHealth` enricher.
//
// Degrades gracefully: if `page.imageHealth` is absent (enricher didn't run, or
// the page has no images) it renders a clear "unavailable" note.
// ============================================================================
import { AlertTriangle, CheckCircle2, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FeatureDetail } from "@/features/registry";
import type { PageResult } from "@/types";

/** Measured health of one preview image (mirrors backend ImageHealth). */
export interface ImageHealth {
  url: string;
  status: number;
  contentType?: string;
  bytes?: number;
  width?: number;
  height?: number;
  ok: boolean;
  warnings: string[];
  error?: string;
}

// Mirror the backend's additive field on PageResult.
declare module "@/types" {
  interface PageResult {
    imageHealth?: ImageHealth[];
  }
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusBadge(h: ImageHealth) {
  if (h.error) return <Badge variant="error">failed</Badge>;
  if (h.ok) {
    return (
      <Badge variant="success">
        <CheckCircle2 /> {h.status}
      </Badge>
    );
  }
  const variant = h.status >= 200 && h.status < 300 ? "warning" : "error";
  return <Badge variant={variant}>{h.status || "ERR"}</Badge>;
}

function ImageHealthDetail({ page }: { page: PageResult }) {
  const health = page.imageHealth;

  if (page.images.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <Header />
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-muted-foreground text-sm">
          <ImageOff size={15} /> No social preview images on this page.
        </div>
      </section>
    );
  }

  if (!health) {
    return (
      <section className="flex flex-col gap-2">
        <Header />
        <div className="rounded-lg border px-3 py-2 text-muted-foreground text-sm">
          Image health not measured — needs the <span className="font-mono">imageHealth</span>{" "}
          enricher (re-run the crawl with it enabled).
        </div>
      </section>
    );
  }

  // Pair each health row back to its source tag where possible.
  const sourceFor = (url: string) =>
    page.images.find((i) => i.url === url)?.source;

  return (
    <section className="flex flex-col gap-2">
      <Header count={health.length} />
      <div className="flex flex-col gap-2">
        {health.map((h) => (
          <div key={h.url} className="flex flex-col gap-2 rounded-lg border px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {sourceFor(h.url) && (
                    <Badge size="sm" variant="outline">
                      {sourceFor(h.url)}
                    </Badge>
                  )}
                  {statusBadge(h)}
                </div>
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 block truncate font-mono text-muted-foreground text-xs hover:text-foreground hover:underline"
                  title={h.url}
                >
                  {h.url}
                </a>
              </div>
              {h.width && h.height ? (
                <img
                  src={h.url}
                  alt=""
                  className="size-12 shrink-0 rounded border bg-muted object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-xs">
              <Stat label="Dimensions">
                {h.width && h.height ? (
                  <span className="font-mono tabular-nums">
                    {h.width}×{h.height}
                  </span>
                ) : (
                  "—"
                )}
              </Stat>
              <Stat label="File size">
                <span className="font-mono tabular-nums">{formatBytes(h.bytes)}</span>
              </Stat>
              <Stat label="Type">
                <span className="font-mono">{h.contentType ?? "—"}</span>
              </Stat>
            </dl>

            {h.warnings.length > 0 && (
              <ul className="flex flex-col gap-1">
                {h.warnings.map((w) => (
                  <li
                    key={w}
                    className="flex items-start gap-1.5 text-warning-foreground text-xs"
                  >
                    <AlertTriangle size={13} className="mt-px shrink-0 text-warning" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Header({ count }: { count?: number }) {
  return (
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Image health{count !== undefined ? ` (${count})` : ""}
    </h4>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

export const detail: FeatureDetail = {
  id: "image-health",
  order: 40,
  Component: ImageHealthDetail,
};
