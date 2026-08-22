// Static guards over the Engine section — the Setup-tab surface that switches
// the Engine on.
//
// `.tsx` is never collected by vitest here, so the component cannot be
// render-tested; what can be held is its structure, and every invariant below is
// a CLAUDE.md rule with a bug behind it, spelled out at its assertion. Same
// approach and same idioms as `hud-source.test.ts`.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NUMERIC_SETTINGS } from "../../src/ui/panels/setup/engine-settings-model";

const SETUP_DIR = join(__dirname, "../../src/ui/panels/setup");
const SECTION = join(SETUP_DIR, "EngineSettings.tsx");
const HEADER = join(SETUP_DIR, "SectionHeader.tsx");
const SETUP = join(SETUP_DIR, "Setup.tsx");

const sectionSrc = () => readFileSync(SECTION, "utf8");

/** Comments out. This file explains its own rules in prose and names the very
 *  things some scans below forbid ("never onChange", "no updateParts"), so a
 *  scan that counted the prose would bully the documentation into silence. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Index of the `{` that opens the block `from` sits inside. */
function openingBrace(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i >= 0; i--) {
    if (src[i] === "}") depth++;
    else if (src[i] === "{") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/** Index of the `}` closing the block that opens at `start`. */
function closingBrace(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The body of the innermost FUNCTION containing `needle` — walking out through
 * `try`/`if`/object blocks until the brace is preceded by `=>` or a parameter
 * list.
 *
 * "Same function" is the rule being tested, so the scan has to mean the same
 * thing: an assertion over the innermost block alone would fail a save that
 * dispatched correctly but outside its own `try`.
 */
function enclosingFunction(src: string, needle: string): string {
  const at = src.indexOf(needle);
  expect(at).toBeGreaterThan(-1);

  let from = at;
  for (let hop = 0; hop < 12; hop++) {
    const start = openingBrace(src, from);
    expect(start).toBeGreaterThan(-1);
    const before = src.slice(0, start).trimEnd();
    if (/(=>|\))$/.test(before)) {
      const end = closingBrace(src, start);
      expect(end).toBeGreaterThan(-1);
      return src.slice(start, end + 1);
    }
    from = start - 1;
  }
  throw new Error(`no enclosing function for ${needle}`);
}

describe("the save writes and tells the store, in one breath", () => {
  it("dispatches engineSettingsChanged in the same function as the write", () => {
    // The bug this exists for: the writer flips the toggle, storage takes it,
    // and the store still says off — so the HUD goes on asserting "Off — the
    // Engine is not running" until the next generation happens to re-read the
    // slot. Commit 5f71191 fixed that once from the other direction. Nothing
    // else re-reads on a save, so the save must say so itself.
    const body = enclosingFunction(code(sectionSrc()), "writeEngineSettings(");
    expect(body).toContain("store.dispatch(engineSettingsChanged(");
  });

  it("dispatches the same value it stored", () => {
    // Dispatch the raw typed value and the form shows one number while the
    // loop, reading the clamped slot, uses another. One local, normalised once,
    // passed to both.
    const body = enclosingFunction(code(sectionSrc()), "writeEngineSettings(");
    const written = /writeEngineSettings\((\w+)\)/.exec(body);
    const dispatched = /engineSettingsChanged\((\w+)\)/.exec(body);
    expect(written).not.toBeNull();
    expect(dispatched).not.toBeNull();
    expect((dispatched as RegExpExecArray)[1]).toBe(
      (written as RegExpExecArray)[1],
    );
    // …and that local is the normalised object, not what was typed.
    expect(body).toMatch(
      new RegExp(
        `const\\s+${(written as RegExpExecArray)[1]}\\s*=\\s*normalizeEngineSettings\\(`,
      ),
    );
  });

  it("dispatches nowhere else — never from an input handler", () => {
    // Reducer overhead at keystroke frequency is the rule; the deeper one is
    // that a draft nobody has finished typing is not a setting. Exactly one
    // dispatch in the file, and the test above pins where it is.
    const dispatches = [...code(sectionSrc()).matchAll(/store\.dispatch\(/g)];
    expect(dispatches.length).toBe(1);
  });
});

describe("the section renders from the store", () => {
  it("selects the settings out of the slice", () => {
    expect(sectionSrc()).toMatch(/useSlice\(\(s\) => s\.engine\.settings\)/);
  });

  it("never reads storyStorage itself", () => {
    // The startup read, every pass and the generation hook keep the slice
    // current. A second reader in the component is a second answer to "what are
    // the settings", and it would be the one that goes stale.
    expect(code(sectionSrc())).not.toContain("storyStorage");
  });
});

describe("the section obeys the input rules", () => {
  it("never calls updateParts", () => {
    expect(sectionSrc()).not.toContain("updateParts");
    expect(readFileSync(HEADER, "utf8")).not.toContain("updateParts");
  });

  it("binds text entry with onInput and commits on blur", () => {
    // `change` fires only when a modified field commits — i.e. on blur — so an
    // onChange-bound field holds stale local state until focus leaves it, and
    // anything reading before then is a keystroke behind. Drafting is onInput;
    // the commit is its own explicit event.
    // The whole tag, not a `[^>]*` window: the handler bodies contain `=>`,
    // and a scan bounded by the next `>` stops at the first arrow — which is
    // before onBlur and would pass a field that never commits.
    const tags = [...code(sectionSrc()).matchAll(/<input\b[\s\S]*?\/>/g)].map(
      (m) => m[0],
    );
    expect(tags.length).toBe(1);
    for (const tag of tags) {
      expect(tag).not.toContain("onChange=");
      expect(tag).toContain("onInput=");
      expect(tag).toContain("onBlur=");
    }
  });

  it("guards nothing with `disabled` or a tap window", () => {
    // `disabled` is a render-time value a press arriving before the re-render
    // slips past, and the runtime bug behind useTapGuard() is fixed upstream.
    // What holds here instead is the commit queue, which lands both presses.
    const src = code(sectionSrc());
    expect(src).not.toMatch(/\bdisabled[=:]/);
    expect(src).not.toContain("useTapGuard");
    expect(src).not.toContain("Date.now(");
  });
});

describe("the section swaps no component types", () => {
  it("mounts both toggle states and picks with display", () => {
    // Every render here arrives from a store subscription, never from a JSX
    // event handler — exactly when a swapped element leaves the old svg behind.
    const src = sectionSrc();
    expect(src).toContain("<ToggleRight");
    expect(src).toContain("<ToggleLeft");
    const shown = [
      ...src.matchAll(/display: settings\.enabled \? "[a-z-]+" : "[a-z-]+"/g),
    ];
    expect(shown.length).toBe(2);
  });

  it("renders no element behind a condition", () => {
    // Both idioms, and the optional `(` because prettier wraps a multi-line
    // ternary as `? (\n  <Icon />\n) : (` — a scan for `? <` alone would pass
    // the regression it is for.
    for (const file of [SECTION, HEADER]) {
      const offenders = [
        ...code(readFileSync(file, "utf8")).matchAll(
          /(?:[?:]|&&|\|\|)\s*\(?\s*<[A-Za-z]/g,
        ),
      ].map((m) => m[0]);
      expect(offenders).toEqual([]);
    }
  });
});

describe("the box speaks seconds; storage keeps milliseconds", () => {
  // The hazard Task 3 named: the conversion has to land in BOTH directions, or
  // the form breaks the one guarantee it was built around — the number left in
  // the box is the number in use. The behaviour is proved in
  // `engine-settings-model.test.ts`; what is held here is that the component
  // actually goes through those two functions instead of rolling its own.
  it("labels the delay in seconds, not milliseconds", () => {
    const src = sectionSrc();
    expect(src).toContain('label="Delay (seconds)"');
    expect(src).not.toContain("Delay (ms)");
  });

  it("never converts a unit itself", () => {
    // No `/ 1000`, no `* 1000`, and no raw `String(settings.delayMs)` — every
    // conversion is `toTyped`/`draftFor`, so the two directions read one table.
    const src = code(sectionSrc());
    expect(src).not.toContain("1000");
    expect(src).not.toMatch(/String\(settings\./);
  });

  it("fills both boxes from the stored value, converted back", () => {
    // Initial state, the effect that follows the store (which is what shows a
    // clamped number), and the commit that writes the box after a blur.
    const src = code(sectionSrc());
    expect(src).toMatch(/useState\(draftFor\(settings, "delayMs"\)\)/);
    expect(src).toMatch(/useState\(draftFor\(settings, "minProse"\)\)/);
    expect(src).toMatch(/setDelayDraft\(draftFor\(settings, "delayMs"\)\)/);
    expect(src).toMatch(/setProseDraft\(draftFor\(settings, "minProse"\)\)/);
    // The commit shows the RESOLVED settings converted back, not the draft.
    expect(src).toMatch(
      /show\(draftFor\(resolveTypedSetting\(settings, field, draft\), field\)\)/,
    );
  });

  it("prints the delay's bounds in seconds, from the ms bounds", () => {
    // Interpolated, never restated: a bound that moves in `settings.ts` moves in
    // the help text and in the input's own min/max with it.
    const src = code(sectionSrc());
    expect(src).toContain('toTyped("delayMs", DELAY_MS_MIN)');
    expect(src).toContain('toTyped("delayMs", DELAY_MS_MAX)');
  });
});

describe("the section is on the Setup tab", () => {
  it("is imported and mounted by Setup.tsx", () => {
    // Without this the settings have no surface at all: `project.yaml` lost the
    // three entries, and `api.v1.config` could never have written them back.
    const src = readFileSync(SETUP, "utf8");
    expect(src).toContain('from "./EngineSettings"');
    expect(src).toContain("<EngineSettings />");
  });

  it("sits below the opening-scene card", () => {
    const src = readFileSync(SETUP, "utf8");
    expect(src.indexOf("<EngineSettings />")).toBeGreaterThan(
      src.indexOf("<BootstrapButton"),
    );
  });
});

describe("every numeric setting has a field", () => {
  it("builds one NumberField per numeric setting, and commits each by name", () => {
    // The defect: `threadCap` arrived with a default, bounds and a reducer
    // enforcing it, and no control at all — adjustable only by hand-editing
    // storyStorage, which is the one thing §3.1 moved these settings out of
    // read-only `project.yaml` to make impossible. Counted against the model's
    // own list, so the next numeric setting fails here rather than shipping
    // unreachable.
    const src = code(sectionSrc());
    const fields = [...src.matchAll(/<NumberField\b/g)];
    expect(fields.length).toBe(NUMERIC_SETTINGS.length);

    for (const field of NUMERIC_SETTINGS) {
      expect(src).toContain(`commit("${field}"`);
      expect(src).toContain(`draftFor(settings, "${field}")`);
    }
  });

  it("prints the cap's bounds from settings.ts, in the unit it is stored in", () => {
    // A count, not a duration: nothing here converts it, and the two bounds are
    // interpolated rather than restated so moving one in `settings.ts` moves
    // the help text and the input's own min/max with it.
    const src = code(sectionSrc());
    expect(src).toContain("THREAD_CAP_MIN");
    expect(src).toContain("THREAD_CAP_MAX");
    expect(src).not.toContain('toTyped("threadCap"');
  });
});
