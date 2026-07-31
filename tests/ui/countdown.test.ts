import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  remainingSeconds,
  waitLabel,
} from "../../src/ui/header/countdown";

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

describe("waitLabel", () => {
  it("renders the remaining seconds", () => {
    expect(waitLabel(12)).toBe("⏳ Wait (12s)");
    expect(waitLabel(0)).toBe("⏳ Wait (0s)");
  });
});

// Regression guard: the SUI generation button drove a 1s tick loop while in
// budget-wait so the label counted down live. The JSX port dropped that in the
// chat composer, leaving a frozen "⏳ Wait" after the user clicked Continue.
// Any component that branches on `waiting_for_budget` owes the user a ticking
// countdown, which means it must go through `useCountdown`.
describe("budget-wait countdown coverage", () => {
  const UI_DIR = join(__dirname, "../../src/ui");

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return tsxFiles(full);
      return full.endsWith(".tsx") ? [full] : [];
    });
  }

  it("every component branching on waiting_for_budget uses useCountdown", () => {
    const offenders = tsxFiles(UI_DIR).filter((file) => {
      const src = readFileSync(file, "utf8");
      return (
        src.includes('"waiting_for_budget"') && !src.includes("useCountdown")
      );
    });
    expect(offenders).toEqual([]);
  });
});
