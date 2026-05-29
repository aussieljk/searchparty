// ============================================================================
// FEATURE #7 — PERSISTENCE & CRAWL DIFF
//
// Persists a compact snapshot of each completed crawl into a SQLite db so runs
// accumulate across CLI invocations, then exposes them for the History tab:
//
//   GET /api/history/list?origin=       -> past runs [{ id, timestamp, pageCount, issueCount }]
//   GET /api/history/diff?origin=&a=&b=  -> diff between two runs (a=older, b=newer)
//
// (Both live under the /api/history/* prefix the foundation's route loader
//  understands. The bare /api/history/ root also returns the run list.)
//
// At import time this module subscribes to the crawler's "done" event and writes
// a snapshot. Everything is wrapped in try/catch so a sqlite failure can never
// take down the crawl or the server.
// ============================================================================
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Route, RouteCtx } from "../routeCtx.ts";
import type { CrawlEvent, PageResult } from "../types.ts";

// ---- Stable db location: ~/.searchparty/history.db (runs accumulate) --------
function openDb(): Database | null {
  try {
    const dir = join(homedir(), ".searchparty");
    mkdirSync(dir, { recursive: true });
    const db = new Database(join(dir, "history.db"), { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        origin     TEXT NOT NULL,
        timestamp  INTEGER NOT NULL,
        pageCount  INTEGER NOT NULL,
        issueCount INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS run_pages (
        runId       INTEGER NOT NULL,
        url         TEXT NOT NULL,
        status      INTEGER,
        title       TEXT,
        description TEXT,
        canonical   TEXT,
        issueCount  INTEGER NOT NULL DEFAULT 0,
        imageCount  INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (runId) REFERENCES runs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_runs_origin ON runs(origin);
      CREATE INDEX IF NOT EXISTS idx_run_pages_run ON run_pages(runId);
    `);
    return db;
  } catch (err) {
    console.error("  ⚠  history: failed to open sqlite db:", err);
    return null;
  }
}

const db = openDb();

// ---- Stored per-page shape --------------------------------------------------
interface StoredPage {
  url: string;
  status: number | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  issueCount: number;
  imageCount: number;
}

interface RunRow {
  id: number;
  origin: string;
  timestamp: number;
  pageCount: number;
  issueCount: number;
}

// ---- Persist a snapshot on crawl completion ---------------------------------
function persistSnapshot(origin: string, pages: PageResult[]): void {
  if (!db) return;
  try {
    const timestamp = Date.now();
    const totalIssues = pages.reduce((n, p) => n + (p.issues?.length ?? 0), 0);
    const insertRun = db.query(
      "INSERT INTO runs (origin, timestamp, pageCount, issueCount) VALUES (?, ?, ?, ?)",
    );
    const info = insertRun.run(origin, timestamp, pages.length, totalIssues);
    const runId = Number(info.lastInsertRowid);

    const insertPage = db.query(
      `INSERT INTO run_pages (runId, url, status, title, description, canonical, issueCount, imageCount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction((rows: PageResult[]) => {
      for (const p of rows) {
        insertPage.run(
          runId,
          p.finalUrl || p.url,
          p.status ?? null,
          p.title ?? null,
          p.description ?? null,
          p.canonical ?? null,
          p.issues?.length ?? 0,
          p.images?.length ?? 0,
        );
      }
    });
    tx(pages);
  } catch (err) {
    console.error("  ⚠  history: failed to persist snapshot:", err);
  }
}

// Subscribe to the crawler's "done" event so we persist a snapshot of every run
// — even runs where the UI never hits a /api/history request. The server calls
// our exported `init(ctx)` once at startup (after the crawler exists). We also
// attach lazily on the first handler call as a belt-and-braces fallback; the
// `attached` flag keeps it idempotent so we never double-subscribe.
let attached = false;
function attachCrawler(ctx: RouteCtx): void {
  if (attached) return;
  attached = true;
  try {
    ctx.crawler.on("event", (event: CrawlEvent) => {
      if (event.type === "done") {
        const snap = ctx.crawler.getSnapshot();
        persistSnapshot(ctx.origin, snap.pages);
      }
    });
  } catch (err) {
    console.error("  ⚠  history: failed to attach crawler listener:", err);
  }
}

// ---- Query helpers ----------------------------------------------------------
function listRuns(origin: string): RunRow[] {
  if (!db) return [];
  try {
    return db
      .query(
        "SELECT id, origin, timestamp, pageCount, issueCount FROM runs WHERE origin = ? ORDER BY timestamp DESC",
      )
      .all(origin) as RunRow[];
  } catch {
    return [];
  }
}

function getRun(runId: number): RunRow | null {
  if (!db) return null;
  try {
    return (
      (db
        .query("SELECT id, origin, timestamp, pageCount, issueCount FROM runs WHERE id = ?")
        .get(runId) as RunRow | undefined) ?? null
    );
  } catch {
    return null;
  }
}

function getRunPages(runId: number): StoredPage[] {
  if (!db) return [];
  try {
    return db
      .query(
        "SELECT url, status, title, description, canonical, issueCount, imageCount FROM run_pages WHERE runId = ?",
      )
      .all(runId) as StoredPage[];
  } catch {
    return [];
  }
}

// ---- Diff -------------------------------------------------------------------
export interface PageFieldChange {
  field: "status" | "title" | "description" | "canonical" | "issueCount" | "imageCount";
  before: string | number | null;
  after: string | number | null;
}

export interface ChangedPage {
  url: string;
  changes: PageFieldChange[];
}

export interface HistoryDiff {
  a: { id: number; timestamp: number } | null;
  b: { id: number; timestamp: number } | null;
  added: StoredPage[];
  removed: StoredPage[];
  changed: ChangedPage[];
}

function diffRuns(aId: number, bId: number): HistoryDiff | null {
  const aRun = getRun(aId);
  const bRun = getRun(bId);
  if (!aRun || !bRun) return null;

  const aPages = getRunPages(aId);
  const bPages = getRunPages(bId);
  const aMap = new Map(aPages.map((p) => [p.url, p]));
  const bMap = new Map(bPages.map((p) => [p.url, p]));

  const added: StoredPage[] = [];
  const removed: StoredPage[] = [];
  const changed: ChangedPage[] = [];

  for (const p of bPages) if (!aMap.has(p.url)) added.push(p);
  for (const p of aPages) if (!bMap.has(p.url)) removed.push(p);

  const fields: PageFieldChange["field"][] = [
    "status",
    "title",
    "description",
    "canonical",
    "issueCount",
    "imageCount",
  ];
  for (const [url, before] of aMap) {
    const after = bMap.get(url);
    if (!after) continue;
    const changes: PageFieldChange[] = [];
    for (const f of fields) {
      const bv = before[f] ?? null;
      const av = after[f] ?? null;
      if (bv !== av) changes.push({ field: f, before: bv, after: av });
    }
    if (changes.length) changed.push({ url, changes });
  }

  return {
    a: { id: aRun.id, timestamp: aRun.timestamp },
    b: { id: bRun.id, timestamp: bRun.timestamp },
    added,
    removed,
    changed,
  };
}

// ---- Route ------------------------------------------------------------------
export const route: Route = {
  method: "GET",
  // Prefix match: the server mounts this for every path under /api/history/.
  // Sub-paths: /api/history/list (runs) and /api/history/diff (compare).
  path: "/api/history/*",
  // Eagerly subscribe to crawler "done" at startup so the current run persists.
  init: (ctx: RouteCtx) => attachCrawler(ctx),
  handler: (_req: Request, url: URL, ctx: RouteCtx): Response => {
    attachCrawler(ctx);

    if (!db) {
      return Response.json(
        { error: "History unavailable — could not open sqlite db." },
        { status: 503 },
      );
    }

    // GET /api/history/diff?origin=&a=&b=
    if (url.pathname === "/api/history/diff") {
      const a = Number(url.searchParams.get("a"));
      const b = Number(url.searchParams.get("b"));
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
        return Response.json({ error: "Provide numeric run ids a and b." }, { status: 400 });
      }
      const diff = diffRuns(a, b);
      if (!diff) return Response.json({ error: "Run not found." }, { status: 404 });
      return Response.json(diff);
    }

    // GET /api/history/list?origin=  (and the bare /api/history/ prefix root)
    if (url.pathname === "/api/history/list" || url.pathname === "/api/history/") {
      const origin = url.searchParams.get("origin") || ctx.origin;
      return Response.json({ origin, runs: listRuns(origin) });
    }

    return Response.json({ error: "Not found." }, { status: 404 });
  },
};
