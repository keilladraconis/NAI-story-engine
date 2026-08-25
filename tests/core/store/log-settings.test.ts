// The two logging switches must stay two.
//
// `story_engine_debug` gates the Engine's own account of a pass; nai-store's
// debug flag prints `NAISTORE <action>` on every dispatch, many per keystroke.
// They were briefly the same flag, which meant reading what the Engine decided
// required turning on a firehose that buried it. That is the whole reason this
// file exists.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../../../src");

/** Comments out. Both files explain the split in prose and name the other flag
 *  while doing it; a literal scan would either miscount or bully the
 *  documentation into silence. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Prettier wraps `.get("…")` across lines when the chain is long enough, so
 *  match the read with the whitespace it may actually carry. */
function reads(src: string, key: string): boolean {
  return new RegExp(`config\\s*\\.\\s*get\\(\\s*"${key}"`).test(src);
}

const storeSrc = () =>
  code(readFileSync(join(SRC, "core/store/index.ts"), "utf8"));
// The Engine's logger has one home (`core/engine/log.ts`). §7's reconciliation
// used to speak from the navigation handler as well; it is gone, and the pass
// is the only caller again — but the rule below is about callers in general,
// not about how many there happen to be.
const engineSrc = () =>
  code(readFileSync(join(SRC, "core/engine/log.ts"), "utf8"));
const engineCallerSrcs = () =>
  ["core/store/effects/engine-loop.ts"].map((f) =>
    code(readFileSync(join(SRC, f), "utf8")),
  );

describe("the logging switches are separate", () => {
  it("the store's action firehose reads store_action_log, not the debug flag", () => {
    const src = storeSrc();
    expect(reads(src, "store_action_log")).toBe(true);
    expect(src).not.toContain("story_engine_debug");
  });

  it("the Engine's own logs read story_engine_debug, not the firehose", () => {
    const src = engineSrc();
    expect(reads(src, "story_engine_debug")).toBe(true);
    expect(src).not.toContain("store_action_log");
  });

  it("nothing that logs reaches for a flag of its own", () => {
    // One home means one answer to "is the Engine allowed to talk". A caller
    // reading the flag itself would be a second one, and the pair would drift.
    for (const src of engineCallerSrcs()) {
      expect(reads(src, "story_engine_debug")).toBe(false);
      expect(src).not.toContain("store_action_log");
    }
  });

  it("both settings exist in project.yaml and default to off", () => {
    // A logging switch that defaults on is a switch nobody asked for.
    const yaml = readFileSync(join(SRC, "../project.yaml"), "utf8");
    for (const name of ["story_engine_debug", "store_action_log"]) {
      const entry = new RegExp(`- name: ${name}[\\s\\S]*?default: (\\w+)`).exec(
        yaml,
      );
      expect(entry, `${name} missing from project.yaml`).not.toBeNull();
      expect((entry as RegExpExecArray)[1]).toBe("false");
    }
  });
});
