// Guards the live-typing invariant for text entry in the JSX tree.
//
// The renderer keeps native DOM semantics (Preact, not React): `change` fires
// only when a modified field commits — i.e. on blur — while `input` fires per
// keystroke. A composer bound with `onChange` therefore holds stale local state
// until the field loses focus, and whether the blur lands before the Send
// click is platform-dependent: desktop mousedown blurs first, mobile taps do
// not reliably do so. That shipped as "Send clears the box but posts nothing".
//
// Every <textarea>/<input> in src/ui must bind `onInput`.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const UI_DIR = join(__dirname, "../../src/ui");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("text input events", () => {
  // A filtered scan that asserts an empty result passes just as happily when
  // there was nothing to filter. If every composer moved behind a wrapper
  // component tomorrow, the guard below would stay green while covering
  // nothing — so pin that the scan still finds text entry to check.
  it("finds text-entry elements to check", () => {
    const elements = tsxFiles(UI_DIR).filter((file) =>
      /<(textarea|input)\b/s.test(readFileSync(file, "utf8")),
    );
    expect(elements.length).toBeGreaterThan(0);
  });

  it("no text-entry element binds onChange (use onInput)", () => {
    const offenders = tsxFiles(UI_DIR).filter((file) =>
      /<(textarea|input)\b[^>]*\bonChange=/s.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
