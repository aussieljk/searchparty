import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { generateUiTypes } from "../scripts/sync-ui-types.ts";

const root = join(import.meta.dir, "..");

describe("ui/src/types.ts stays in sync with src/types.ts", () => {
  test("the committed UI types match what the generator would produce", async () => {
    const source = await Bun.file(join(root, "src", "types.ts")).text();
    const current = await Bun.file(join(root, "ui", "src", "types.ts")).text();
    expect(current).toBe(generateUiTypes(source));
  });

  test("the generated UI copy drops the server-only StateSnapshot type", async () => {
    const source = await Bun.file(join(root, "src", "types.ts")).text();
    const generated = generateUiTypes(source);
    expect(source).toContain("StateSnapshot");
    expect(generated).not.toContain("StateSnapshot");
    // but the shared types the UI actually renders survive.
    expect(generated).toContain("interface PageResult");
    expect(generated).toContain("interface MetaImage");
    expect(generated).toContain("type CrawlEvent");
  });
});
