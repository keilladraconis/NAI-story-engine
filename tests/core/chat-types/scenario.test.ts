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

  it("plan, text: asks for a Plan turn that carries the text", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.handleSend!(inMode("plan"), "  hello  ", ctx)).toBe(
      true,
    );
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(lastCall(ctx)).toEqual(
      scenarioPlanRequested({ chatId: "c1", content: "hello" }),
    );
  });

  it("plan, empty: does nothing", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.handleSend!(inMode("plan", said), "  ", ctx)).toBe(
      true,
    );
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("build, text: asks for a directed Build turn that carries the text", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build"), " just the sisters ", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(lastCall(ctx)).toEqual(
      forgeChatContinueRequested({
        chatId: "c1",
        directed: true,
        content: "just the sisters",
      }),
    );
  });

  it("build, empty, something said: asks for an undirected Build turn with no text", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build", said), "", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(lastCall(ctx)).toEqual(
      forgeChatContinueRequested({ chatId: "c1", directed: false }),
    );
    expect(lastCall(ctx).payload).not.toHaveProperty("content");
  });

  it("build, empty, nothing said: does nothing", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build"), "", ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("adds no message itself: the effect does, once its guard has passed", () => {
    // A send that the effect then refuses must leave nothing behind, and
    // only the effect knows whether the chat is busy.
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("plan"), "hello", ctx);
    scenarioSpec.handleSend!(inMode("build"), "hello", ctx);
    expect(
      ctx.dispatch.mock.calls.filter(([a]) => a.type === "chat/messageAdded"),
    ).toEqual([]);
  });
});
