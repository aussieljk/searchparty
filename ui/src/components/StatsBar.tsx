import { CheckCircle2, Layers, TriangleAlert } from "lucide-react";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { CrawlStats } from "@/types";

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={
          tone === "warning" ? "text-warning" : "text-muted-foreground"
        }
      >
        {icon}
      </span>
      <div className="leading-tight">
        <div className="font-mono font-semibold text-lg tabular-nums">{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </div>
    </div>
  );
}

export function StatsBar({ stats }: { stats: CrawlStats | null }) {
  const scraped = stats?.scraped ?? 0;
  const discovered = stats?.discovered ?? 0;
  const errors = stats?.errors ?? 0;
  const done = stats?.done ?? false;
  const pct = discovered > 0 ? Math.round((scraped / discovered) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 border-border border-b bg-card/40 px-5 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-6">
        <Stat icon={<Layers size={18} />} label="discovered" value={discovered} />
        <Stat icon={<CheckCircle2 size={18} />} label="scraped" value={scraped} />
        <Stat
          icon={<TriangleAlert size={18} />}
          label="errors"
          value={errors}
          tone={errors > 0 ? "warning" : "default"}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 sm:max-w-xs">
        {!done && <Spinner aria-label="Crawling" className="size-4 shrink-0" />}
        {done && <CheckCircle2 size={16} className="shrink-0 text-success" />}
        <Progress value={pct} className="gap-0">
          <ProgressTrack>
            <ProgressIndicator className={done ? "bg-success" : "bg-primary"} />
          </ProgressTrack>
        </Progress>
        <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
          {done ? "done" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}
