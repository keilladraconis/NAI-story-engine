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

  it("has nothing open when its instance is reused for another message", () => {
    // The open set is held with the key it belongs to and compared during
    // render, so a different `resetKey` reads as nothing open in that same
    // render, and an unchanged one changes nothing.
    expect(pills).toMatch(
      /const open\s*=\s*held\.key === props\.resetKey \? held\.open : NONE;/,
    );
    expect(pills).not.toContain("useEffect");
  });

  it("opens a pill against the current key, never a reused instance's", () => {
    expect(pills).toMatch(
      /setHeld\(\(h\) => \{\s*const was = h\.key === props\.resetKey \? h\.open : NONE;\s*return \{ key: props\.resetKey, open: \{ \.\.\.was, \[i\]: !was\[i\] \} \};/,
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
