import { CheckCircle2, ExternalLink, ImageOff, Monitor, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetHeader, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { displayTitle, pathOf, scoreTier, seoScore } from "@/lib/seo";
import type { PageResult } from "@/types";

export function PageDetail({
  page,
  onClose,
}: {
  page: PageResult | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!page} onOpenChange={(open) => !open && onClose()}>
      {page && (
        <SheetPopup side="right" className="sm:max-w-2xl">
          <SheetHeader>
            <div className="flex items-center gap-2 pr-8">
              {page.favicon && (
                <img
                  src={page.favicon}
                  alt=""
                  className="size-4 shrink-0 rounded-sm"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
              <SheetTitle className="truncate">{displayTitle(page)}</SheetTitle>
            </div>
            <a
              href={page.finalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 truncate font-mono text-info text-xs hover:underline"
            >
              {pathOf(page.finalUrl)}
              <ExternalLink size={12} className="shrink-0" />
            </a>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-8">
            <Summary page={page} />
            {!page.error && <LivePreview page={page} />}
            {page.images.length > 0 && <ImageGallery page={page} />}
            <MetaSections page={page} />
            <Issues page={page} />
          </div>
        </SheetPopup>
      )}
    </Sheet>
  );
}

function Summary({ page }: { page: PageResult }) {
  const score = seoScore(page);
  const tier = scoreTier(score);
  const tierCls =
    tier === "great"
      ? "text-success"
      : tier === "ok"
        ? "text-warning"
        : "text-destructive";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {page.error ? (
        <Badge variant="destructive">{page.status || "ERROR"}</Badge>
      ) : (
        <>
          <span className={cn("font-mono font-bold text-2xl tabular-nums", tierCls)}>
            {score}
          </span>
          <span className="text-muted-foreground text-xs">/ 100 SEO</span>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Badge variant="secondary" className="font-mono">
            {page.status}
          </Badge>
        </>
      )}
      {page.ogType && <Badge variant="outline">og:{page.ogType}</Badge>}
      {page.twitterCard && <Badge variant="outline">{page.twitterCard}</Badge>}
      {page.robots && /noindex/i.test(page.robots) && (
        <Badge variant="warning">noindex</Badge>
      )}
      <span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
        {page.elapsedMs}ms{page.wordCount ? ` · ${page.wordCount} words` : ""}
      </span>
    </div>
  );
}

function LivePreview({ page }: { page: PageResult }) {
  const [show, setShow] = useState(false);
  return (
    <Section title="Live preview" icon={<Monitor size={14} />}>
      {show ? (
        <div className="overflow-hidden rounded-lg border bg-white">
          <iframe
            title="Live page preview"
            src={`/api/proxy?url=${encodeURIComponent(page.finalUrl)}`}
            className="h-[420px] w-full"
            sandbox="allow-same-origin"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShow(true)}
          className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm transition-colors hover:bg-accent/50"
        >
          Load live render of this page
        </button>
      )}
    </Section>
  );
}

function ImageGallery({ page }: { page: PageResult }) {
  return (
    <Section title={`Social images (${page.images.length})`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {page.images.map((img) => (
          <figure key={img.url} className="overflow-hidden rounded-lg border bg-muted">
            <ImageWithFallback url={img.url} alt={img.alt ?? img.source} />
            <figcaption className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <Badge variant="outline" size="sm" className="font-mono">
                {img.source}
              </Badge>
              {img.width && img.height && (
                <span className="font-mono text-muted-foreground text-xs">
                  {img.width}×{img.height}
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function ImageWithFallback({ url, alt }: { url: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className="flex aspect-[1.91/1] w-full items-center justify-center text-muted-foreground">
        <ImageOff size={20} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setErr(true)}
      className="aspect-[1.91/1] w-full object-cover"
    />
  );
}

function MetaSections({ page }: { page: PageResult }) {
  return (
    <div className="flex flex-col gap-5">
      <MetaGroup
        title="SEO"
        rows={[
          ["Title", page.title],
          ["Description", page.description],
          ["Canonical", page.canonical],
          ["Robots", page.robots],
          ["H1", page.h1],
          ["Language", page.lang],
        ]}
      />
      <MetaGroup
        title="Open Graph"
        rows={[
          ["og:title", page.ogTitle],
          ["og:description", page.ogDescription],
          ["og:type", page.ogType],
          ["og:site_name", page.ogSiteName],
          ["og:url", page.ogUrl],
        ]}
      />
      <MetaGroup
        title="Twitter"
        rows={[
          ["twitter:card", page.twitterCard],
          ["twitter:title", page.twitterTitle],
          ["twitter:description", page.twitterDescription],
          ["twitter:site", page.twitterSite],
        ]}
      />
    </div>
  );
}

function MetaGroup({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  return (
    <Section title={title}>
      <dl className="flex flex-col divide-y divide-border rounded-lg border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[8rem_1fr] gap-2 px-3 py-2 text-sm">
            <dt className="font-mono text-muted-foreground text-xs">{label}</dt>
            {value ? (
              <dd className="break-words">{value}</dd>
            ) : (
              <dd className="text-muted-foreground/50 text-xs italic">—</dd>
            )}
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Issues({ page }: { page: PageResult }) {
  if (page.error) {
    return (
      <Section title="Error">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-destructive-foreground text-sm">
          <TriangleAlert size={15} /> {page.error}
        </div>
      </Section>
    );
  }
  if (page.issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/8 px-3 py-2 text-success-foreground text-sm">
        <CheckCircle2 size={15} /> No SEO issues found.
      </div>
    );
  }
  return (
    <Section title={`Issues (${page.issues.length})`}>
      <ul className="flex flex-col gap-1.5">
        {page.issues.map((issue) => (
          <li
            key={issue}
            className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-1.5 text-sm text-warning-foreground"
          >
            <TriangleAlert size={14} className="shrink-0" /> {issue}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}
