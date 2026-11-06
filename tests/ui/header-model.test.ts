import { describe, it, expect } from "vitest";
import { derive, storeSignature } from "../../src/ui/header/header-model";
import { rootReducer, type RootState } from "../../src/core/store";
import type { RuntimeState } from "../../src/core/store/types";

const NOW = 1_000_000;

function state(runtime: Partial<RuntimeState> = {}): RootState {
  const base = rootReducer(undefined, { type: "@@INIT" });
  return { ...base, runtime: { ...base.runtime, ...runtime } };
}

describe("derive: widget", () => {
  it("is idle, and silent, when nothing runs", () => {
    expect(derive(state(), NOW).widget).toEqual({ mode: "idle", text: "" });
  });

  it("offers Continue while waiting on the writer", () => {
    const m = derive(
      state({ genx: { status: "waiting_for_user", queueLength: 1 } }),
      NOW,
    );
    expect(m.widget).toEqual({ mode: "continue", text: "Continue" });
  });

  it("counts down a budget wait", () => {
    const m = derive(
      state({
        genx: {
          status: "waiting_for_budget",
          queueLength: 1,
          budgetWaitEndTime: NOW + 12_000,
        },
      }),
      NOW,
    );
    expect(m.widget).toEqual({ mode: "wait", text: "Wait (12s)" });
  });

  it("offers Cancel while queued or generating", () => {
    for (const status of ["queued", "generating"] as const) {
      expect(
        derive(state({ genx: { status, queueLength: 1 } }), NOW).widget.mode,
      ).toBe("cancel");
    }
  });
});

describe("derive: status text", () => {
  it("names the oldest job and counts the rest", () => {
    const m = derive(
      state({
        jobs: [
          { id: "a", label: "Reviewing Tam" },
          { id: "b", label: "Reviewing Ilse" },
        ],
      }),
      NOW,
    );
    expect(m.statusText).toBe("Reviewing Tam (+1)");
  });

  it("is empty with no jobs", () => {
    expect(derive(state(), NOW).statusText).toBe("");
  });
});

describe("storeSignature", () => {
  it("changes with every field derive reads", () => {
    const base = storeSignature(state());
    expect(
      storeSignature(state({ genx: { status: "queued", queueLength: 1 } })),
    ).not.toBe(base);
    expect(storeSignature(state({ jobs: [{ id: "a", label: "x" }] }))).not.toBe(
      base,
    );
    expect(
      storeSignature(
        state({
          genx: { status: "idle", queueLength: 0, budgetWaitEndTime: 5 },
        }),
      ),
    ).not.toBe(base);
  });
});
