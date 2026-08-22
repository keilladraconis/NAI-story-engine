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
const PANEL = join(WORLD_DIR, "World.tsx");
const SELECT = join(WORLD_DIR, "world-select.ts");
const FORGE = join(
  __dirname,
  "../../src/core/store/effects/handlers/forge-chat.ts",
);

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

describe("the World panel refuses a hand create at the cap", () => {
  // The reducer displaces the weakest thread to make room, which is §4.5's
  // trade for *triage* — the Engine chose to spend something. A writer pressing
  // "+" has chosen nothing, and one unconfirmed click destroying an authored
  // thread is the opposite of the two-click confirm the delete on the same
  // panel asks for. The reducer invariant stays (it is the backstop for the
  // Forge and for phase 6's triage); the refusal is here.
  it("reads its whole appearance off the model, so the panel states no second cap", () => {
    const src = code(read(PANEL));
    expect(src).toContain("threadAddModel(");
    expect(src).toMatch(/title=\{addThread\.title\}/);
    expect(src).toContain("{addThread.count}");
    // The old literal, which said nothing about where the writer stands.
    expect(src).not.toContain('title="Add thread"');
  });

  it("refuses in the handler, not in a `disabled` prop", () => {
    // CLAUDE.md: `disabled` is a render-time value, so a press arriving before
    // the re-render that sets it still gets through — and a disabled button
    // swallows the hover that shows the tooltip explaining why nothing
    // happened. `aria-disabled` says unavailable without either cost.
    const src = code(read(PANEL));
    expect(src).toMatch(/if \(!addThread\.enabled\) return;/);
    expect(src).toMatch(/aria-disabled=\{!addThread\.enabled\}/);
    expect(src).not.toMatch(/(?<!aria-)disabled=\{/);
  });

  it("keeps the count visible before the ceiling, not only at it", () => {
    // "Show the writer where they stand" — the limit lives on the Setup tab,
    // so a panel that only spoke up at the boundary would be the first mention
    // of a number that has been true all along. `count` is rendered
    // unconditionally, never behind a ternary.
    const src = code(read(PANEL));
    expect(
      [...src.matchAll(/(?:[?:]|&&|\|\|)\s*\{?\s*addThread\.count/g)].length,
    ).toBe(0);
  });

  it("counts every thread the cap counts, not the ones the body renders", () => {
    // `selectWorldBody` drops a forge draft's thread from the list; the reducer
    // counts it all the same, so reading `visibleThreads.length` here would
    // promise room the create does not have.
    const src = code(read(PANEL));
    expect(src).toMatch(/threadAddModel\(threads\.length, threadCap\)/);
  });
});

describe("both thread creators go through the one action", () => {
  // What the reducer-level cap test in `tests/core/store/slices/world.test.ts`
  // asserts about repeated creates is only worth anything if these two are in
  // fact the callsites. That test cannot see them; this can.
  it("names the World panel and the Forge, and nothing else", () => {
    for (const file of [PANEL, FORGE]) {
      expect(code(read(file))).toMatch(/dispatch\(\s*threadCreated\(/);
    }
  });

  it("leaves the cap to the reducer — neither trims the list itself", () => {
    for (const file of [PANEL, FORGE]) {
      const src = code(read(file));
      expect(src).not.toContain("enforceThreadCap");
      expect(src).not.toContain("displacementOrder");
    }
  });
});
