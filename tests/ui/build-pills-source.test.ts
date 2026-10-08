import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const pills = readFileSync("src/ui/panels/chat/BuildPills.tsx", "utf8");
const message = readFileSync("src/ui/panels/chat/Message.tsx", "utf8");

describe("BuildPills", () => {
  it("mounts every body and toggles its display", () => {
    expect(pills).toMatch(
      /display:\s*open\[i\]\s*&&\s*pill\.body\.length\s*>\s*0\s*\?\s*"block"\s*:\s*"none"/,
    );
    expect(pills).not.toMatch(/open\[i\]\s*&&\s*</);
  });

  it("collapses everything when its instance is reused for another message", () => {
    expect(pills).toMatch(
      /useEffect\(\(\) => \{\s*setOpen\(\{\}\);\s*\}, \[props\.resetKey\]\)/,
    );
  });

  it("captions the private and wish parts", () => {
    expect(pills).toContain("Never shown to the story model.");
  });

  it("drives the caption's display from the part's unseen flag", () => {
    expect(pills).toMatch(
      /display:\s*part\.unseen\s*\?\s*"block"\s*:\s*"none"/,
    );
  });
});

describe("Message", () => {
  it("mounts both the text and the pills, and shows one", () => {
    expect(message).toMatch(
      /<BuildPills[\s\S]*?hidden=\{!isBuild\}[\s\S]*?resetKey=\{message\.id\}/,
    );
    expect(message).toMatch(/display:\s*isBuild\s*\?\s*"none"\s*:\s*"block"/);
  });
});
