import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  deriveHud,
  hudSignature,
  budgetBarsOf,
  BUDGET_BARS,
  OUTPUT_BUCKET,
  type HudInputs,
} from "../../src/ui/hud/hud-model";
import {
  initialLoopState,
  loopReducer,
  type LoopPhase,
  type LoopState,
} from "../../src/core/engine/loop-machine";
import { ENGINE_DEFAULTS } from "../../src/core/engine/settings";
import { initialWorldState } from "../../src/core/store/slices/world";
import type { RootState } from "../../src/core/store";
import type {
  Thread,
  ThreadStatus,
  WorldState,
} from "../../src/core/store/types";

const INPUTS: HudInputs = { allowedOutput: OUTPUT_BUCKET };

/** Enabled by default: these cases are about what the machine's phases read as,
 *  and an Engine that is switched off reads "off" regardless of phase. The
 *  "switched off" describe below is where that is exercised.
 *
 *  `enabled` is spelled flat here and folded into the slice's `settings` object,
 *  so the cases below stay about the one field they are testing rather than
 *  restating the whole settings record. */
function state(
  engine: Partial<LoopState> & { enabled?: boolean } = {},
  world: Partial<WorldState> = {},
): RootState {
  const { enabled = true, ...loop } = engine;
  return {
    engine: {
      ...initialLoopState,
      ...loop,
      settings: { ...ENGINE_DEFAULTS, enabled },
    },
    world: { ...initialWorldState, ...world },
  } as RootState;
}

/** `status` is a parameter, not a constant. It was hardcoded to "open", which
 *  meant no case in this file could tell "count every thread" apart from "count
 *  the open ones" — the two readings the slot had to choose between. */
function thread(id: string, status: ThreadStatus = "open"): Thread {
  return {
    id,
    title: id,
    text: "",
    horizon: "plot",
    entityIds: [],
    status,
  };
}

const ALL_PHASES: LoopPhase[] = [
  "idle",
  "assessing",
  "triaging",
  "acting",
  "held",
  "stalled",
];

describe("deriveHud — the state slot", () => {
  it("reads ◉ watching at rest", () => {
    expect(deriveHud(state({ phase: "idle" }), INPUTS).stateIcon).toBe(
      "watching",
    );
  });

  it("reads ◐ reading while the pass is deciding", () => {
    // Both assess and triage are the pass deciding, and neither writes anything
    // to the World — so ✎ is not theirs to claim.
    expect(deriveHud(state({ phase: "assessing" }), INPUTS).stateIcon).toBe(
      "reading",
    );
    expect(deriveHud(state({ phase: "triaging" }), INPUTS).stateIcon).toBe(
      "reading",
    );
  });

  it("reads ✎ acting only while acting", () => {
    expect(deriveHud(state({ phase: "acting" }), INPUTS).stateIcon).toBe(
      "acting",
    );
  });

  it("reads ⏸ held when the budget could not cover the next step", () => {
    expect(deriveHud(state({ phase: "held" }), INPUTS).stateIcon).toBe("held");
  });
});

describe("deriveHud — ⚠ means only `stalled`", () => {
  it("shows ⚠ for stalled", () => {
    expect(deriveHud(state({ phase: "stalled" }), INPUTS).stateIcon).toBe(
      "stalled",
    );
  });

  it("shows ⚠ for NOTHING else — held included", () => {
    // §9.1: a slot that lights up routinely is a slot the writer learns to
    // ignore. `held` is a legitimate pause, not an alarm.
    for (const phase of ALL_PHASES.filter((p) => p !== "stalled")) {
      expect(deriveHud(state({ phase }), INPUTS).stateIcon).not.toBe("stalled");
    }
  });

  it("stays quiet through routine concurrency refusals", () => {
    // A retryable failure is the writer generating (§3.4). The machine drops it
    // before the counter and rests at idle, so the HUD must read `watching` —
    // however many times it happens.
    let s = initialLoopState;
    for (let i = 0; i < 10; i++) {
      s = loopReducer(s, { type: "passRequested" });
      s = loopReducer(s, { type: "failed", retryable: true });
      expect(deriveHud(state(s), INPUTS).stateIcon).toBe("watching");
    }
    expect(s.consecutiveFailures).toBe(0);
  });

  it("lights ⚠ once real failures reach the machine's threshold", () => {
    let s = initialLoopState;
    for (let i = 0; i < 4; i++) {
      s = loopReducer(s, { type: "passRequested" });
      s = loopReducer(s, { type: "failed", retryable: false });
    }
    expect(deriveHud(state(s), INPUTS).stateIcon).toBe("stalled");
  });
});

describe("deriveHud — held and stalled are not transient", () => {
  it("keeps reading ⏸ / ⚠ for as long as the state says so", () => {
    // The model is a pure function of state with no clock, so nothing can decay
    // on its own — repeated derivation is the assertion.
    const held = state({ phase: "held" });
    const stalled = state({ phase: "stalled", consecutiveFailures: 4 });
    for (let i = 0; i < 3; i++) {
      expect(deriveHud(held, INPUTS).stateIcon).toBe("held");
      expect(deriveHud(stalled, INPUTS).stateIcon).toBe("stalled");
    }
  });

  it("clears only when a later pass gets somewhere", () => {
    let s: LoopState = { ...initialLoopState, phase: "held" };
    s = loopReducer(s, { type: "passRequested" });
    expect(deriveHud(state(s), INPUTS).stateIcon).toBe("reading");
    s = loopReducer(s, { type: "assessed", backlog: 0, candidateIds: [] });
    expect(deriveHud(state(s), INPUTS).stateIcon).toBe("watching");
  });
});

describe("deriveHud — the counting slots", () => {
  it("reads the backlog the last assessment left", () => {
    expect(deriveHud(state({ backlog: 14 }), INPUTS).backlog).toBe(14);
  });

  it("counts the OPEN threads, which is what the slot says it counts", () => {
    // §9.1 defines this slot as context pressure — "climbing means go close
    // some" — and §4.4 retires a satisfied thread by disabling its entry, so a
    // satisfied thread costs no context. A number that counted them anyway
    // would not move when the writer did the one thing the slot asks for.
    const m = deriveHud(
      state(
        {},
        {
          threads: [
            thread("a"),
            thread("b", "satisfied"),
            thread("c"),
            thread("d", "satisfied"),
          ],
        },
      ),
      INPUTS,
    );
    expect(m.threads).toBe(2);
  });

  it("also carries the whole list, because that is what the cap counts", () => {
    // The cap (§4.5) is over every thread, satisfied ones included, and the
    // tooltip says both — "2 open of 4 the story is carrying". The slot shows
    // one number; the sentence is where the other belongs.
    const m = deriveHud(
      state({}, { threads: [thread("a"), thread("b", "satisfied")] }),
      INPUTS,
    );
    expect(m.threads).toBe(1);
    expect(m.threadsTotal).toBe(2);
  });

  it("reads 0 open once every thread is satisfied", () => {
    // The phase-4 defect this repeats otherwise: a counter that never reads 0
    // however much work the writer does.
    const m = deriveHud(
      state({}, { threads: [thread("a", "satisfied")] }),
      INPUTS,
    );
    expect(m.threads).toBe(0);
    expect(m.threadsTotal).toBe(1);
  });

  it("passes the revision count straight through", () => {
    // Zero until the drain's revise arm landed (phase 6, Task 3), and still
    // the honest reading on a session that has revised nothing.
    expect(deriveHud(state(), INPUTS).touched).toBe(0);
    expect(deriveHud(state({ touched: 23 }), INPUTS).touched).toBe(23);
  });
});

describe("budgetBarsOf", () => {
  it("draws four bars for a full bucket", () => {
    expect(budgetBarsOf(OUTPUT_BUCKET)).toBe(BUDGET_BARS);
  });

  it("draws none only when there is nothing left", () => {
    // Rounded up so an empty bar is unambiguous: §9.1's compound readings need
    // "empty budget" to mean empty.
    expect(budgetBarsOf(0)).toBe(0);
    expect(budgetBarsOf(1)).toBe(1);
  });

  it("bands the bucket in quarters", () => {
    expect(budgetBarsOf(512)).toBe(1);
    expect(budgetBarsOf(513)).toBe(2);
    expect(budgetBarsOf(1024)).toBe(2); // a full entry rewrite (§3.3)
    expect(budgetBarsOf(1025)).toBe(3);
    expect(budgetBarsOf(1536)).toBe(3);
    expect(budgetBarsOf(1537)).toBe(4); // a rewrite plus its triage
  });

  it("clamps a runtime number outside the bucket", () => {
    expect(budgetBarsOf(9999)).toBe(BUDGET_BARS);
    expect(budgetBarsOf(-1)).toBe(0);
    expect(budgetBarsOf(Number.NaN)).toBe(0);
  });

  it("is what the model's budget slot reports", () => {
    expect(deriveHud(state(), { allowedOutput: 700 }).budgetBars).toBe(2);
  });
});

describe("deriveHud — the ⚡", () => {
  it("reads available from every resting phase, including held and stalled", () => {
    // The budget may have recovered, or whatever blocked progress may have
    // cleared, and finding out costs nothing.
    for (const phase of ["idle", "held", "stalled"] as LoopPhase[]) {
      expect(deriveHud(state({ phase }), INPUTS).zapEnabled).toBe(true);
    }
  });

  it("reads unavailable while a pass is under way", () => {
    for (const phase of ["assessing", "triaging", "acting"] as LoopPhase[]) {
      expect(deriveHud(state({ phase }), INPUTS).zapEnabled).toBe(false);
    }
  });
});

describe("hudSignature", () => {
  it("changes when any slot the model reads changes", () => {
    const base = hudSignature(state());
    expect(hudSignature(state({ phase: "acting" }))).not.toBe(base);
    expect(hudSignature(state({ backlog: 3 }))).not.toBe(base);
    expect(hudSignature(state({ touched: 1 }))).not.toBe(base);
    expect(hudSignature(state({}, { threads: [thread("a")] }))).not.toBe(base);
    // Satisfying a thread moves the slot, so it has to move the signature —
    // the list length is unchanged, and a signature reading only that would
    // leave the line stale until something else repainted it.
    expect(
      hudSignature(state({}, { threads: [thread("a", "satisfied")] })),
    ).not.toBe(hudSignature(state({}, { threads: [thread("a")] })));
  });

  it("ignores store churn the modeline has no slot for", () => {
    // No queue slot in §9.1, so repainting on `queued` would be churn.
    expect(hudSignature(state({ queued: 7 }))).toBe(hudSignature(state()));
  });
});

// The loop's state machine has exactly one reader in the UI: deriveHud. This is
// the same guard tests/ui/countdown.test.ts keeps over genx.status, and for the
// same reason — that guard is why the header never drifted. Two surfaces reading
// the raw phase is how they come to disagree about whether the Engine is
// reading, acting, or stuck. Unlike countdown's, this scan covers `.ts` as well
// as `.tsx`: the models it is protecting are `.ts` files.
describe("the loop phase is read only by hud-model", () => {
  const UI_DIR = join(__dirname, "../../src/ui");
  const OWNER = join(UI_DIR, "hud/hud-model.ts");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
    });
  }

  const others = () => sourceFiles(UI_DIR).filter((f) => f !== OWNER);
  const offenders = (needle: string) =>
    others()
      .filter((f) => readFileSync(f, "utf8").includes(needle))
      .map((f) => relative(UI_DIR, f));

  it("no other file under src/ui reads engine.phase", () => {
    expect(offenders("engine.phase")).toEqual([]);
  });

  it("no other file branches on a machine-internal phase", () => {
    // Components key off the HudState deriveHud hands back. `assessing` and
    // `triaging` exist nowhere else in the union, so a switch over LoopPhase
    // anywhere else in the UI trips this.
    expect(offenders('"assessing"')).toEqual([]);
    expect(offenders('"triaging"')).toEqual([]);
  });

  it("no other file destructures phase off the engine slice", () => {
    // The literal `engine.phase` scan above is escapable, and this is how:
    //   const { phase } = store.getState().engine;
    // then a branch on any phase name that HudState also uses — `acting`,
    // `held`, `stalled` — which the scan above deliberately does not catch,
    // because those are legitimate HudState names in the component.
    //
    // So catch the destructuring instead of the branch. Reaching `phase` out of
    // the engine slice at all is the thing only deriveHud may do.
    const destructures = sourceFiles(UI_DIR)
      .filter((f) => !f.endsWith(join("hud", "hud-model.ts")))
      .filter((f) =>
        /\{[^}]*\bphase\b[^}]*\}\s*=\s*[^;]*\bengine\b/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => relative(UI_DIR, f));
    expect(destructures).toEqual([]);
  });

  it("no other file under src/ui imports the loop machine", () => {
    expect(offenders("engine/loop-machine")).toEqual([]);
  });

  it("hud-model.ts owns the read", () => {
    const src = readFileSync(OWNER, "utf8");
    expect(src).toContain("engine.phase");
    expect(src).toContain('"triaging"');
  });

  it("the HUD does not read genx at all", () => {
    // A genuinely different state machine (§9.1). Conflating the Engine's states
    // with the generation queue's is how the two surfaces drift. The scan is
    // case-sensitive on purpose: `genx` is the slice field, while "GenX" is the
    // engine's name and appears in prose across the tree.
    const hudFiles = sourceFiles(join(UI_DIR, "hud"));
    const withGenx = hudFiles
      .filter((f) => readFileSync(f, "utf8").includes("genx"))
      .map((f) => relative(UI_DIR, f));
    expect(withGenx).toEqual([]);
  });
});

describe("deriveHud — switched off", () => {
  it("reads off rather than watching when the Engine is disabled", () => {
    // The slot whose whole job is "whether it's alive" must be able to say no.
    // Reading `watching` for a disabled Engine makes "alive and idle" and "not
    // running" the same line, on the surface §9.1 builds to carry trust.
    const m = deriveHud(state({ enabled: false }), INPUTS);
    expect(m.stateIcon).toBe("off");
  });

  it("reads off whatever phase the last pass left behind", () => {
    for (const phase of ALL_PHASES) {
      expect(
        deriveHud(state({ enabled: false, phase }), INPUTS).stateIcon,
      ).toBe("off");
    }
  });

  it("makes the zap read unavailable while off", () => {
    // The effect refuses the pass for the same reason, so appearance and
    // behaviour agree — off means off, including for the manual control.
    expect(deriveHud(state({ enabled: false }), INPUTS).zapEnabled).toBe(false);
  });

  it("moves the signature when the setting changes", () => {
    expect(hudSignature(state({ enabled: false }))).not.toBe(
      hudSignature(state({ enabled: true })),
    );
  });
});
