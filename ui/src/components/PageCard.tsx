import { ImageOff, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { displayDescription, displayTitle, pathOf, previewImage, scoreTier, seoScore } from "@/lib/seo";
import type { PageResult } from "@/types";

const TIER_RING: Record<string, string> = {
  great: "border-success/40",
  ok: "border-warning/40",
  poor: "border-destructive/40",
};

export function PageCard({ page, onClick }: { page: PageResult; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const img = previewImage(page);
  const score = seoScore(page);
  const tier = scoreTier(score);
  const title = displayTitle(page);
  const description = displayDescription(page);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        page.error ? "border-destructive/40" : TIER_RING[tier],
      )}
    >
      {/* Social preview — 1.91:1 like og:image */}
      <div className="relative aspect-[1.91/1] w-full overflow-hidden bg-muted">
        {img && !imgError ? (
          <img
            src={img}
            alt={title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImageOff size={24} />
            <span className="text-xs">no preview image</span>
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <StatusBadge page={page} />
        </div>
        <div className="absolute top-2 right-2">
          <ScorePill score={score} tier={tier} error={!!page.error} />
        </div>
      </div>

      {/* Meta */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-center gap-1.5">
          {page.favicon && (
            <img
              src={page.favicon}
              alt=""
              className="size-3.5 shrink-0 rounded-sm"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <span className="truncate font-mono text-muted-foreground text-xs">
            {pathOf(page.finalUrl)}
          </span>
        </div>
        <h3 className="line-clamp-2 font-medium text-sm leading-snug">{title}</h3>
        {description ? (
          <p className="line-clamp-2 text-muted-foreground text-xs">{description}</p>
        ) : (
          <p className="text-muted-foreground/60 text-xs italic">no description</p>
        )}

        {page.issues.length > 0 && (
          <div className="mt-auto flex items-center gap-1.5 pt-1 text-warning">
            <TriangleAlert size={13} />
            <span className="text-xs">
              {page.issues.length} {page.issues.length === 1 ? "issue" : "issues"}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

function StatusBadge({ page }: { page: PageResult }) {
  if (page.error) {
    return <Badge variant="destructive">{page.status || "ERR"}</Badge>;
  }
  const variant = page.status >= 300 && page.status < 400 ? "warning" : "secondary";
  return (
    <Badge variant={variant} className="font-mono backdrop-blur">
      {page.status}
    </Badge>
  );
}

function ScorePill({ score, tier, error }: { score: number; tier: string; error: boolean }) {
  if (error) return null;
  const cls =
    tier === "great"
      ? "bg-success text-success-foreground"
      : tier === "ok"
        ? "bg-warning text-warning-foreground"
        : "bg-destructive text-white";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-mono font-semibold text-xs tabular-nums shadow-sm",
        cls,
      )}
    >
      {score}
    </span>
  );
}
