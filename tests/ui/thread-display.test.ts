// What a horizon and a status say to the writer, and where those words come
// from.
//
// The World's thread surfaces are `.tsx` and therefore never collected here
// (vitest is `environment: "node"`, `include: tests/**/*.test.ts`), so the
// vocabulary lives in a `.ts` module the components only render. That split is
// the point: what a horizon MEANS is testable, and the components are left with
// nothing but layout.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HORIZON_OPTIONS,
  STATUS_OPTIONS,
  horizonOption,
  horizonQuietParagraphs,
  nextStatus,
  statusOption,
} from "../../src/ui/panels/world/thread-display";
import {
  PARAGRAPH_CHARS,
  THREAD_RANGE_CHARS,
} from "../../src/core/engine/thread-horizon";
import type { ThreadHorizon, ThreadStatus } from "../../src/core/store/types";

/** A string-literal union, read out of `types.ts` rather than restated here —
 *  the same trick `hud-source.test.ts` uses on `HudState`. A fourth horizon
 *  added to the type has to reach the picker, and this is what notices. */
function unionMembers(name: string): string[] {
  const src = readFileSync(
    join(__dirname, "../../src/core/store/types.ts"),
    "utf8",
  );
  const union = new RegExp(`export type ${name} =([^;]+);`).exec(src);
  expect(union).not.toBeNull();
  return [...(union as RegExpExecArray)[1].matchAll(/"([a-z]+)"/g)].map(
    (m) => m[1],
  );
}

describe("the horizon picker offers every horizon there is", () => {
  it("has one option per member of ThreadHorizon, and no others", () => {
    // A horizon missing from the picker is a horizon a writer can be given by
    // the Forge and can never set or clear by hand.
    expect(HORIZON_OPTIONS.map((o) => o.id).sort()).toEqual(
      unionMembers("ThreadHorizon").sort(),
    );
  });

  it("offers them in ascending scale, which is the order they are spent in", () => {
    // Same order as `HORIZON_WEIGHT` in `thread-cap.ts`, where the shortest
    // horizon is the first the cap gives up. A picker that ran the other way
    // would read as a ranking of importance pointing the wrong way.
    expect(HORIZON_OPTIONS.map((o) => o.id)).toEqual(["point", "plot", "arc"]);
  });

  it("gives each one a label and a help line that names its own scale", () => {
    for (const option of HORIZON_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.help).toContain(String(horizonQuietParagraphs(option.id)));
    }
    // …and no two say the same thing, which is what makes the choice a choice.
    const helps = HORIZON_OPTIONS.map((o) => o.help);
    expect(new Set(helps).size).toBe(helps.length);
  });
});

describe("horizonOption", () => {
  it("hands back the very option the picker renders, for every horizon", () => {
    // The pane shows the selected horizon's help line every render. A `find`
    // over the list would type as possibly-undefined for a value the union says
    // is always there, and the defence written around that is where a second
    // copy of the vocabulary starts.
    for (const option of HORIZON_OPTIONS) {
      expect(horizonOption(option.id)).toBe(option);
    }
  });
});

describe("the help line is derived from the condition, not written next to it", () => {
  it("counts paragraphs out of the range the detector actually uses", () => {
    // `thread-condition.ts` builds the probe from `THREAD_RANGE_CHARS`. If the
    // picker restated "about ten paragraphs" as prose, a range moved there
    // would leave the pane quietly lying about what the setting does.
    for (const horizon of ["point", "plot", "arc"] as ThreadHorizon[]) {
      expect(horizonQuietParagraphs(horizon)).toBe(
        Math.round(THREAD_RANGE_CHARS[horizon] / PARAGRAPH_CHARS),
      );
    }
    // The numbers as they stand, so a silent change to either constant is
    // visible in a diff: ~3 paragraphs, ~10, ~30.
    expect(HORIZON_OPTIONS.map((o) => horizonQuietParagraphs(o.id))).toEqual([
      3, 10, 30,
    ]);
  });

  it("orders the horizons the same way their ranges do", () => {
    const paragraphs = HORIZON_OPTIONS.map((o) => horizonQuietParagraphs(o.id));
    expect([...paragraphs].sort((a, b) => a - b)).toEqual(paragraphs);
  });
});

describe("status is two readings, and both are spelled out", () => {
  it("has one option per member of ThreadStatus", () => {
    expect(STATUS_OPTIONS.map((o) => o.id).sort()).toEqual(
      unionMembers("ThreadStatus").sort(),
    );
  });

  it("names each one for the reader rather than for the store", () => {
    expect(statusOption("open").label).toBe("Open");
    expect(statusOption("satisfied").label).toBe("Satisfied");
    for (const option of STATUS_OPTIONS) {
      expect(option.help.length).toBeGreaterThan(0);
    }
  });

  it("says what pressing the control will do, not only what is true now", () => {
    // The pane's control is a button, and a button whose tooltip describes the
    // current state leaves the writer guessing what it does.
    expect(statusOption("open").action).toContain("satisfied");
    expect(statusOption("satisfied").action).toContain("open");
  });
});

describe("nextStatus", () => {
  it("is the other one", () => {
    expect(nextStatus("open")).toBe("satisfied");
    expect(nextStatus("satisfied")).toBe("open");
  });

  it("is its own inverse, so a control built on it cannot drift", () => {
    for (const status of ["open", "satisfied"] as ThreadStatus[]) {
      expect(nextStatus(nextStatus(status))).toBe(status);
    }
  });

  it("computes the value the action carries, which is what makes it idempotent", () => {
    // CLAUDE.md forbids a tap debounce, so the intent has to survive being
    // delivered twice. The pane sends `nextStatus(current)` as an explicit
    // status rather than dispatching a toggle: a second press against the same
    // rendered state sends the same value, and lands the same value.
    const rendered: ThreadStatus = "open";
    expect(nextStatus(rendered)).toBe(nextStatus(rendered));
  });
});
