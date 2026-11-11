import { describe, it, expect } from "vitest";
import {
  derive,
  percent,
  storeSignature,
} from "../../src/ui/header/header-model";
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
  const jobs = [
    {
      id: "a",
      label: "Reviewing Tam",
      expectMs: 10_000,
      expectChars: 400,
      startedAt: NOW - 2_300,
    },
    {
      id: "b",
      label: "Reviewing Ilse",
      expectMs: 10_000,
      expectChars: 400,
      startedAt: 0,
    },
  ];

  it("names the oldest job and counts the rest", () => {
    const m = derive(state({ jobs }), NOW);
    expect(m.statusText).toBe("Reviewing Tam… · 1 more");
  });

  it("measures how far a generating reply has got", () => {
    const m = derive(
      state({ jobs, genx: { status: "generating", queueLength: 2 } }),
      NOW,
    );
    expect(m.statusText).toBe("Reviewing Tam 20%… · 1 more");
    expect(m.busy).toBe(true);
  });

  it("is empty with no jobs", () => {
    expect(derive(state(), NOW).statusText).toBe("");
  });
});

describe("percent", () => {
  it("runs with time to 90% at the expected time, then eases", () => {
    expect(percent(0, 10_000)).toBe(0);
    expect(percent(5_000, 10_000)).toBe(45);
    expect(percent(10_000, 10_000)).toBe(90);
    expect(percent(20_000, 10_000)).toBe(95);
    expect(percent(1e9, 10_000)).toBe(99);
    expect(percent(10, 0)).toBe(0);
  });

  it("is pushed on by the reply streaming in", () => {
    expect(percent(1_000, 10_000, 300, 400)).toBe(75);
  });
});

describe("storeSignature", () => {
  it("changes with every field derive reads", () => {
    const base = storeSignature(state());
    expect(
      storeSignature(state({ genx: { status: "queued", queueLength: 1 } })),
    ).not.toBe(base);
    expect(
      storeSignature(
        state({
          jobs: [
            { id: "a", label: "x", expectMs: 1, expectChars: 1, startedAt: 0 },
          ],
        }),
      ),
    ).not.toBe(base);
    expect(
      storeSignature(
        state({
          genx: { status: "idle", queueLength: 0, budgetWaitEndTime: 5 },
        }),
      ),
    ).not.toBe(base);
  });
});
