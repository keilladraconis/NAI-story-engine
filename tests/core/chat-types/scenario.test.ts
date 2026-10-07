import { describe, it, expect, vi } from "vitest";
import { scenarioSpec } from "../../../src/core/chat-types/scenario";
import { forgeChatContinueRequested } from "../../../src/core/store/effects/forge-chat-actions";
import { buildScenarioPrompt } from "../../../src/core/utils/prompts";
import type { Chat, ChatMessage } from "../../../src/core/chat-types/types";
import type { RootState, WorldEntity } from "../../../src/core/store/types";
import { FieldID } from "../../../src/config/field-definitions";

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

describe("the Scenario chat type's inline cards", () => {
  const entity = (over: Partial<WorldEntity>): WorldEntity =>
    ({
      id: "d",
      categoryId: FieldID.DramatisPersonae,
      name: "X",
      summary: "",
      lifecycle: "draft",
      ...over,
    }) as WorldEntity;
  const ctxWith = (entities: WorldEntity[]) => ({
    dispatch: vi.fn(),
    getState: () =>
      ({
        world: {
          entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
          entityIds: entities.map((e) => e.id),
        },
      }) as unknown as RootState,
  });
  const assistantMsg: ChatMessage = {
    id: "m-1",
    role: "assistant",
    content: "",
  };
  const userMsg: ChatMessage = { id: "m-u", role: "user", content: "hi" };

  it("returns the drafts of this chat that the given assistant message last touched", () => {
    const ctx = ctxWith([
      entity({ id: "d1", sourceChatId: "c1", lastAffectingMessageId: "m-1" }),
      entity({ id: "d2", sourceChatId: "c1", lastAffectingMessageId: "m-1" }),
      entity({ id: "d3", sourceChatId: "c1", lastAffectingMessageId: "m-2" }),
    ]);
    const ids = scenarioSpec.inlineEntityIdsFor!(
      assistantMsg,
      chatWith([]),
      ctx,
    );
    expect(ids.sort()).toEqual(["d1", "d2"]);
  });

  it("returns [] for a user message", () => {
    const ctx = ctxWith([
      entity({ id: "d1", sourceChatId: "c1", lastAffectingMessageId: "m-1" }),
    ]);
    expect(
      scenarioSpec.inlineEntityIdsFor!(userMsg, chatWith([]), ctx),
    ).toEqual([]);
  });

  it("excludes live entities", () => {
    const ctx = ctxWith([
      entity({
        id: "d1",
        sourceChatId: "c1",
        lastAffectingMessageId: "m-1",
        lifecycle: "live",
      }),
    ]);
    expect(
      scenarioSpec.inlineEntityIdsFor!(assistantMsg, chatWith([]), ctx),
    ).toEqual([]);
  });

  it("excludes drafts of another chat", () => {
    const ctx = ctxWith([
      entity({
        id: "d1",
        sourceChatId: "c-OTHER",
        lastAffectingMessageId: "m-1",
      }),
    ]);
    expect(
      scenarioSpec.inlineEntityIdsFor!(assistantMsg, chatWith([]), ctx),
    ).toEqual([]);
  });
});
