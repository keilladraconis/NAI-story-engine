import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  REVIEW_INSTRUCTION,
  REVIEW_SYSTEM,
  THREAD_WRITE_INSTRUCTION,
  THREAD_WRITE_SYSTEM,
} from "../../src/core/utils/prompts";

/** The probe is a standalone script and cannot import from `src/`, so it
 *  carries its own copy of the prompts it measures. A probe measuring last
 *  month's prompt is worse than no probe. */
describe("tools/review-probe.naiscript measures the shipped prompts", () => {
  const probe = readFileSync("tools/review-probe.naiscript", "utf8");

  it.each([
    ["REVIEW_SYSTEM", REVIEW_SYSTEM],
    ["REVIEW_INSTRUCTION", REVIEW_INSTRUCTION],
    ["THREAD_WRITE_SYSTEM", THREAD_WRITE_SYSTEM],
    ["THREAD_WRITE_INSTRUCTION", THREAD_WRITE_INSTRUCTION],
  ])("carries %s verbatim", (name, prompt) => {
    expect(probe).toContain(`const ${name} = ${JSON.stringify(prompt)};`);
  });
});
