import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerBootstrapEffects } from "../../../../src/core/store/effects/bootstrap-effects";
import {
  bootstrapRequested,
  bootstrapContinueRequested,
  generationSubmitted,
  requestQueued,
} from "../../../../src/core/store";
import { buildStoryEnginePrefix } from "../../../../src/core/utils/context-builder";
import type {
  RootState,
  GenerationStrategy,
} from "../../../../src/core/store/types";
import {
  BOOTSTRAP_P1_PROMPT,
  BOOTSTRAP_CONTINUE_PROMPT,
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
      situation: "",
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

/** Registers the effects and runs Continue Scene against `runtime`. */
async function continueWith(runtime: object) {
  const handlers: EffectHandler[] = [];
  const dispatch = vi.fn();
  const getState = () => ({ ...state(), runtime }) as unknown as RootState;

  registerBootstrapEffects(
    ((predicate: (a: { type: string }) => boolean, handler: EffectHandler) => {
      if (predicate({ type: bootstrapContinueRequested.type }))
        handlers.push(handler);
      return () => {};
    }) as never,
    dispatch as never,
    getState,
  );

  await handlers[0](bootstrapContinueRequested() as never, { getState });
  return dispatch.mock.calls.map(
    (c) => c[0] as { type: string; payload: GenerationStrategy },
  );
}

describe("bootstrapContinueRequested — Continue Scene", () => {
  const IDLE = { queue: [], activeRequest: null };

  it("writes with the World in context, the instruction last", async () => {
    const actions = await continueWith(IDLE);
    const submitted = actions.find((a) => a.type === generationSubmitted.type);
    expect(submitted?.payload.target.type).toBe("bootstrapContinue");

    const { messages } = await submitted!.payload.messageFactory!();
    // Only the story text is left out of the prefix: the World stays in.
    expect(buildStoryEnginePrefix).toHaveBeenLastCalledWith(expect.anything(), {
      excludeSections: ["storyText"],
    });
    const contents = messages.map((m) => m.content ?? "");
    expect(contents).toContain(BOOTSTRAP_CONTINUE_PROMPT);
  });

  // Another script's onContextBuilt rewrites the story it is shown for its
  // own generations; Op3na's "[ Style: … ]" lines reached this prompt and the
  // model wrote one back onto the page.
  it("reads the story without any script's context hook", async () => {
    const actions = await continueWith(IDLE);
    const submitted = actions.find((a) => a.type === generationSubmitted.type);
    await submitted!.payload.messageFactory!();
    expect(api.v1.buildContext).toHaveBeenLastCalledWith({
      suppressScriptHooks: "all",
    });
  });

  it("queues its request under the id it submits", async () => {
    const actions = await continueWith(IDLE);
    const queued = actions.find((a) => a.type === requestQueued.type);
    const submitted = actions.find((a) => a.type === generationSubmitted.type);
    expect(queued).toBeDefined();
    expect((queued!.payload as unknown as { id: string }).id).toBe(
      submitted!.payload.requestId,
    );
  });

  it("refuses a second press while an opening or continuation is pending", async () => {
    for (const type of ["bootstrap", "bootstrapContinue"]) {
      const queued = await continueWith({
        queue: [{ id: "q", type, targetId: "bootstrap" }],
        activeRequest: null,
      });
      expect(queued).toEqual([]);
      const active = await continueWith({
        queue: [],
        activeRequest: { id: "a", type, targetId: "bootstrap" },
      });
      expect(active).toEqual([]);
    }
  });
});
