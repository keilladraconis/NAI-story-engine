import { describe, it, expect } from "vitest";
import {
  FORGE_SKETCH_PROMPT,
  FORGE_EXPAND_PROMPT,
  FORGE_WEAVE_PROMPT,
  FORGE_CLEANUP_PROMPT,
} from "../../../src/core/utils/prompts";
import {
  buildBrainstormPrompt,
  normalizeRegisterKey,
  BRAINSTORM_FRAME,
  BRAINSTORM_CRITIC_FRAME,
  BRAINSTORM_REGISTERS,
  INTENSITY_LEVEL_LABELS,
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

describe("brainstorm register prompts", () => {
  const allKeys = [...INTENSITY_LEVEL_LABELS, "unset"] as const;

  it("normalizeRegisterKey maps levels case-insensitively and falls back to unset", () => {
    expect(normalizeRegisterKey("Cozy")).toBe("Cozy");
    expect(normalizeRegisterKey("cozy")).toBe("Cozy");
    expect(normalizeRegisterKey("NIGHTMARE")).toBe("Nightmare");
    expect(normalizeRegisterKey(null)).toBe("unset");
    expect(normalizeRegisterKey(undefined)).toBe("unset");
    expect(normalizeRegisterKey("")).toBe("unset");
    expect(normalizeRegisterKey("Whimsical")).toBe("unset");
  });

  it("every (mode, register) composes a non-empty prompt that starts with its frame", () => {
    for (const key of allKeys) {
      const co = buildBrainstormPrompt("cowriter", key);
      const cr = buildBrainstormPrompt("critic", key);
      expect(co.startsWith(BRAINSTORM_FRAME)).toBe(true);
      expect(cr.startsWith(BRAINSTORM_CRITIC_FRAME)).toBe(true);
      expect(co.length).toBeGreaterThan(BRAINSTORM_FRAME.length);
      expect(cr.length).toBeGreaterThan(BRAINSTORM_CRITIC_FRAME.length);
    }
  });

  it("registers are distinct per level (no copy-paste collisions)", () => {
    const cowriterBlocks = allKeys.map((k) => BRAINSTORM_REGISTERS[k].cowriter);
    expect(new Set(cowriterBlocks).size).toBe(cowriterBlocks.length);
    const criticBlocks = allKeys.map((k) => BRAINSTORM_REGISTERS[k].critic);
    expect(new Set(criticBlocks).size).toBe(criticBlocks.length);
    expect(buildBrainstormPrompt("cowriter", "Cozy")).not.toEqual(
      buildBrainstormPrompt("cowriter", "Nightmare"),
    );
  });

  it("Cozy does not require friction/conflict (the reported failure)", () => {
    const cozyCo = BRAINSTORM_REGISTERS.Cozy.cowriter;
    expect(cozyCo).toMatch(/optional, not required/i);
    expect(cozyCo).toMatch(/frictionless/i);
    expect(cozyCo).toMatch(/warmth/i);
    expect(cozyCo).not.toMatch(/engine here is small relational friction/i);

    const cozyCr = BRAINSTORM_REGISTERS.Cozy.critic;
    expect(cozyCr).toMatch(/do not demand/i);
    expect(cozyCr).toMatch(/missing specificity, not missing conflict/i);
    expect(cozyCr).toMatch(/complete with no friction at all/i);
  });

  it("Noir critic is distinct from Gritty (systemic trap, not one costly choice)", () => {
    const noir = BRAINSTORM_REGISTERS.Noir.critic;
    expect(noir).toMatch(/that's Gritty/i);
    expect(noir).toMatch(/deepen the rot/i);
  });
});
