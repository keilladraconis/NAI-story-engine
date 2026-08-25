// Static guards over the HUD component and its registration.
//
// `.tsx` is never collected by vitest here, so a component cannot be
// render-tested — the invariants that matter for `Hud.tsx` are structural, and
// structure is exactly what a source scan can hold. Each one below is a CLAUDE.md
// rule with a history behind it, spelled out at its assertion.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const UI_DIR = join(__dirname, "../../src/ui");
const HUD = join(UI_DIR, "hud/Hud.tsx");
const HUD_MODEL = join(UI_DIR, "hud/hud-model.ts");
const MOUNT = join(UI_DIR, "mount.ts");

const hudSrc = () => readFileSync(HUD, "utf8");
const mountSrc = () => readFileSync(MOUNT, "utf8");

/** Comments out. These files explain their own rules in prose — mount.ts names
 *  `api.v1.ui.register()` in its header, and a scan that counted that would
 *  either miscount or bully the documentation into silence. Applied only where
 *  the guard is about code shape; the "never mentions X" scans stay literal. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The `HudState` union, read out of the model rather than restated here: a
 *  sixth reading added there has to grow the component's icon table, and this is
 *  what notices. */
function hudStates(): string[] {
  const src = readFileSync(HUD_MODEL, "utf8");
  const union = /export type HudState =([^;]+);/.exec(src);
  expect(union).not.toBeNull();
  return [...(union as RegExpExecArray)[1].matchAll(/"([a-z]+)"/g)].map(
    (m) => m[1],
  );
}

/** The `STATE_ICONS` table's body — the one place the component names a state. */
function stateIconTable(): string {
  const block = /const STATE_ICONS[\s\S]*?\n\];/.exec(hudSrc());
  expect(block).not.toBeNull();
  return (block as RegExpExecArray)[0];
}

/** The names imported from the feather set — every icon the line can draw. */
function featherImports(): string[] {
  // `[^{}]*` and not `[\s\S]*?`: a lazy any-character match starts at the
  // FIRST `import {` in the file and runs all the way to this one, which
  // reports every module the HUD imports as an icon.
  const block = /import \{([^{}]*)\} from "nai:icons\/feather";/.exec(hudSrc());
  expect(block).not.toBeNull();
  return (block as RegExpExecArray)[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

describe("Hud.tsx renders every state, and swaps no component types", () => {
  it("mounts one icon per HudState and toggles display", () => {
    // CLAUDE.md: never swap a component TYPE at a fixed position — a re-render
    // from a detached callback leaves both svgs in the DOM, and every render the
    // HUD does is detached (store subscription or timer tick). Mount all of
    // them; let `display` pick. `Header.tsx`'s WidgetIcon is the same shape.
    const states = hudStates();
    expect(states.length).toBeGreaterThan(1);

    const table = stateIconTable();
    for (const state of states) expect(table).toContain(`"${state}"`);
    // Exactly one row per state: no duplicates, nothing left out.
    const named = [...table.matchAll(/"([a-z]+)"/g)]
      .map((m) => m[1])
      .filter((name) => states.includes(name));
    expect(named.sort()).toEqual([...states].sort());

    // …and the table is actually rendered, every row of it, with `display`
    // deciding which one shows.
    const src = hudSrc();
    expect(src).toContain("STATE_ICONS.map(");
    expect(src).toMatch(/display:\s*props\.state === state \?/);
  });

  it("renders no element behind a condition", () => {
    // The failure mode this file exists for: an element that is present in some
    // renders and absent in others, at a fixed position. Every render here is
    // detached — a store subscription and a 5s tick — which is exactly when the
    // old node is left behind. The HUD's slots are all always present by design
    // (§9.1: fixed slots, always in the same position).
    //
    // BOTH idioms, and the second is the more common one. A scan for the
    // ternary alone passed `{cond && <AlertTriangle/>}` — verified, and it is
    // what a future edit would most likely reach for.
    //
    // The optional `(` is not decoration either: prettier wraps a multi-line
    // ternary as `? (\n  <Icon />\n) : (` , so a scan for `? <` alone passes the
    // exact regression this test is for. It did, on the first attempt.
    const offenders = [
      ...code(hudSrc()).matchAll(/(?:[?:]|&&|\|\|)\s*\(?\s*<[A-Za-z]/g),
    ].map((m) => m[0]);
    expect(offenders).toEqual([]);
  });
});

describe("Hud.tsx is a line of icons with tooltips, not glyphs", () => {
  it("draws no icon twice", () => {
    // The writer's complaint was that the glyphs were hard to comprehend, and
    // the repair is icons — which only works while each icon means exactly one
    // thing. §9.1's own example line spends the pencil twice, once as the
    // acting state and once as the touched count; two pencils on a line meant
    // to be read as a shape is the thing this test refuses.
    const imported = featherImports();
    expect(imported.length).toBeGreaterThan(1);

    const body = code(hudSrc()).replace(
      /import \{[^{}]*\} from "nai:icons\/feather";/,
      "",
    );
    for (const name of imported) {
      const uses = [...body.matchAll(new RegExp(`\\b${name}\\b`, "g"))];
      expect([name, uses.length]).toEqual([name, 1]);
    }
  });

  it("gives every count slot a tooltip that says what its number means", () => {
    // A modeline teaches nothing on its own: the tooltip is the only place its
    // vocabulary can be learned, so a slot without one is a number nobody can
    // decode. Each title must name its own model field, so a copy-pasted slot
    // cannot end up explaining the one next to it.
    const src = code(hudSrc());
    for (const field of ["backlog", "threads", "touched"]) {
      expect(src).toMatch(
        new RegExp(`title=\\{\`[^\`]*\\$\\{model\\.${field}\\}[^\`]*\`\\}`),
      );
    }
    // …and the two slots that are not counts carry one too.
    expect(src).toMatch(/title=\{`Output budget/);
    expect(src).toMatch(/title="Run a pass now"/);
  });

  it("says `open` on the thread slot, and where the rest of the list went", () => {
    // The label and the number have to agree. The tooltip read "N open
    // thread(s)" over a count of every thread, satisfied ones included — so
    // marking one satisfied, the single action the slot asks for, moved it by
    // zero. The number is now the open ones; the total rides in the same
    // sentence, because the cap counts that instead.
    const src = code(hudSrc());
    expect(src).toMatch(
      /\$\{model\.threads\} open of \$\{model\.threadsTotal\}/,
    );
  });

  it("does not promise the rewrite count is a branch count", () => {
    // Phase 5's finding class, and it outlived the machinery that caused it.
    // The number is a session accumulator fed from the drain — it counts
    // intents, condenses included, survives a branch switch and dies on a
    // reload. It once claimed "on this branch", which a navigation-time recount
    // half-delivered and which nothing delivers now that Story Engine's records
    // move forward only. A slot explaining itself wrongly is worse than one
    // that says nothing.
    const src = code(hudSrc());
    const title = /title=\{`Rewrites[^`]*`\}/.exec(src)?.[0] ?? "";
    expect(title).not.toContain("on this branch");
    expect(title).not.toContain("branch you land on");
    // What it does say: both actions it counts, the window it counts over, and
    // that undo is not one of the things that moves it.
    expect(title).toContain("condenses");
    expect(title).toContain("since this story was opened");
    expect(title).toContain("undo does not take them back");
  });

  it("spends no bare unicode on a count", () => {
    // `12¶ ⚑5 ∆0` is the line as it read before this: feather icons for the
    // state and unadorned unicode for the counts, and the unicode half is the
    // half nobody could read.
    expect(code(hudSrc())).not.toMatch(/[¶⚑∆]/);
  });

  it("keeps the budget as four bars", () => {
    // The one slot that reports a LEVEL rather than a count. No single icon can
    // show how full something is, so this one stays a gauge.
    const src = code(hudSrc());
    expect(src).toContain("BAR_SLOTS.map(");
    expect(src).toMatch(/length: BUDGET_BARS/);
  });
});

describe("Hud.tsx obeys the input rules", () => {
  it("never calls updateParts", () => {
    // Nothing in src/ calls it; the HUD is not the exception. The panel hands
    // NAI one frozen part spec and everything that changes lives in the Preact
    // tree.
    expect(hudSrc()).not.toContain("updateParts");
  });

  it("guards the ⚡ with neither `disabled` nor a tap window", () => {
    // `disabled` is a render-time value: a press arriving before the re-render
    // that sets it still gets through. And the runtime bug that motivated
    // `useTapGuard()` is fixed upstream — the hook was deleted in 0.14.1 and
    // CLAUDE.md forbids reintroducing a timestamp debounce. The real guard is
    // the pass effect's, where a genuine second press lands.
    const src = hudSrc();
    expect(src).not.toMatch(/\bdisabled[=:]/);
    expect(src).not.toContain("useTapGuard");
    expect(src).not.toContain("Date.now(");
  });

  it("dispatches the pass request and nothing else", () => {
    expect(hudSrc()).toContain("store.dispatch(enginePassRequested())");
  });
});

describe("mount.ts registers the HUD in the one register call", () => {
  it("still makes exactly one api.v1.ui.register call", () => {
    // NAI takes a single call and later calls overwrite earlier ones, so a
    // second register() here would silently drop the sidebar.
    const calls = [...code(mountSrc()).matchAll(/api\.v1\.ui\.register\(/g)];
    expect(calls.length).toBe(1);
  });

  it("puts the HUD panel in the array that call receives", () => {
    const src = mountSrc();
    expect(src).toContain('from "./hud/Hud"');
    expect(src).toMatch(/scriptPanel\(\{\s*id: "kse-hud"/);
    // Unconditional — a scriptPanel cannot be dismissed, and the HUD is present
    // even with the Engine switched off so "nothing is happening" is visible.
    expect(src).toMatch(
      /const panels: UIExtension\[\] = \[[\s\S]*?buildHudPanel\(\)[\s\S]*?\];/,
    );
  });
});
