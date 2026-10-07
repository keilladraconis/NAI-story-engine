import { describe, it, expect, vi } from "vitest";
import { scenarioSpec } from "../../../src/core/chat-types/scenario";
import { forgeChatContinueRequested } from "../../../src/core/store/effects/forge-chat-actions";
import { buildScenarioPrompt } from "../../../src/core/utils/prompts";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";

const chatWith = (messages: Chat["messages"]): Chat => ({
  id: "c1",
  type: "scenario",
  title: "Scenario 1",
  messages,
  seed: { kind: "blank" },
});
const ctxFor = (level: string | null) => {
  const dispatch = vi.fn();
  const getState = () =>
    ({
      foundation: { intensity: level ? { level, description: "" } : null },
      runtime: { activeRequest: null, queue: [] },
      world: { entitiesById: {} },
    }) as unknown as RootState;
  return { dispatch, getState };
};

describe("the Scenario chat type", () => {
  it("reads its register from the Foundation's intensity", () => {
    expect(scenarioSpec.systemPromptFor(chatWith([]), ctxFor("Noir"))).toBe(
      buildScenarioPrompt("Noir"),
    );
    expect(scenarioSpec.systemPromptFor(chatWith([]), ctxFor(null))).toBe(
      buildScenarioPrompt("unset"),
    );
  });

  it("adds the writer's message and asks for a turn", () => {
    const ctx = ctxFor("Cozy");
    expect(
      scenarioSpec.handleSend!(chatWith([]), "  a lock-keeper  ", ctx),
    ).toBe(true);
    expect(ctx.dispatch.mock.calls[0][0].payload.message).toMatchObject({
      role: "user",
      content: "a lock-keeper",
    });
    expect(ctx.dispatch).toHaveBeenLastCalledWith(
      forgeChatContinueRequested({ chatId: "c1" }),
    );
  });

  it("asks for a turn with no message on an empty send into a chat with a sketch", () => {
    const ctx = ctxFor("Cozy");
    const chat = chatWith([
      { id: "u", role: "user", content: "seed" },
      { id: "a", role: "assistant", content: "sketch" },
    ]);
    scenarioSpec.handleSend!(chat, "   ", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledWith(
      forgeChatContinueRequested({ chatId: "c1" }),
    );
  });

  it("does nothing on an empty send into an empty chat", () => {
    const ctx = ctxFor("Cozy");
    expect(scenarioSpec.handleSend!(chatWith([]), "", ctx)).toBe(true);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("does nothing while a turn is queued or running", () => {
    const ctx = ctxFor("Cozy");
    const busy = () =>
      ({
        ...ctx.getState(),
        runtime: { activeRequest: { type: "forgeChat" }, queue: [] },
      }) as unknown as RootState;
    scenarioSpec.handleSend!(chatWith([]), "seed", { ...ctx, getState: busy });
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});
