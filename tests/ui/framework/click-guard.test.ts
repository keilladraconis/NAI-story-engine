import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ClickGuard,
  CLICK_GUARD_MS,
} from "../../../src/ui/framework/click-guard";

afterEach(() => {
  vi.useRealTimers();
});

describe("ClickGuard", () => {
  it("accepts the first click and drops a repeat inside the window", () => {
    vi.useFakeTimers();
    const guard = new ClickGuard();

    expect(guard.accepts("generate")).toBe(true);
    expect(guard.accepts("generate")).toBe(false);

    vi.advanceTimersByTime(CLICK_GUARD_MS - 1);
    expect(guard.accepts("generate")).toBe(false);

    vi.advanceTimersByTime(1);
    expect(guard.accepts("generate")).toBe(true);
  });

  it("keys the window per action so a mode change isn't swallowed", () => {
    vi.useFakeTimers();
    const guard = new ClickGuard();

    expect(guard.accepts("generate")).toBe(true);
    // Generating flips the button to Cancel — that click must still land.
    expect(guard.accepts("cancel")).toBe(true);
    expect(guard.accepts("cancel")).toBe(false);
  });

  it("wrap() runs the callback once per window", () => {
    vi.useFakeTimers();
    const guard = new ClickGuard();
    const fn = vi.fn();
    const onClick = guard.wrap("save", fn);

    onClick();
    onClick();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CLICK_GUARD_MS);
    onClick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("honours a custom window", () => {
    vi.useFakeTimers();
    const guard = new ClickGuard(50);

    expect(guard.accepts("zap")).toBe(true);
    vi.advanceTimersByTime(49);
    expect(guard.accepts("zap")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(guard.accepts("zap")).toBe(true);
  });
});
