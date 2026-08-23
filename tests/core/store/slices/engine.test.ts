// The engine slice's three non-machine actions, and the one §7 added.
//
// `engineLoopEvent` folds the machine and is tested through `loop-machine.ts`.
// The others exist because something outside the lifecycle has to be able to
// write one field without moving `phase` — and that is exactly what has to be
// held: an action here that touched `phase` would move the HUD's state icon
// from outside the state machine.
import { describe, it, expect } from "vitest";
import {
  engineSliceReducer,
  engineTouchedRecounted,
  initialEngineState,
} from "../../../../src/core/store/slices/engine";

describe("engineTouchedRecounted — §9.1's ∆, recounted from the branch", () => {
  it("sets the count rather than adding to it", () => {
    // §7 hands it the number of `lb:` records at the node just navigated to.
    // An increment would add the branch's total to a session tally that already
    // counted some of the same writes.
    const state = engineSliceReducer(
      { ...initialEngineState, touched: 7 },
      engineTouchedRecounted({ touched: 2 }),
    );
    expect(state.touched).toBe(2);
  });

  it("returns the same state when the number has not changed", () => {
    // Navigation is a gesture a writer repeats and the HUD subscribes to this
    // slice; a new object per Ctrl+Z would repaint it for an unchanged number.
    const before = { ...initialEngineState, touched: 2 };
    expect(
      engineSliceReducer(before, engineTouchedRecounted({ touched: 2 })),
    ).toBe(before);
  });

  it("does not move the phase", () => {
    const before = { ...initialEngineState, phase: "acting" as const };
    expect(
      engineSliceReducer(before, engineTouchedRecounted({ touched: 4 })).phase,
    ).toBe("acting");
  });
});
