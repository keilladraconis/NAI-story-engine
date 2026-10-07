import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = readFileSync(join(__dirname, "../../src/ui/App.tsx"), "utf8");

describe("which actions move the writer to another tab", () => {
  it("casting every draft lands on the Engine tab, where they now are", () => {
    expect(app).toMatch(
      /matchesAction\(forgeCastAllRequested\), \(\) => \{\s*setTab\("engine"\)/,
    );
  });

  it("discarding every draft leaves the writer in the chat they did it from", () => {
    expect(app).not.toContain("forgeDiscardAllRequested");
  });
});
