import { describe, it, expect } from "vitest";
import {
  FORGE_CLEANUP_PROMPT,
  LOREBOOK_GENERATE_PROMPT,
  normalizeRegisterKey,
  INTENSITY_LEVEL_LABELS,
} from "../../../src/core/utils/prompts";

describe("Forge cleanup prompt", () => {
  it("cleanup prompt is REVISE-only, no CREATE, no CRITIQUE", () => {
    expect(FORGE_CLEANUP_PROMPT).toMatch(/REVISE/);
    expect(FORGE_CLEANUP_PROMPT).not.toMatch(/\bCREATE\b/);
    expect(FORGE_CLEANUP_PROMPT).not.toMatch(/\bCRITIQUE\b/);
  });
});

describe("register keys", () => {
  it("normalizeRegisterKey maps levels case-insensitively and falls back to unset", () => {
    expect(normalizeRegisterKey("Cozy")).toBe("Cozy");
    expect(normalizeRegisterKey("cozy")).toBe("Cozy");
    expect(normalizeRegisterKey("NIGHTMARE")).toBe("Nightmare");
    expect(normalizeRegisterKey(null)).toBe("unset");
    expect(normalizeRegisterKey(undefined)).toBe("unset");
    expect(normalizeRegisterKey("")).toBe("unset");
    expect(normalizeRegisterKey("Whimsical")).toBe("unset");
  });
});

describe("lorebook archivist prompt", () => {
  it("carries the weaving cross-reference instruction (relocated from the shared prefix)", () => {
    expect(LOREBOOK_GENERATE_PROMPT).toMatch(
      /Weave these connections naturally/,
    );
    expect(LOREBOOK_GENERATE_PROMPT).toMatch(
      /Characters may belong to factions/,
    );
  });
});

import {
  SCENARIO_PROMPT,
  SCENARIO_REGISTERS,
  SCENARIO_GROW_INSTRUCTION,
  FOUNDATION_SITUATION_PROMPT,
  buildScenarioPrompt,
} from "../../../src/core/utils/prompts";

describe("the Scenario prompt", () => {
  it("has a register text for every intensity and for none", () => {
    for (const level of [...INTENSITY_LEVEL_LABELS, "unset" as const]) {
      expect(SCENARIO_REGISTERS[level].length).toBeGreaterThan(0);
      expect(buildScenarioPrompt(level)).toBe(
        `${SCENARIO_PROMPT}\n\n${SCENARIO_REGISTERS[level]}`,
      );
    }
  });

  it("has no newline inside a sentence", () => {
    for (const text of [SCENARIO_PROMPT, FOUNDATION_SITUATION_PROMPT]) {
      for (const line of text.split("\n")) {
        expect(line).not.toMatch(/[a-z,]$/);
      }
    }
  });

  it("has no newline inside a register", () => {
    for (const text of Object.values(SCENARIO_REGISTERS)) {
      expect(text).not.toContain("\n");
    }
  });

  it("lets an unset register sketch once the conversation has settled the pressure", () => {
    expect(SCENARIO_REGISTERS.unset).toMatch(/YES: sketch at that pressure/);
    expect(SCENARIO_REGISTERS.unset).toMatch(
      /NO: write no command and no CRITIQUE/,
    );
  });

  it("says before its example that the example is shorter than a sketch", () => {
    const lines = SCENARIO_PROMPT.split("\n");
    const example = lines.findIndex((l) => l.startsWith("EXAMPLE. Seed:"));
    expect(lines[example - 1]).toBe(
      "The example below is cut short to one pressure and one THREAD to save room. Write as many as the REGISTER note says.",
    );
  });

  it("tells the model to correct a rejected command, or drop one that cannot be done", () => {
    expect(SCENARIO_PROMPT).toContain(
      "If [REJECTED LAST TURN] is present, correct each command as its line says; where the line says a thing cannot be done, do not write that command again.",
    );
  });

  it("exports the grow instruction", () => {
    expect(SCENARIO_GROW_INSTRUCTION).toContain("critique");
  });
});
