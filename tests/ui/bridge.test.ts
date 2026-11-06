import { describe, it, expect, vi } from "vitest";
import { sliceStore } from "../../src/ui/bridge";
import { store, briefUpdated } from "../../src/core/store";

describe("sliceStore", () => {
  it("getSnapshot returns the currently selected value", () => {
    store.dispatch(briefUpdated({ title: "hello" }));
    const { getSnapshot } = sliceStore((s) => s.canon.brief.title);
    expect(getSnapshot()).toBe("hello");
  });

  it("calls onChange when the selected value changes", () => {
    const onChange = vi.fn();
    const { subscribe } = sliceStore((s) => s.canon.brief.title);
    const unsub = subscribe(onChange);
    store.dispatch(briefUpdated({ title: "changed" }));
    expect(onChange).toHaveBeenCalled();
    unsub();
  });

  it("does not call onChange when an unrelated field changes", () => {
    const onChange = vi.fn();
    const { subscribe } = sliceStore((s) => s.canon.brief.title);
    const unsub = subscribe(onChange);
    store.dispatch(briefUpdated({ genre: "unrelated" }));
    expect(onChange).not.toHaveBeenCalled();
    unsub();
  });

  it("stops notifying after unsubscribe", () => {
    const onChange = vi.fn();
    const { subscribe } = sliceStore((s) => s.canon.brief.title);
    const unsub = subscribe(onChange);
    unsub();
    store.dispatch(briefUpdated({ title: "after-unsub" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
