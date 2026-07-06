#!/usr/bin/env bun
// Generate ui/src/types.ts from the backend src/types.ts so the two never drift.
//
// The UI is a separate Vite app that can't import the backend package directly,
// and feature files augment the UI copy with `declare module "@/types"` — which
// only merges if the UI module literally *declares* PageResult. So instead of a
// re-export barrel we generate a concrete copy of src/types.ts (dropping the
// server-only StateSnapshot type the UI never uses).
//
//   bun run scripts/sync-ui-types.ts           # write ui/src/types.ts
//   bun run scripts/sync-ui-types.ts --check    # exit 1 if out of date (CI/tests)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src", "types.ts");
const DEST = join(root, "ui", "src", "types.ts");

const BANNER =
  "// AUTO-GENERATED from src/types.ts by scripts/sync-ui-types.ts — do not edit by hand.\n" +
  "// Run `bun run sync:types` after changing src/types.ts.\n\n";

export function generateUiTypes(source: string): string {
  // Drop the server-only StateSnapshot block (UI never imports it) so the UI
  // copy stays minimal; keep everything else verbatim.
  const withoutSnapshot = source.replace(
    /\n\/\*\*[^*]*Snapshot[\s\S]*?export interface StateSnapshot \{[\s\S]*?\n\}\n/,
    "\n",
  );
  return BANNER + withoutSnapshot.trimStart();
}

if (import.meta.main) {
  const source = await Bun.file(SRC).text();
  const generated = generateUiTypes(source);
  const check = process.argv.includes("--check");

  if (check) {
    const current = (await Bun.file(DEST).exists()) ? await Bun.file(DEST).text() : "";
    if (current !== generated) {
      console.error(
        "✖ ui/src/types.ts is out of sync with src/types.ts.\n" +
          "  Run `bun run sync:types` to regenerate it.",
      );
      process.exit(1);
    }
    console.log("✓ ui/src/types.ts is in sync with src/types.ts");
  } else {
    await Bun.write(DEST, generated);
    console.log("✓ wrote ui/src/types.ts from src/types.ts");
  }
}
