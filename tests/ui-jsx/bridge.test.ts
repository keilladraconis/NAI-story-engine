import { describe, it, expect, vi } from "vitest";
import { sliceStore } from "../../src/ui-jsx/bridge";
import { store, attgUpdated, styleUpdated } from "../../src/core/store";

describe("sliceStore", () => {
  it("getSnapshot returns the currently selected value", () => {
    store.dispatch(attgUpdated({ attg: "hello" }));
    const { getSnapshot } = sliceStore((s) => s.foundation.attg);
    expect(getSnapshot()).toBe("hello");
  });

  it("calls onChange when the selected value changes", () => {
    const onChange = vi.fn();
    const { subscribe } = sliceStore((s) => s.foundation.attg);
    const unsub = subscribe(onChange);
    store.dispatch(attgUpdated({ attg: "changed" }));
    expect(onChange).toHaveBeenCalled();
    unsub();
  });

  it("does not call onChange when an unrelated slice changes", () => {
    const onChange = vi.fn();
    const { subscribe } = sliceStore((s) => s.foundation.attg);
    const unsub = subscribe(onChange);
    store.dispatch(styleUpdated({ style: "unrelated" }));
    expect(onChange).not.toHaveBeenCalled();
    unsub();
  });

  it("stops notifying after unsubscribe", () => {
    const onChange = vi.fn();
    const { subscribe } = sliceStore((s) => s.foundation.attg);
    const unsub = subscribe(onChange);
    unsub();
    store.dispatch(attgUpdated({ attg: "after-unsub" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
