import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const header = readFileSync("src/ui/panels/chat/ChatHeader.tsx", "utf8");
const input = readFileSync("src/ui/panels/chat/ChatInput.tsx", "utf8");

describe("the Plan | Build toggle", () => {
  it("re-renders when the mode changes", () => {
    expect(header).toMatch(/\$\{c\.subMode \?\? ""\}/);
  });

  it("renders both buttons always and sets the mode on click", () => {
    expect(header).toContain('case "modeToggle":');
    expect(header).toMatch(/\(\["plan", "build"\] as const\)\.map/);
    expect(header).toMatch(/subModeChanged\(\{ id: chat\.id, subMode: m \}\)/);
  });
});

describe("the chat input", () => {
  it("asks the chat type for a placeholder that fits the chat", () => {
    expect(input).toMatch(/spec\.inputPlaceholderFor\?\.\(chat\)/);
  });
});
