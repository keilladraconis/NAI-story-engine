import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SeToggle,
  TOGGLE_CLICK_COOLDOWN_MS,
} from "../../../src/ui/components/SeToggle";

describe("SeToggle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips state and fires the callback on a single click", async () => {
    const callback = vi.fn();
    const toggle = new SeToggle({ id: "t", state: { on: false }, callback });

    await toggle.onClick();

    expect(toggle.state.on).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("ignores a repeat click inside the cooldown window", async () => {
    const callback = vi.fn();
    const toggle = new SeToggle({ id: "t", state: { on: false }, callback });

    // Touch surfaces deliver the real click plus a synthesized one.
    await toggle.onClick();
    vi.setSystemTime(TOGGLE_CLICK_COOLDOWN_MS - 1);
    await toggle.onClick();

    expect(toggle.state.on).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("drops a repeat click that arrives while the first is still in flight", async () => {
    const callback = vi.fn();
    const toggle = new SeToggle({ id: "t", state: { on: false }, callback });

    // Both clicks dispatched before either has awaited to completion.
    await Promise.all([toggle.onClick(), toggle.onClick()]);

    expect(toggle.state.on).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("accepts a click once the cooldown has elapsed", async () => {
    const callback = vi.fn();
    const toggle = new SeToggle({ id: "t", state: { on: false }, callback });

    await toggle.onClick();
    vi.setSystemTime(TOGGLE_CLICK_COOLDOWN_MS);
    await toggle.onClick();

    expect(toggle.state.on).toBe(false);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
