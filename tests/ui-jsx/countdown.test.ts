import { describe, it, expect } from "vitest";
import { remainingSeconds } from "../../src/ui-jsx/panels/header/countdown";

describe("remainingSeconds", () => {
  it("returns 0 for a null endTime", () => {
    expect(remainingSeconds(null, 1000)).toBe(0);
  });

  it("returns 0 when the endTime has elapsed", () => {
    expect(remainingSeconds(5000, 5000)).toBe(0);
    expect(remainingSeconds(4000, 5000)).toBe(0);
  });

  it("ceils partial seconds", () => {
    expect(remainingSeconds(7500, 5000)).toBe(3); // 2500ms → 3s
    expect(remainingSeconds(6001, 5000)).toBe(2); // 1001ms → 2s
  });

  it("counts exact whole seconds", () => {
    expect(remainingSeconds(8000, 5000)).toBe(3); // 3000ms → 3s
  });
});
