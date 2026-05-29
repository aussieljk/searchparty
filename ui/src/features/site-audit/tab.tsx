// ============================================================================
// FEATURE: Site Audit — a top-level tab showing cross-page SEO findings computed
// server-side by GET /api/audit (src/routes/audit.ts). Re-fetches on demand and
// automatically when the crawl finishes (stats.done flips true).
// ============================================================================
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FeatureTab } from "@/features/registry";
import { useCrawlData } from "@/hooks/useCrawlData";

// Mirrors the shapes returned by src/routes/audit.ts.
type AuditSeverity = "error" | "warning" | "info";
interface AuditItem {
  url: string;
  detail: string;
}
interface AuditGroup {
  group: string;
  severity: AuditSeverity;
  items: AuditItem[];
}
interface AuditReport {
  done: boolean;
  pageCount: number;
  groups: AuditGroup[];
  error?: string;
}

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search) || "/";
  } catch {
    return url;
  }
}

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const variant =
    severity === "error" ? "error" : severity === "warning" ? "warning" : "info";
  const Icon =
    severity === "error" ? ShieldAlert : severity === "warning" ? AlertTriangle : Info;
  return (
    <Badge variant={variant} className="capitalize">
      <Icon />
      {severity}
    </Badge>
  );
}

function alertVariantFor(severity: AuditSeverity): "error" | "warning" | "info" {
  return severity === "error" ? "error" : severity === "warning" ? "warning" : "info";
}

function GroupCard({ group }: { group: AuditGroup }) {
  return (
    <Alert variant={alertVariantFor(group.severity)} className="block p-0">
      <div className="flex items-center justify-between gap-2 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <AlertTitle className="font-semibold text-base">{group.group}</AlertTitle>
          <Badge variant="outline" size="sm" className="tabular-nums">
            {group.items.length}
          </Badge>
        </div>
        <SeverityBadge severity={group.severity} />
      </div>
      <AlertDescription className="block border-current/16 border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Page</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map((item, i) => (
              <TableRow key={`${item.url}-${i}`}>
                <TableCell className="max-w-0 truncate font-mono text-foreground text-xs">
                  {pathOf(item.url)}
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {item.detail}
                </TableCell>
                <TableCell>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Open page in new tab"
                  >
                    <ExternalLink size={14} />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AlertDescription>
    </Alert>
  );
}

function SiteAuditTab() {
  const { stats } = useCrawlData();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the last done-state we auto-fetched for, so we refetch once when the
  // crawl flips to done.
  const lastDoneRef = useRef<boolean | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditReport = await res.json();
      setReport(data);
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refetch when crawl finishes.
  useEffect(() => {
    const done = stats?.done ?? false;
    if (lastDoneRef.current === null) {
      lastDoneRef.current = done;
      void refetch();
      return;
    }
    if (done && !lastDoneRef.current) {
      lastDoneRef.current = true;
      void refetch();
    } else {
      lastDoneRef.current = done;
    }
  }, [stats?.done, refetch]);

  const groups = report?.groups
    ? [...report.groups].sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
      )
    : [];
  const totalFindings = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="px-5 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Site Audit</h2>
          <p className="mt-0.5 text-muted-foreground text-sm">
            Cross-page SEO findings across{" "}
            <span className="tabular-nums">{report?.pageCount ?? 0}</span> crawled pages
            {stats && !stats.done ? " (crawl in progress…)" : ""}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Re-run audit
        </Button>
      </div>

      {error && (
        <Alert variant="error" className="mb-5">
          <ShieldAlert />
          <AlertTitle>Audit failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !report && (
        <div className="flex items-center gap-2 py-12 text-muted-foreground text-sm">
          <Spinner /> Running audit…
        </div>
      )}

      {report && !error && totalFindings === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 />
            </EmptyMedia>
            <EmptyTitle>No site-wide issues found</EmptyTitle>
            <EmptyDescription>
              {report.pageCount === 0
                ? "No pages crawled yet — start a crawl to populate the audit."
                : "Every crawled page passed the cross-page SEO checks."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {totalFindings > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <GroupCard key={g.group} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

export const tab: FeatureTab = {
  id: "site-audit",
  label: "Site Audit",
  icon: <ShieldAlert size={15} />,
  order: 50,
  Component: SiteAuditTab,
};
