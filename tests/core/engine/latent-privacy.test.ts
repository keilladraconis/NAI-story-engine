import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every source file under a directory. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The only files that may touch a Thread's private half. Each has a reason:
 *  the type, the reducer, the record, the two creators, the review prompt (never
 *  the story's context), the Thread write, the drain, and the writer's pane. */
const ALLOWED = [
  "src/core/store/types.ts",
  "src/core/store/slices/world.ts",
  "src/core/store/persistence/story-store.ts",
  "src/core/store/effects/handlers/forge-chat.ts",
  "src/core/utils/crucible-command-parser.ts",
  "src/core/engine/loop-machine.ts",
  "src/core/engine/review-strategy.ts",
  "src/core/engine/thread-write-strategy.ts",
  "src/core/engine/execute.ts",
  "src/ui/panels/world/ThreadEditPane.tsx",
];

// This scan follows the identifier. A value travelling as plain text — a Forge
// transcript quoting its own `[THREAD …]` command — is invisible to it; that
// half is checked by sentinel in `private-notes-sinks.test.ts`.
describe("a Thread's private notes never reach the story model", () => {
  const offenders = sourcesUnder("src")
    .filter((path) => !ALLOWED.includes(path.split("\\").join("/")))
    .filter((path) => /\blatent\b/.test(readFileSync(path, "utf8")));

  it("is named in no file outside the allowed list", () => {
    expect(offenders).toEqual([]);
  });

  it("is not written by the module that builds a Thread's lorebook entry", () => {
    expect(readFileSync("src/core/engine/thread-bind.ts", "utf8")).not.toMatch(
      /\.latent\b/,
    );
  });

  it("is not read by the story prefix or lorebook generation context", () => {
    for (const path of [
      "src/core/utils/context-builder.ts",
      "src/core/utils/lorebook-strategy.ts",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/\.latent\b/);
    }
  });

  it("has a positive control: the scan finds the word where it is allowed", () => {
    expect(readFileSync("src/core/engine/execute.ts", "utf8")).toMatch(
      /\blatent\b/,
    );
  });
});

const WISH_ALLOWED = [
  "src/core/store/types.ts",
  "src/core/store/slices/world.ts",
  "src/core/store/persistence/story-store.ts",
  "src/core/utils/crucible-command-parser.ts",
  "src/core/store/effects/handlers/forge-chat.ts",
  "src/ui/panels/world/ThreadEditPane.tsx",
  // The Scenario prompt names the segment so the model can fill it.
  "src/core/utils/prompts.ts",
];

describe("a Thread's wish is read by no generation", () => {
  it("is named in no file outside the allowed list", () => {
    const offenders = sourcesUnder("src")
      .filter((path) => !WISH_ALLOWED.includes(path.split("\\").join("/")))
      .filter((path) => /\bwish\b/i.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("has a positive control: the scan finds the word where it is allowed", () => {
    expect(readFileSync("src/core/store/types.ts", "utf8")).toMatch(/\bwish\b/);
  });
});
