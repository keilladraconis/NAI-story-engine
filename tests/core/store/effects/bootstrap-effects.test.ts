import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerBootstrapEffects } from "../../../../src/core/store/effects/bootstrap-effects";
import {
  bootstrapRequested,
  generationSubmitted,
} from "../../../../src/core/store";
import type {
  RootState,
  GenerationStrategy,
} from "../../../../src/core/store/types";
import {
  BOOTSTRAP_P1_PROMPT,
  BOOTSTRAP_OPENING_DIRECTION_FRAME,
} from "../../../../src/core/utils/prompts";

// The prefix has its own tests; this file is only about what the Opening Scene
// modal's direction does to the messages.
vi.mock("../../../../src/core/utils/context-builder", () => ({
  buildStoryEnginePrefix: vi.fn(async () => []),
}));

type EffectHandler = (
  action: { type: string; payload: any },
  ctx: { getState: () => RootState },
) => Promise<void> | void;

const state = () =>
  ({
    foundation: {
      shape: null,
      intent: "",
      worldState: "",
      intensity: null,
      contract: null,
    },
  }) as unknown as RootState;

/** Runs the Opening Scene effect and returns the text of every message its
 *  factory builds, in order. */
async function messagesFor(guidance: string): Promise<string[]> {
  const handlers: EffectHandler[] = [];
  const dispatch = vi.fn();
  const getState = () => state();

  registerBootstrapEffects(
    ((predicate: (a: { type: string }) => boolean, handler: EffectHandler) => {
      if (predicate({ type: bootstrapRequested.type })) handlers.push(handler);
      return () => {};
    }) as never,
    dispatch as never,
    getState,
  );

  await handlers[0](bootstrapRequested({ guidance }), { getState });

  const submitted = dispatch.mock.calls
    .map((c) => c[0] as { type: string; payload: GenerationStrategy })
    .find((a) => a.type === generationSubmitted.type);
  const factory = submitted?.payload.messageFactory;
  if (!factory) throw new Error("no bootstrap strategy submitted");
  return (await factory()).messages.map((m) => m.content ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bootstrapRequested — the Opening Scene direction", () => {
  it("carries the writer's direction into the prompt, after the recipe", async () => {
    const contents = await messagesFor("waking up at the new high school");

    const direction = contents.findIndex((c) =>
      c.includes("waking up at the new high school"),
    );
    expect(direction).toBeGreaterThan(-1);
    expect(contents[direction]).toContain(BOOTSTRAP_OPENING_DIRECTION_FRAME);
    // Last thing read before generation wins ties with the generic recipe.
    expect(direction).toBeGreaterThan(contents.indexOf(BOOTSTRAP_P1_PROMPT));
  });

  it("trims the direction rather than passing raw textarea whitespace", async () => {
    const contents = await messagesFor("  in media res\n\n");
    expect(contents.some((c) => c.endsWith("in media res"))).toBe(true);
  });

  // Generating with an empty box is a supported answer — the prompt is then
  // exactly what it was before the modal existed.
  it("adds nothing when the writer generated without a direction", async () => {
    const blank = await messagesFor("");
    const whitespace = await messagesFor("   \n ");

    for (const contents of [blank, whitespace]) {
      expect(
        contents.some((c) => c.includes(BOOTSTRAP_OPENING_DIRECTION_FRAME)),
      ).toBe(false);
      expect(contents).toContain(BOOTSTRAP_P1_PROMPT);
    }
  });
});
