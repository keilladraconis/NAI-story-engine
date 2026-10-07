import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SCENARIO_PROMPT,
  SCENARIO_REGISTERS,
} from "../../src/core/utils/prompts";

/** The probe is a standalone script and cannot import from `src/`, so it
 *  carries its own copy of the prompt it measures. A probe measuring last
 *  month's prompt is worse than no probe. */
describe("tools/scenario-probe.naiscript measures the shipped prompt", () => {
  const probe = readFileSync("tools/scenario-probe.naiscript", "utf8");

  it.each([
    ["SCENARIO_PROMPT", SCENARIO_PROMPT],
    ["REGISTER", SCENARIO_REGISTERS.Gritty],
  ])("carries %s verbatim", (name, prompt) => {
    expect(probe).toContain(`const ${name} = ${JSON.stringify(prompt)};`);
  });
});
