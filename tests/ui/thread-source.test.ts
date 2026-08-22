// Static guards over the World's thread surfaces: the status indicator, the
// thread row in the World list, and the edit pane's horizon and status controls.
//
// `.tsx` is never collected by vitest here, so none of these can be
// render-tested; what a source scan can hold is their structure, and every
// invariant below is a CLAUDE.md rule with a history behind it. Same approach
// and same idioms as `hud-source.test.ts` and `engine-settings-source.test.ts`.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HORIZON_OPTIONS,
  STATUS_OPTIONS,
} from "../../src/ui/panels/world/thread-display";

const WORLD_DIR = join(__dirname, "../../src/ui/panels/world");
const ICON = join(WORLD_DIR, "ThreadStatusIcon.tsx");
const ITEM = join(WORLD_DIR, "ThreadItem.tsx");
const PANE = join(WORLD_DIR, "ThreadEditPane.tsx");
const SELECT = join(WORLD_DIR, "world-select.ts");

const read = (file: string) => readFileSync(file, "utf8");

/** Comments out. These files explain their own rules in prose and name the very
 *  things the scans below forbid, so counting the prose would bully the
 *  documentation into silence. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every element rendered behind a conditional operator. Both idioms, and the
 *  optional `(` because prettier wraps a multi-line ternary as
 *  `? (\n  <Icon />\n) : (` — a scan for `? <` alone passes the regression it
 *  exists for. */
function conditionalElements(src: string): string[] {
  return [...code(src).matchAll(/(?:[?:]|&&|\|\|)\s*\(?\s*<[A-Za-z]/g)].map(
    (m) => m[0],
  );
}

describe("the status indicator swaps no component types", () => {
  it("mounts both readings and lets `display` pick", () => {
    // The rule and its failure: swapping one component type for another at a
    // fixed position leaves BOTH svgs in the DOM when the re-render arrives
    // from a detached callback rather than a JSX event handler. Every render
    // here is detached — the status moves when the store moves, and phase 6
    // moves it from the Engine's own pass, with no press anywhere near it.
    const src = read(ICON);
    expect(src).toContain("<CheckCircle");
    expect(src).toContain("<Circle");

    const toggles = [
      ...code(src).matchAll(/display: satisfied \? "[a-z-]+" : "[a-z-]+"/g),
    ];
    expect(toggles.length).toBe(STATUS_OPTIONS.length);
  });

  it("renders no element behind a condition", () => {
    expect(conditionalElements(read(ICON))).toEqual([]);
  });

  it("never calls updateParts", () => {
    for (const file of [ICON, ITEM, PANE]) {
      expect(read(file)).not.toContain("updateParts");
    }
  });
});

describe("a satisfied thread reads as satisfied in the World list", () => {
  it("gives every thread row the same status slot, in the same place", () => {
    // §9.1's instinct, applied to a list: fixed slots, always present, always
    // in the same position, so the column is scanned rather than decoded. A
    // slot that appeared only on satisfied threads would be a second list in
    // disguise — and would move every title left or right by a row.
    const src = code(read(ITEM));
    const uses = [...src.matchAll(/<ThreadStatusIcon\b/g)];
    expect(uses.length).toBe(1);
    expect(src).toMatch(/<ThreadStatusIcon\s+status=\{thread\.status\}/);
    // …and it is not behind a condition of any kind. Both idioms, and the
    // optional `(` for prettier's multi-line ternary wrapping.
    expect(
      [...src.matchAll(/(?:[?:]|&&|\|\|)\s*\(?\s*<ThreadStatusIcon/g)].length,
    ).toBe(0);
  });

  it("carries the reading into the title as well as the icon", () => {
    // One icon at 16px is a weak signal in a column of rows. The title recedes
    // too, so the row as a whole reads finished at a glance — a style value,
    // never a swapped element.
    const src = code(read(ITEM));
    expect(src).toMatch(/const satisfied = thread\.status === "satisfied"/);
    expect(src).toMatch(/opacity: satisfied \?/);
  });

  it("shows status without filtering or reordering the list", () => {
    // The requirement, and the reason it is one: a filter or a second section
    // hides threads the writer has to be able to see in order to reopen them,
    // and a sort moves rows under the finger reaching for them. Scanned across
    // all three files that could do it — the row, the panel that lists the
    // rows, and the selector that hands the panel its order.
    for (const file of [ITEM, join(WORLD_DIR, "World.tsx"), SELECT]) {
      const src = code(read(file));
      expect(src).not.toMatch(/(?:filter|sort|reverse)\([^)]*status/);
      expect(src).not.toMatch(/\.sort\(/);
    }
  });
});

describe("the edit pane offers the horizon as a choice, like a category", () => {
  it("builds one button per horizon, from the model's own list", () => {
    // The established shape for this kind of choice is EntityEditPane's
    // category bar: a row of buttons over an exported table, each keyed, the
    // selected one lit. A thread's horizon is the same shape of choice and does
    // not get a second idiom.
    const src = code(read(PANE));
    expect(src).toContain("HORIZON_OPTIONS.map(");
    expect(src).toMatch(/key=\{(?:option|opt|h)\.id\}/);
  });

  it("keys every horizon icon to its own position", () => {
    // Icons differ per horizon, which is a component type varying by position —
    // legal only because each one has its own key in a list, exactly as the
    // category bar does it. What is forbidden is a type that changes at a FIXED
    // position, which is what the status indicator above avoids.
    const src = code(read(PANE));
    expect(src).toMatch(/HORIZON_ICONS\s*:\s*Record<ThreadHorizon,/);
    expect(conditionalElements(read(PANE))).toEqual([]);
  });

  it("dispatches the horizon it means, not a step to the next one", () => {
    const src = code(read(PANE));
    expect(src).toMatch(/threadHorizonSet\(\{\s*threadId,\s*horizon:/);
  });

  it("sets status from an explicit value, so a second press is harmless", () => {
    // No tap debounce (CLAUDE.md), and `disabled` is not a re-entry guard. What
    // makes a repeated press safe here is that the payload is computed from the
    // rendered status: the same render sends the same value twice.
    const src = code(read(PANE));
    expect(src).toMatch(/status: nextStatus\(thread\.status\)/);
    expect(src).not.toContain("useTapGuard");
    expect(src).not.toContain("Date.now(");
  });

  it("dispatches nothing from a text handler", () => {
    // Reducer overhead at keystroke frequency. Title and text draft locally and
    // commit on Save; the pickers are presses, which is the same split
    // EntityEditPane makes for its category bar.
    const src = code(read(PANE));
    const handlers = [...src.matchAll(/onInput=\{([^}]*)\}/g)].map((m) => m[1]);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) expect(handler).not.toContain("dispatch");
  });

  it("names every horizon option's help where the writer can read it", () => {
    // The picker's labels are three words; what they cost in context is not
    // guessable from them. The help line is the only place that is said.
    const src = code(read(PANE));
    expect(src).toMatch(/\.help/);
    expect(HORIZON_OPTIONS.length).toBeGreaterThan(1);
  });
});
