import { describe, it, expect } from "vitest";
import { isDuplicateTap, TAP_WINDOW_MS } from "../../src/ui/tap-guard";

describe("isDuplicateTap", () => {
  it("the first tap is never a duplicate", () => {
    expect(isDuplicateTap(0, 0)).toBe(false);
    expect(isDuplicateTap(0, 999999)).toBe(false);
  });

  it("swallows the mobile ghost click that follows one tap", () => {
    // Both clicks of a single tap land within the same gesture.
    expect(isDuplicateTap(1000, 1000)).toBe(true);
    expect(isDuplicateTap(1000, 1000 + TAP_WINDOW_MS - 1)).toBe(true);
  });

  it("lets a deliberate second tap through once the window passes", () => {
    expect(isDuplicateTap(1000, 1000 + TAP_WINDOW_MS)).toBe(false);
    expect(isDuplicateTap(1000, 5000)).toBe(false);
  });
});
