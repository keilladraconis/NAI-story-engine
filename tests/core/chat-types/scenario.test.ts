import { describe, it, expect, vi } from "vitest";
import {
  scenarioMode,
  scenarioSpec,
} from "../../../src/core/chat-types/scenario";
import {
  forgeChatContinueRequested,
  scenarioPlanRequested,
} from "../../../src/core/store/effects/forge-chat-actions";
import {
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
} from "../../../src/core/utils/prompts";
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

const inMode = (
  subMode: string | undefined,
  messages: Chat["messages"] = [],
) => ({
  ...chatWith(messages),
  subMode,
});
const said = [{ id: "u1", role: "user" as const, content: "A lock-keeper." }];

describe("the Scenario chat type's prompt", () => {
  it("reads its register from the Foundation's intensity, in each mode", () => {
    expect(scenarioSpec.systemPromptFor(inMode("build"), ctxFor("Noir"))).toBe(
      buildScenarioBuildPrompt("Noir"),
    );
    expect(scenarioSpec.systemPromptFor(inMode("build"), ctxFor(null))).toBe(
      buildScenarioBuildPrompt("unset"),
    );
    expect(scenarioSpec.systemPromptFor(inMode("plan"), ctxFor("Noir"))).toBe(
      buildScenarioPlanPrompt("Noir"),
    );
  });
});

describe("the Scenario chat's mode", () => {
  it("is plan unless the chat says build", () => {
    expect(scenarioMode(inMode(undefined))).toBe("plan");
    expect(scenarioMode(inMode("cowriter"))).toBe("plan");
    expect(scenarioMode(inMode("build"))).toBe("build");
  });

  it("starts a new chat in plan and offers the toggle first", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.initialize({ kind: "blank" }, ctx).subMode).toBe(
      "plan",
    );
    expect(scenarioSpec.headerControls(inMode("plan"), ctx)[0].kind).toBe(
      "modeToggle",
    );
  });

  it("words its placeholder for the mode", () => {
    expect(scenarioSpec.inputPlaceholderFor!(inMode("plan"))).toBe(
      "Talk the scenario through…",
    );
    expect(scenarioSpec.inputPlaceholderFor!(inMode("build"))).toBe(
      "Say what to build, or send empty to build what you've discussed…",
    );
  });
});

describe("sending in the Scenario chat", () => {
  const lastCall = (ctx: ReturnType<typeof ctxFor>) =>
    ctx.dispatch.mock.calls[ctx.dispatch.mock.calls.length - 1]?.[0];

  it("plan, text: adds the message and asks for a Plan turn", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.handleSend!(inMode("plan"), "  hello  ", ctx)).toBe(
      true,
    );
    expect(ctx.dispatch.mock.calls[0][0].payload.message).toMatchObject({
      role: "user",
      content: "hello",
    });
    expect(lastCall(ctx)).toEqual(scenarioPlanRequested({ chatId: "c1" }));
  });

  it("plan, empty: does nothing", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.handleSend!(inMode("plan", said), "  ", ctx)).toBe(
      true,
    );
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("build, text: adds the message and asks for a directed Build turn", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build"), "just the sisters", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(2);
    expect(lastCall(ctx)).toEqual(
      forgeChatContinueRequested({ chatId: "c1", directed: true }),
    );
  });

  it("build, empty, something said: asks for an undirected Build turn and adds no message", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build", said), "", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(lastCall(ctx)).toEqual(
      forgeChatContinueRequested({ chatId: "c1", directed: false }),
    );
  });

  it("build, empty, nothing said: does nothing", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build"), "", ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  const busyWith = (request: object) => {
    const ctx = ctxFor(null);
    const getState = () =>
      ({
        ...ctx.getState(),
        runtime: { activeRequest: request, queue: [] },
      }) as unknown as RootState;
    return { dispatch: ctx.dispatch, getState };
  };

  it("refuses while a Build turn is queued or running", () => {
    const ctx = busyWith({
      id: "scenario-c1-a9",
      type: "forgeChat",
      status: "processing",
    });
    scenarioSpec.handleSend!(inMode("build"), "seed", ctx);
    scenarioSpec.handleSend!(inMode("plan"), "seed", ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("refuses while a Plan turn for this chat is running", () => {
    const ctx = busyWith({
      id: "chat-c1-a9",
      type: "chat",
      status: "processing",
    });
    scenarioSpec.handleSend!(inMode("plan"), "hello", ctx);
    scenarioSpec.handleSend!(inMode("build"), "hello", ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("is not held up by a cancelled request", () => {
    const ctx = busyWith({
      id: "chat-c1-a9",
      type: "chat",
      status: "cancelled",
    });
    scenarioSpec.handleSend!(inMode("plan"), "hello", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(2);
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
