import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { remainingSeconds, waitLabel } from "../../src/ui/header/countdown";

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

// The generation state machine has exactly one home: header-model.ts's
// derive(). A JSX click cannot clear the harness's FlagB interaction flag, so a
// Continue or Wait button rendered in the Preact tree is dead UI — it looks
// interactive and does nothing. This guard is what stops the machine leaking
// back into JSX in a later change.
describe("generation state machine lives only in the UIPart header", () => {
  const UI_DIR = join(__dirname, "../../src/ui");

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return tsxFiles(full);
      return full.endsWith(".tsx") ? [full] : [];
    });
  }

  it("no JSX component branches on waiting_for_budget", () => {
    const offenders = tsxFiles(UI_DIR).filter((file) =>
      readFileSync(file, "utf8").includes('"waiting_for_budget"'),
    );
    expect(offenders).toEqual([]);
  });

  it("header-model.ts owns the branch", () => {
    const src = readFileSync(join(UI_DIR, "header/header-model.ts"), "utf8");
    expect(src).toContain('"waiting_for_budget"');
    expect(src).toContain('"waiting_for_user"');
  });
});
