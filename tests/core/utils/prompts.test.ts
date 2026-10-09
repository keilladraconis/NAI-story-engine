import { describe, it, expect } from "vitest";
import {
  LOREBOOK_GENERATE_PROMPT,
  normalizeRegisterKey,
  INTENSITY_LEVEL_LABELS,
  SCENARIO_BUILD_INSTRUCTION,
  SCENARIO_BUILD_PREFILL,
  SCENARIO_BUILD_PROMPT,
  SCENARIO_BUILD_REGISTERS,
  SCENARIO_PLAN_PROMPT,
  SCENARIO_PLAN_REGISTERS,
  XIALONG_STYLE,
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
} from "../../../src/core/utils/prompts";

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

import { FOUNDATION_SITUATION_PROMPT } from "../../../src/core/utils/prompts";

describe("the Foundation situation prompt", () => {
  it("has no newline inside a sentence", () => {
    for (const line of FOUNDATION_SITUATION_PROMPT.split("\n")) {
      expect(line).not.toMatch(/[a-z,]$/);
    }
  });
});

describe("the Scenario Plan prompt", () => {
  it("talks and writes no commands", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain("You are talking, not building.");
    expect(SCENARIO_PLAN_PROMPT).not.toMatch(/\[(CREATE|REVISE|THREAD)\b/);
  });

  it("works backwards from an ending and proposes none", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "what must already be true on the first page for that to be possible:",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "Do not propose plots, scenes in sequence or endings of your own.",
    );
  });

  it("converses: lets a statement stand, answers, and asks when it matters", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "What the writer states firmly is settled",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "If they asked you something, answer it.",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "When a question occurs to you, answer it yourself",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "one at most, and never in two replies running.",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "Your first sentence is never a verdict on the idea",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain("Offer facts, not mood");
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "When there is enough to build from, say so in a few words.",
    );
    // No instruction to praise, and none to end every reply on a question.
    expect(SCENARIO_PLAN_PROMPT).not.toMatch(/enthusiastic/);
    expect(SCENARIO_PLAN_PROMPT).not.toMatch(/then ask the one question/);
  });

  it("has a register for every intensity and for none", () => {
    for (const level of [...INTENSITY_LEVEL_LABELS, "unset"] as const) {
      expect(buildScenarioPlanPrompt(level)).toBe(
        `${SCENARIO_PLAN_PROMPT}\n\n${SCENARIO_PLAN_REGISTERS[level]}`,
      );
    }
  });

  it("says a missing list is an empty one, and writes no bracketed line", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "\n\nThe context block lists what exists so far under [WORLD] and [THREADS]; a list that is missing is empty. Refer to what is there by name, and do not read it back. Bracketed lines in the conversation are the builder's record of what was built; write none yourself.\n\n",
    );
  });

  it("is neutral about pressure when no register is set", () => {
    expect(SCENARIO_PLAN_REGISTERS.unset).toBe(
      "REGISTER, not yet set: You do not know how much pressure this world is under. Add no danger the writer has not asked for.",
    );
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

  it("says a missing list is an empty one", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "The context block above the conversation lists everything that exists under [WORLD], and how things stand under [THREADS]. A list that is missing is empty. The writer's last message says what to build.",
    );
  });

  it("names no pool, cast list or tombstones", () => {
    for (const p of [SCENARIO_BUILD_PROMPT, SCENARIO_PLAN_PROMPT]) {
      expect(p).not.toMatch(/\[POOL\]|\[LIVE\]|\[TOMBSTONES\]|draft/i);
    }
  });

  it("gives an example whose conversation raised what its private segment holds", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "\nEXAMPLE. The writer said that Hesper Vane is a lock-keeper on a dying canal who alone holds the sluice keys; that her brother Corin has already sold his half of the lock house to the barge company and has not told her he has been paid; and that they want her to end up flooding the cut to stop them.",
    );
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "Corin Vane has not told Hesper Vane that the company has already paid him.",
    );
  });

  it("starts from the writer's own statements", () => {
    expect(SCENARIO_BUILD_PREFILL).toBe("The writer said:");
    expect(SCENARIO_BUILD_PROMPT).toContain("1. What did the writer say?");
    // The example's thinking opens on the prefill, as a reply does.
    expect(SCENARIO_BUILD_PROMPT).toContain(
      `\n${SCENARIO_BUILD_PREFILL} Hesper Vane keeps a lock`,
    );
  });

  it("leaves out what the collaborator offered and the writer never took up", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "An offer counts only when a later message from the writer agrees to it, uses it or builds on it.",
    );
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "an instruction to build is not an answer to it, and a bracketed note before it says so.",
    );
    // The example's untaken offer appears in no command.
    const commands = SCENARIO_BUILD_PROMPT.slice(
      SCENARIO_BUILD_PROMPT.indexOf('[CREATE SITUATION "The Company'),
    );
    expect(commands).not.toMatch(/Rudd|writ\b/);
  });

  it("invents nothing to carry a wish", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "Where the writer gave nothing, add nothing: do not invent an object, a place or a circumstance to carry the wish, and do not borrow one from an offer that was left out.",
    );
  });

  it("asks for a THREAD when something is hidden or wanted", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "When the writer said something is hidden or unspoken, or named something they want to happen, write a THREAD for it.",
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
    expect(SCENARIO_BUILD_INSTRUCTION).toBe("Build from what I have said.");
  });
});
