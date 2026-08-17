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

  it("renders no element behind a ternary", () => {
    // The failure mode this file exists for: `{cond ? <A/> : <B/>}` at a fixed
    // position. Any JSX element in a conditional branch trips this, which also
    // catches the milder `{cond ? <span/> : null}` — the HUD's slots are all
    // always present by design (§9.1: fixed slots, always in the same position).
    //
    // The optional `(` is not decoration: prettier wraps a multi-line ternary as
    // `? (\n  <Icon />\n) : (` , so a scan for `? <` alone passes the exact
    // regression this test is for. It did, on the first attempt.
    const offenders = [
      ...code(hudSrc()).matchAll(/[?:]\s*\(?\s*<[A-Za-z]/g),
    ].map((m) => m[0]);
    expect(offenders).toEqual([]);
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
