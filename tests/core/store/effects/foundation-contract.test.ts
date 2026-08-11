import { describe, it, expect } from "vitest";
import { registerFoundationEffects } from "../../../../src/core/store/effects/foundation-effects";
import {
  contractGenerationRequested,
  intentGenerationRequested,
} from "../../../../src/core/store/slices/foundation";
import { parseContract } from "../../../../src/core/store/effects/handlers/foundation";
import {
  CONTRACT_GENERATE_PREFILL,
  CONTRACT_GENERATE_REQUEST,
} from "../../../../src/core/utils/prompts";
import type {
  RootState,
  AppDispatch,
  GenerationStrategy,
} from "../../../../src/core/store/types";

const state = {
  foundation: {
    shape: { name: "Tragedy", description: "Falls from grace." },
    intent: "A governess unravels.",
    worldState: "The house is cold.",
    intensity: { level: "Grounded", description: "Real stakes." },
    contract: null,
    attg: "",
    style: "",
  },
  chat: { chats: [], activeChatId: null },
  world: { entitiesById: {}, entityIds: [], groups: [] },
  story: { fields: {}, items: {} },
  runtime: { queue: [], activeRequest: null, sega: { activeRequestIds: [] } },
} as unknown as RootState;

/** Fire a foundation generation action through the registered effects and hand
 *  back the strategy it submitted. */
function submit(action: {
  type: string;
  payload?: unknown;
}): GenerationStrategy {
  const subs: { p: (a: unknown) => boolean; h: (a: unknown) => void }[] = [];
  let submitted: GenerationStrategy | undefined;
  const dispatch = ((a: { type: string; payload: unknown }) => {
    if (a.type === "ui/generationSubmitted")
      submitted = a.payload as GenerationStrategy;
  }) as unknown as AppDispatch;
  registerFoundationEffects(
    ((p: (a: unknown) => boolean, h: (a: unknown) => void) =>
      subs.push({ p, h })) as never,
    dispatch,
    () => state,
  );
  for (const s of subs) if (s.p(action)) s.h(action);
  if (!submitted) throw new Error("no strategy submitted");
  return submitted;
}

describe("contract generation prompt", () => {
  // The bug: the contract was built from system blocks alone. With no turn
  // addressed to it, the model continued the [STORY TEXT] block already in
  // context and emitted prose instead of the three labeled lines.
  it("ends with a user request and an assistant prefill, not a system block", async () => {
    const built = await submit(contractGenerationRequested()).messageFactory!();
    const roles = built.messages.map((m) => m.role);
    expect(roles.slice(-2)).toEqual(["user", "assistant"]);
    expect(built.messages.at(-2)?.content).toBe(CONTRACT_GENERATE_REQUEST);
    expect(built.messages.at(-1)?.content).toBe(CONTRACT_GENERATE_PREFILL);
  });

  it("keeps the prefill so the committed text still carries the label", () => {
    const strategy = submit(contractGenerationRequested());
    expect(strategy.prefillBehavior).toBe("keep");
    expect(strategy.assistantPrefill).toBe(CONTRACT_GENERATE_PREFILL);
  });

  // The prefill is the REQUIRED label itself, so the model resumes from it and
  // never re-emits it. Trimming it would leave parseContract with no match.
  it("parses a response that resumes from the prefill", () => {
    const modelOutput = " grief, isolation\nPROHIBITED: rescue\nEMPHASIS: cold";
    const contract = parseContract(CONTRACT_GENERATE_PREFILL + modelOutput);
    expect(contract).toEqual({
      required: "grief, isolation",
      prohibited: "rescue",
      emphasis: "cold",
    });
  });

  it("leaves the prose fields trimming, with no prefill of their own", () => {
    const strategy = submit(intentGenerationRequested());
    expect(strategy.prefillBehavior).toBe("trim");
    expect(strategy.assistantPrefill).toBeUndefined();
  });
});
