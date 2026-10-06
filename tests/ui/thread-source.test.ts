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
import { STATUS_OPTIONS } from "../../src/ui/panels/world/thread-display";

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

/** The feather icons a file imports, or none when it imports no icons at all.
 *
 *  This used to assert the import existed, as its own guard against a scan that
 *  silently covered nothing. That made a file with no icons a FAILURE rather
 *  than a file with nothing to get wrong — which is what `ThreadItem` became
 *  once it stopped rendering a chevron and a layers glyph. The non-empty check
 *  belongs at the callsite that needs one, not here. */
function featherIcons(src: string): string[] {
  const imports = /import \{([^{}]*)\} from "nai:icons\/feather";/.exec(src);
  if (!imports) return [];
  return (imports as RegExpExecArray)[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** Icons rendered behind a conditional operator — the shape CLAUDE.md forbids,
 *  narrowed to the elements it actually bites on.
 *
 *  Narrowed on purpose: `{collapsed ? null : <div>…</div>}` mounts or unmounts a
 *  subtree, which is not the defect. The defect is one component TYPE giving way
 *  to another at a FIXED position, and in these files every such pair is a pair
 *  of icons. */
function conditionalIcons(src: string): string[] {
  const body = code(src);
  const icons = featherIcons(src);
  if (icons.length === 0) return [];
  const pattern = new RegExp(
    `(?:[?:]|&&|\\|\\|)\\s*\\(?\\s*<(${icons.join("|")})\\b`,
    "g",
  );
  return [...body.matchAll(pattern)].map((m) => m[1]);
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
    // here is detached — the status moves when the store moves, and it
    // moves during the Engine's own pass, with no press anywhere near it.
    const src = read(ICON);
    expect(src).toContain("<CheckCircle");
    expect(src).toContain("<Circle");

    // One `display` toggle per reading, derived from STATUS_OPTIONS rather
    // than counted by hand — a fourth status must not be able to arrive with
    // no glyph of its own and silently render as another one.
    const toggles = [
      ...code(src).matchAll(/display: [a-z]+ \? "[a-z-]+" : "[a-z-]+"/g),
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

describe("a concluded thread reads as concluded in the World list", () => {
  it("gives every thread row the same status slot, in the same place", () => {
    // §9.1's instinct, applied to a list: fixed slots, always present, always
    // in the same position, so the column is scanned rather than decoded. A
    // slot that appeared only on concluded threads would be a second list in
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
    expect(src).toMatch(/const concluded = thread\.status !== "open"/);
    expect(src).toMatch(/opacity: concluded \?/);
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

describe("the edit pane's presses and typing", () => {
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
    // Reducer overhead at keystroke frequency. Title, state and notes draft
    // locally and commit on Save.
    const src = code(read(PANE));
    const handlers = [...src.matchAll(/onInput=\{([^}]*)\}/g)].map((m) => m[1]);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) expect(handler).not.toContain("dispatch");
  });

  it("renders no element behind a condition", () => {
    expect(conditionalElements(read(PANE))).toEqual([]);
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
});

describe("the World panel and the thread row swap no icon types", () => {
  // Pre-existing, in a file this phase edited: the expand/collapse-all icon,
  // the S.E.G.A. icon and the row's chevron each replaced one component type
  // with another at a fixed position. §14.2 fixed `MemberToggle` two files away
  // on exactly this argument, so these are the same rule's remaining cases.
  it("renders no icon behind a conditional", () => {
    // Positive control: `conditionalIcons` returns [] both for a clean file and
    // for one with no icons to scan, so at least one file under test must
    // actually import some — otherwise this passes by covering nothing.
    expect(featherIcons(read(PANEL)).length).toBeGreaterThan(0);
    for (const file of [PANEL, ITEM]) {
      expect(conditionalIcons(read(file))).toEqual([]);
    }
  });

  it("mounts every variant and lets `display` pick", () => {
    // The World panel's two pairs: expanded/collapsed, and S.E.G.A. running or
    // not. Both conditions come from `useSlice`, so the repaint arrives from a
    // store subscription rather than from the click's own render — the case
    // where the old svg is left behind.
    const panel = code(read(PANEL));
    for (const [icon, when] of [
      ["Minimize2", "worldExpanded"],
      ["Maximize2", "worldExpanded"],
      ["FastForward", "segaRunning"],
      ["PlayCircle", "segaRunning"],
    ]) {
      expect(panel).toMatch(
        new RegExp(`<${icon}[^>]*display: ${when} \\?`, "s"),
      );
    }

    // The concluded fold's chevron, in the panel. The row's own expand/collapse
    // pair is gone: a thread no longer wraps its cast, so there is nothing left
    // beneath it to collapse.
    for (const icon of ["ChevronDown", "ChevronRight"]) {
      expect(panel).toMatch(
        new RegExp(`<${icon}[^>]*display: concludedOpen \\?`, "s"),
      );
    }
  });
});

describe("the World panel's add-thread control never refuses", () => {
  it("reads its whole appearance off the model, so the panel states no second cap", () => {
    const src = code(read(PANEL));
    expect(src).toContain("threadAddModel(openThreads.length, threadCap)");
    expect(src).toMatch(/title=\{addThread\.title\}/);
    expect(src).toContain("{addThread.count}");
    expect(src).not.toContain("aria-disabled");
    expect(src).not.toMatch(/(?<!aria-)disabled=\{/);
  });
});

describe("the edit pane keeps the private half private", () => {
  const pane = readFileSync("src/ui/panels/world/ThreadEditPane.tsx", "utf8");

  it("labels each field with who reads it", () => {
    expect(pane).toContain(
      "What the story model sees when this cast is on the page.",
    );
    expect(pane).toContain("Never shown to the story model.");
  });

  it("saves both halves in one action", () => {
    expect(pane).toMatch(
      /threadLedgerUpdated\(\{\s*threadId,\s*state: state\.value\.trim\(\),\s*latent: latent\.value\.trim\(\),/,
    );
  });

  it("never stages a generation into the private notes", () => {
    expect(pane).not.toMatch(/latent\.setValue\(live\)/);
  });
});

describe("the World list shows a Thread's state and nothing private", () => {
  const item = readFileSync("src/ui/panels/world/ThreadItem.tsx", "utf8");

  it("renders state", () => {
    expect(item).toContain("{thread.state}");
  });

  it("never reads the private notes", () => {
    expect(item).not.toContain("latent");
  });
});
