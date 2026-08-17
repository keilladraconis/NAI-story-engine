import { describe, it, expect } from "vitest";
import {
  initialLoopState,
  loopReducer,
  canStartPass,
  type LoopEvent,
  type LoopState,
} from "../../../src/core/engine/loop-machine";

/** Fold a sequence of events, the way the effect does. */
function run(events: LoopEvent[], from: LoopState = initialLoopState) {
  return events.reduce(loopReducer, from);
}

describe("loopReducer — the happy path", () => {
  it("walks assess → triage → drain → idle", () => {
    const s1 = loopReducer(initialLoopState, { type: "passRequested" });
    expect(s1.phase).toBe("assessing");

    const s2 = loopReducer(s1, {
      type: "assessed",
      backlog: 12,
      candidateIds: ["e1"],
    });
    expect(s2.phase).toBe("triaging");
    expect(s2.backlog).toBe(12);

    const s3 = loopReducer(s2, { type: "triaged", intents: [] });
    // Nothing to do: straight to idle rather than a pointless drain.
    expect(s3.phase).toBe("idle");
  });

  it("drains when triage produced intents", () => {
    const s = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 12, candidateIds: [] },
      { type: "triaged", intents: [{ kind: "revise", entityId: "e1" }] },
    ]);
    expect(s.phase).toBe("acting");
    expect(s.queued).toBe(1);
  });

  it("returns to idle with an empty queue once the drain completes", () => {
    const s = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 12, candidateIds: [] },
      { type: "triaged", intents: [{ kind: "revise", entityId: "e1" }] },
      { type: "drained" },
    ]);
    expect(s.phase).toBe("idle");
    expect(s.queued).toBe(0);
  });

  it("ends the pass at zero cost when there is too little new prose", () => {
    const s = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 0, candidateIds: [] },
    ]);
    expect(s.phase).toBe("idle");
  });
});

describe("loopReducer — the conditions the HUD shows", () => {
  it("holds when the budget cannot cover the next step", () => {
    const s = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 12, candidateIds: [] },
      { type: "budgetExhausted" },
    ]);
    expect(s.phase).toBe("held");
  });

  it("leaves held on the next pass request", () => {
    const held = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 9, candidateIds: [] },
      { type: "budgetExhausted" },
    ]);
    expect(loopReducer(held, { type: "passRequested" }).phase).toBe(
      "assessing",
    );
  });

  it("stalls only after repeated failures, not after one", () => {
    // A single refusal is routine (§3.4) and must never reach the HUD.
    let s = run([{ type: "passRequested" }, { type: "failed" }]);
    expect(s.phase).toBe("idle");
    expect(s.consecutiveFailures).toBe(1);

    for (let i = 0; i < 3; i++) {
      s = loopReducer(loopReducer(s, { type: "passRequested" }), {
        type: "failed",
      });
    }
    expect(s.phase).toBe("stalled");
  });

  it("clears the stall as soon as a pass gets past assessment", () => {
    let s = initialLoopState;
    for (let i = 0; i < 4; i++) {
      s = loopReducer(loopReducer(s, { type: "passRequested" }), {
        type: "failed",
      });
    }
    expect(s.phase).toBe("stalled");

    s = run(
      [
        { type: "passRequested" },
        { type: "assessed", backlog: 3, candidateIds: [] },
      ],
      s,
    );
    expect(s.phase).toBe("triaging");
    expect(s.consecutiveFailures).toBe(0);
  });
});

describe("canStartPass", () => {
  it("is true when idle or held, false while a pass is under way", () => {
    expect(canStartPass(initialLoopState)).toBe(true);

    const assessing = loopReducer(initialLoopState, { type: "passRequested" });
    expect(canStartPass(assessing)).toBe(false);

    const triaging = loopReducer(assessing, {
      type: "assessed",
      backlog: 5,
      candidateIds: [],
    });
    expect(canStartPass(triaging)).toBe(false);
  });

  it("ignores a second request while a pass is running", () => {
    // The ⚡ is not idempotent and a wasted pass costs real budget, so a press
    // mid-pass must be a no-op rather than a second pass.
    const assessing = loopReducer(initialLoopState, { type: "passRequested" });
    const again = loopReducer(assessing, { type: "passRequested" });
    expect(again).toBe(assessing);
  });
});
