// ============================================================================
// FEATURE: Export & shareable reports.
//
// Adds an "Export" tab with three download links wired to the backend
// /api/export endpoint (CSV / JSON / HTML report). Counts come from
// useCrawlData() so the user can see what they're about to export.
// ============================================================================
import { Download, FileCode2, FileJson, FileSpreadsheet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { FeatureTab } from "@/features/registry";
import { useCrawlData } from "@/hooks/useCrawlData";
import { cn } from "@/lib/utils";

interface ExportOption {
  format: "csv" | "json" | "html";
  title: string;
  filename: string;
  description: string;
  icon: React.ReactNode;
}

const OPTIONS: ExportOption[] = [
  {
    format: "csv",
    title: "CSV spreadsheet",
    filename: "searchparty.csv",
    description:
      "One row per page: url, status, title, description, canonical, image count, issues and SEO score. Opens in Excel, Numbers or Sheets.",
    icon: <FileSpreadsheet size={18} />,
  },
  {
    format: "json",
    title: "JSON snapshot",
    filename: "searchparty.json",
    description:
      "The complete crawl snapshot — every page's full extracted data plus crawl stats. Ideal for piping into other tools.",
    icon: <FileJson size={18} />,
  },
  {
    format: "html",
    title: "HTML audit report",
    filename: "searchparty-report.html",
    description:
      "A self-contained, styled report: totals, an issues breakdown and a per-page table with og:image thumbnails. Share it as a single file — no assets needed.",
    icon: <FileCode2 size={18} />,
  },
];

function ExportTab() {
  const { pages, stats } = useCrawlData();
  const errorPages = pages.filter((p) => p.error || p.status >= 400).length;
  const hasData = pages.length > 0;

  return (
    <div className="px-5 py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h2 className="font-semibold text-lg">Export &amp; shareable reports</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Download the current crawl in your preferred format. Exports reflect the live
            snapshot, so you can grab a partial report mid-crawl or wait for it to finish.
          </p>
          <p className="mt-3 font-mono text-muted-foreground text-sm tabular-nums">
            {pages.length} page{pages.length === 1 ? "" : "s"}
            {errorPages > 0 ? ` · ${errorPages} error${errorPages === 1 ? "" : "s"}` : ""} ·{" "}
            {stats?.done ? "crawl complete" : "crawling…"}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {OPTIONS.map((opt) => (
            <div
              key={opt.format}
              className="flex items-start gap-4 rounded-xl border bg-card p-4"
            >
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                {opt.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm">{opt.title}</h3>
                <p className="mt-0.5 text-muted-foreground text-sm">{opt.description}</p>
              </div>
              <a
                href={`/api/export?format=${opt.format}`}
                download={opt.filename}
                aria-disabled={!hasData}
                tabIndex={hasData ? undefined : -1}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-0.5 shrink-0",
                  !hasData && "pointer-events-none opacity-50",
                )}
              >
                <Download size={15} />
                {opt.format.toUpperCase()}
              </a>
            </div>
          ))}
        </div>

        {!hasData && (
          <p className="text-muted-foreground text-sm">
            Nothing to export yet — exports become available once pages start arriving.
          </p>
        )}
      </div>
    </div>
  );
}

export const tab: FeatureTab = {
  id: "export",
  label: "Export",
  icon: <Download size={15} />,
  order: 80,
  Component: ExportTab,
};
