import { describe, it, expect } from "vitest";
import {
  derive,
  storeSignature,
  formatOutputBudget,
  type DeriveInputs,
} from "../../src/ui/header/header-model";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import { initialUIState } from "../../src/core/store/slices/ui";
import type { RootState } from "../../src/core/store";
import type { RuntimeState, UIState } from "../../src/core/store/types";

const INPUTS: DeriveInputs = {
  allowedOutput: 4200,
  now: 1_000_000,
};

function state(
  runtime: Partial<RuntimeState> = {},
  ui: Partial<UIState> = {},
): RootState {
  return {
    runtime: { ...initialRuntimeState, ...runtime },
    ui: { ...initialUIState, ...ui },
  } as RootState;
}

describe("formatOutputBudget", () => {
  it("spells the count out in full, never abbreviated", () => {
    // An abbreviated "2.0k out" reads as jargon; the exact number is what a
    // user reasons about when a generation is about to stall.
    expect(formatOutputBudget(412)).toBe("GenX: 412 tokens");
    expect(formatOutputBudget(2000)).toBe("GenX: 2000 tokens");
    expect(formatOutputBudget(12345)).toBe("GenX: 12345 tokens");
  });

  it("agrees in number", () => {
    expect(formatOutputBudget(1)).toBe("GenX: 1 token");
    expect(formatOutputBudget(0)).toBe("GenX: 0 tokens");
  });
});

describe("derive — widget mode", () => {
  it("shows the output budget when idle", () => {
    const m = derive(state(), INPUTS);
    expect(m.widget).toEqual({ mode: "budget", text: "GenX: 4200 tokens" });
  });

  it("shows Continue while waiting on the user", () => {
    const m = derive(
      state({ genx: { status: "waiting_for_user", queueLength: 0 } }),
      INPUTS,
    );
    expect(m.widget).toEqual({ mode: "continue", text: "Continue" });
  });

  it("counts down while waiting on budget", () => {
    const m = derive(
      state({
        genx: {
          status: "waiting_for_budget",
          queueLength: 0,
          budgetWaitEndTime: INPUTS.now + 12_000,
        },
      }),
      INPUTS,
    );
    expect(m.widget).toEqual({ mode: "wait", text: "Wait (12s)" });
  });

  it("offers Cancel while generating and while queued", () => {
    for (const status of ["generating", "queued"] as const) {
      const m = derive(state({ genx: { status, queueLength: 1 } }), INPUTS);
      expect(m.widget).toEqual({ mode: "cancel", text: "Cancel" });
    }
  });

  it("falls back to budget for completed and failed", () => {
    for (const status of ["completed", "failed"] as const) {
      const m = derive(state({ genx: { status, queueLength: 0 } }), INPUTS);
      expect(m.widget.mode).toBe("budget");
    }
  });
});

describe("derive — status text", () => {
  it("passes SEGA status text straight through", () => {
    const m = derive(
      state({
        sega: { ...initialRuntimeState.sega, statusText: "Characters 3/7" },
      }),
      INPUTS,
    );
    expect(m.statusText).toBe("Characters 3/7");
  });
});

describe("storeSignature", () => {
  it("is stable for an unchanged state", () => {
    expect(storeSignature(state())).toBe(storeSignature(state()));
  });

  it("changes for every field derive reads", () => {
    const base = storeSignature(state());
    const variants = [
      state({ genx: { status: "generating", queueLength: 0 } }),
      state({
        genx: { status: "idle", queueLength: 0, budgetWaitEndTime: 5 },
      }),
      state({ sega: { ...initialRuntimeState.sega, statusText: "x" } }),
    ];
    for (const v of variants) {
      expect(storeSignature(v)).not.toBe(base);
    }
  });
});
