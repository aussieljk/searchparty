// ============================================================================
// IMAGE HEALTH enricher — for each social/preview image on the page, fetch the
// bytes (GET, short timeout, crawler UA) and measure HTTP status, content-type,
// byte size and REAL pixel dimensions (via the `image-size` package). Flags
// common social-card problems. Additive: results land on `page.imageHealth`.
//
// Resilient by contract: every fetch/parse is wrapped in try/catch and a failed
// image is recorded (not thrown). Work is bounded to a small concurrency.
// ============================================================================
import { imageSize } from "image-size";
import type { EnricherCtx } from "../enrich.ts";

/** Measured health of one preview image. */
export interface ImageHealth {
  /** Absolute URL of the image (matches a MetaImage.url). */
  url: string;
  /** HTTP status of the GET, or 0 if the request never completed. */
  status: number;
  /** Reported content-type (first part, e.g. "image/png"), if any. */
  contentType?: string;
  /** Byte size from Content-Length or the downloaded body. */
  bytes?: number;
  /** Real decoded pixel width. */
  width?: number;
  /** Real decoded pixel height. */
  height?: number;
  /** True when status 200 and dimensions decoded with no warnings. */
  ok: boolean;
  /** Human-readable problems (small, wrong aspect, too big, not an image…). */
  warnings: string[];
  /** Set when the fetch/parse failed outright. */
  error?: string;
}

// Make the new field visible on PageResult everywhere it's imported.
declare module "../types.ts" {
  interface PageResult {
    /** Per-image health measured by the imageHealth enricher (parallel to images). */
    imageHealth?: ImageHealth[];
  }
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB warning threshold
const OG_MIN_WIDTH = 1200;
const OG_MIN_HEIGHT = 630;
const TARGET_ASPECT = 1200 / 630; // ~1.905
const ASPECT_TOLERANCE = 0.15;
const CONCURRENCY = 4;

async function checkImage(url: string, userAgent: string): Promise<ImageHealth> {
  const health: ImageHealth = { url, status: 0, ok: false, warnings: [] };
  try {
    const res = await fetch(url, {
      headers: { "user-agent": userAgent, accept: "image/*,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    health.status = res.status;
    const ct = res.headers.get("content-type") ?? undefined;
    health.contentType = ct?.split(";")[0]?.trim() || undefined;

    if (!res.ok) {
      health.warnings.push(`HTTP ${res.status}`);
    }

    const isImageType = !!health.contentType && /^image\//i.test(health.contentType);
    if (health.contentType && !isImageType) {
      health.warnings.push(`Not an image (${health.contentType})`);
    }

    // Read the body to measure bytes + decode dimensions.
    const buf = new Uint8Array(await res.arrayBuffer());
    health.bytes = buf.byteLength;

    if (health.bytes > MAX_BYTES) {
      health.warnings.push(`Over 5MB (${(health.bytes / 1024 / 1024).toFixed(1)}MB)`);
    }

    try {
      const dim = imageSize(buf);
      health.width = dim.width;
      health.height = dim.height;
    } catch {
      health.warnings.push("Could not decode image dimensions");
    }

    if (health.width && health.height) {
      if (health.width < OG_MIN_WIDTH || health.height < OG_MIN_HEIGHT) {
        health.warnings.push(
          `Below og minimum ${OG_MIN_WIDTH}x${OG_MIN_HEIGHT} (is ${health.width}x${health.height})`,
        );
      }
      const aspect = health.width / health.height;
      if (Math.abs(aspect - TARGET_ASPECT) > ASPECT_TOLERANCE) {
        health.warnings.push(`Aspect ${aspect.toFixed(2)}:1 (want ~1.91:1)`);
      }
    }

    health.ok = res.ok && isImageType && health.warnings.length === 0;
  } catch (err) {
    health.error = err instanceof Error ? err.message : String(err);
    health.warnings.push("Failed to fetch image");
  }
  return health;
}

/** Run tasks with a bounded concurrency window. */
async function mapBounded<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export default async function imageHealthEnricher(ctx: EnricherCtx): Promise<void> {
  try {
    const urls = ctx.page.images.map((i) => i.url);
    if (urls.length === 0) return;
    // Dedupe defensively (images are already deduped upstream, but be safe).
    const unique = [...new Set(urls)];
    ctx.page.imageHealth = await mapBounded(unique, CONCURRENCY, (u) =>
      checkImage(u, ctx.userAgent),
    );
  } catch (err) {
    // Never throw out of an enricher.
    console.error(`  ⚠  imageHealth enricher failed on ${ctx.page.finalUrl}:`, err);
  }
}
