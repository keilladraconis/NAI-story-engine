import { describe, it, expect } from "vitest";
import {
  FORGE_CLEANUP_PROMPT,
  LOREBOOK_GENERATE_PROMPT,
  normalizeRegisterKey,
  INTENSITY_LEVEL_LABELS,
  SCENARIO_BUILD_INSTRUCTION,
  SCENARIO_BUILD_PROMPT,
  SCENARIO_BUILD_REGISTERS,
  SCENARIO_PLAN_PROMPT,
  SCENARIO_PLAN_REGISTERS,
  XIALONG_STYLE,
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
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

  it("sketches one pressure, and its example is the size of a sketch", () => {
    expect(SCENARIO_PROMPT).toContain("Write one SITUATION.");
    expect(SCENARIO_PROMPT).toContain("Build none of them.");
    const example = SCENARIO_PROMPT.slice(SCENARIO_PROMPT.indexOf("EXAMPLE."));
    expect(example.match(/\[CREATE SITUATION /g)).toHaveLength(1);
    expect(example.match(/\[THREAD /g)).toHaveLength(1);
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

describe("the Scenario Plan prompt", () => {
  it("talks and writes no commands", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain("You are talking, not building.");
    expect(SCENARIO_PLAN_PROMPT).not.toMatch(/\[(CREATE|REVISE|THREAD)\b/);
  });

  it("works backwards from an ending and proposes none", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "what must already be true on the first page for that to be possible?",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "Do not propose plots, scenes in sequence or endings of your own.",
    );
  });

  it("has a register for every intensity and for none", () => {
    for (const level of [...INTENSITY_LEVEL_LABELS, "unset"] as const) {
      expect(buildScenarioPlanPrompt(level)).toBe(
        `${SCENARIO_PLAN_PROMPT}\n\n${SCENARIO_PLAN_REGISTERS[level]}`,
      );
    }
  });

  it("has a Xialong chat style", () => {
    expect(XIALONG_STYLE.scenarioPlan).toMatch(/^\[ Style: .*chat.* \]$/);
  });
});

describe("the Scenario Build prompt", () => {
  it("thinks out loud before the commands", () => {
    const think = SCENARIO_BUILD_PROMPT.indexOf("Think out loud first");
    const commands = SCENARIO_BUILD_PROMPT.indexOf("COMMANDS:");
    expect(think).toBeGreaterThan(-1);
    expect(commands).toBeGreaterThan(think);
  });

  it("builds only what the conversation supports", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "Build only what the conversation supports.",
    );
  });

  it("has no critique and names the hidden segment private", () => {
    expect(SCENARIO_BUILD_PROMPT).not.toContain("CRITIQUE");
    expect(SCENARIO_BUILD_PROMPT).toContain("| state | private | wish]");
    expect(SCENARIO_BUILD_PROMPT).not.toContain("latent");
  });

  it("tells the model to correct a rejected command", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "If [REJECTED LAST TURN] is present, correct each command as its line says; where the line says a thing cannot be done, do not write that command again.",
    );
  });

  it("treats the register as a ceiling", () => {
    for (const level of [...INTENSITY_LEVEL_LABELS, "unset"] as const) {
      expect(SCENARIO_BUILD_REGISTERS[level]).toMatch(/at most/);
      expect(buildScenarioBuildPrompt(level)).toBe(
        `${SCENARIO_BUILD_PROMPT}\n\n${SCENARIO_BUILD_REGISTERS[level]}`,
      );
    }
  });

  it("exports the instruction an empty send stands for", () => {
    expect(SCENARIO_BUILD_INSTRUCTION).toBe("Build what we have discussed.");
  });
});
