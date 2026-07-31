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
import type {
  GenerationRequest,
  RuntimeState,
  UIState,
} from "../../src/core/store/types";

const INPUTS: DeriveInputs = {
  allowedOutput: 4200,
  hasDocumentContent: false,
  now: 1_000_000,
};

function req(type: GenerationRequest["type"], id: string): GenerationRequest {
  return { id, type, targetId: "t", status: "queued" };
}

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
  it("prints a bare count below 1k", () => {
    expect(formatOutputBudget(412)).toBe("412 out");
    expect(formatOutputBudget(999)).toBe("999 out");
  });

  it("switches to one-decimal k at 1000", () => {
    expect(formatOutputBudget(1000)).toBe("1.0k out");
    expect(formatOutputBudget(1234)).toBe("1.2k out");
  });
});

describe("derive — widget mode", () => {
  it("shows the output budget when idle", () => {
    const m = derive(state(), INPUTS);
    expect(m.widget).toEqual({ mode: "budget", text: "4.2k out" });
  });

  it("shows Continue while waiting on the user", () => {
    const m = derive(
      state({ genx: { status: "waiting_for_user", queueLength: 0 } }),
      INPUTS,
    );
    expect(m.widget).toEqual({ mode: "continue", text: "⚠️ Continue" });
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
    expect(m.widget).toEqual({ mode: "wait", text: "⏳ Wait (12s)" });
  });

  it("offers Cancel while generating and while queued", () => {
    for (const status of ["generating", "queued"] as const) {
      const m = derive(state({ genx: { status, queueLength: 1 } }), INPUTS);
      expect(m.widget).toEqual({ mode: "cancel", text: "🚫 Cancel" });
    }
  });

  it("falls back to budget for completed and failed", () => {
    for (const status of ["completed", "failed"] as const) {
      const m = derive(state({ genx: { status, queueLength: 0 } }), INPUTS);
      expect(m.widget.mode).toBe("budget");
    }
  });
});

describe("derive — bootstrap, status text, import", () => {
  it("labels bootstrap from document content", () => {
    expect(derive(state(), INPUTS).bootstrap.text).toBe("⚡ Opening Scene");
    expect(
      derive(state(), { ...INPUTS, hasDocumentContent: true }).bootstrap.text,
    ).toBe("⚡ Continue Scene");
  });

  it("disables bootstrap while its request is queued", () => {
    const m = derive(state({ queue: [req("bootstrap", "b1")] }), INPUTS);
    expect(m.bootstrap.disabled).toBe(true);
  });

  it("disables bootstrap while its request is active", () => {
    const m = derive(
      state({
        activeRequest: {
          ...req("bootstrapContinue", "b2"),
          status: "processing",
        },
      }),
      INPUTS,
    );
    expect(m.bootstrap.disabled).toBe(true);
  });

  it("leaves bootstrap enabled for unrelated work", () => {
    const m = derive(state({ queue: [req("foundation", "f1")] }), INPUTS);
    expect(m.bootstrap.disabled).toBe(false);
  });

  it("passes SEGA status text straight through", () => {
    const m = derive(
      state({
        sega: { ...initialRuntimeState.sega, statusText: "Characters 3/7" },
      }),
      INPUTS,
    );
    expect(m.statusText).toBe("Characters 3/7");
  });

  it("disables import only while the wizard is open", () => {
    expect(derive(state(), INPUTS).importDisabled).toBe(false);
    expect(
      derive(state({}, { importWizardOpen: true }), INPUTS).importDisabled,
    ).toBe(true);
  });
});

describe("storeSignature", () => {
  it("is stable for an unchanged state", () => {
    expect(storeSignature(state())).toBe(storeSignature(state()));
  });

  it("changes when a same-length queue swaps contents", () => {
    // The load-bearing case: cancelling a queued bootstrap while a foundation
    // request is enqueued leaves queue.length at 1, but bootstrap.disabled has
    // to flip. A length-only signature would miss it and go stale.
    const before = storeSignature(state({ queue: [req("bootstrap", "b1")] }));
    const after = storeSignature(state({ queue: [req("foundation", "f1")] }));
    expect(before).not.toBe(after);
  });

  it("changes for every field derive reads", () => {
    const base = storeSignature(state());
    const variants = [
      state({ genx: { status: "generating", queueLength: 0 } }),
      state({
        genx: { status: "idle", queueLength: 0, budgetWaitEndTime: 5 },
      }),
      state({ sega: { ...initialRuntimeState.sega, statusText: "x" } }),
      state({ queue: [req("bootstrap", "b1")] }),
      state({
        activeRequest: { ...req("chat", "c1"), status: "processing" },
      }),
      state({ historyEpoch: 1 }),
      state({}, { importWizardOpen: true }),
    ];
    for (const v of variants) {
      expect(storeSignature(v)).not.toBe(base);
    }
  });
});
