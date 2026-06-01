import { describe, it, expect } from "vitest";
import {
  FORGE_SKETCH_PROMPT,
  FORGE_EXPAND_PROMPT,
  FORGE_WEAVE_PROMPT,
  FORGE_CLEANUP_PROMPT,
} from "../../../src/core/utils/prompts";

describe("Forge phase prompts", () => {
  it("sketch prompt emphasizes CREATE-heavy breadth and ends with CRITIQUE", () => {
    expect(FORGE_SKETCH_PROMPT).toMatch(/CREATE/);
    expect(FORGE_SKETCH_PROMPT).toMatch(/CRITIQUE/);
    expect(FORGE_SKETCH_PROMPT.length).toBeGreaterThan(200);
  });

  it("expand prompt mentions REVISE, DELETE, and same-turn cleanup", () => {
    expect(FORGE_EXPAND_PROMPT).toMatch(/REVISE/);
    expect(FORGE_EXPAND_PROMPT).toMatch(/DELETE/);
    expect(FORGE_EXPAND_PROMPT).toMatch(/CRITIQUE/);
    expect(FORGE_EXPAND_PROMPT.toLowerCase()).toMatch(
      /when you (emit |use )?delete.*revise/s,
    );
  });

  it("weave prompt emphasizes THREAD and SITUATION CREATE for collision points", () => {
    expect(FORGE_WEAVE_PROMPT).toMatch(/THREAD/);
    expect(FORGE_WEAVE_PROMPT).toMatch(/SITUATION/);
    expect(FORGE_WEAVE_PROMPT).toMatch(/CRITIQUE/);
  });

  it("cleanup prompt is REVISE-only, no CREATE, no CRITIQUE", () => {
    expect(FORGE_CLEANUP_PROMPT).toMatch(/REVISE/);
    expect(FORGE_CLEANUP_PROMPT).not.toMatch(/\bCREATE\b/);
    expect(FORGE_CLEANUP_PROMPT).not.toMatch(/\bCRITIQUE\b/);
  });

  it("all phase prompts assert draft-only modification (D: prefix or 'drafts only')", () => {
    for (const p of [
      FORGE_SKETCH_PROMPT,
      FORGE_EXPAND_PROMPT,
      FORGE_WEAVE_PROMPT,
    ]) {
      expect(p).toMatch(/D:|drafts only|never modify.*live/i);
    }
  });
});
