import { describe, it, expect } from "vitest";
import {
  buildStoryEnginePrefix,
  buildForgeBriefing,
} from "../../../src/core/utils/context-builder";
import type { RootState } from "../../../src/core/store/types";
import type { Chat } from "../../../src/core/chat-types/types";

const ACTIVE_PROBE = "PROBE_TOKEN_42";

function makeState(
  options: {
    activeChat?: Chat;
  } = {},
): RootState {
  const chats = options.activeChat ? [options.activeChat] : [];
  const activeChatId = options.activeChat ? options.activeChat.id : null;

  return {
    story: { fields: {}, attgEnabled: false, styleEnabled: false },
    foundation: {
      shape: null,
      intent: "",
      worldState: "",
      intensity: null,
      contract: null,
      attg: "",
      style: "",
      attgSyncEnabled: false,
      styleSyncEnabled: false,
    },
    world: {
      groups: [],
      entitiesById: {},
      entityIds: [],
    },
    runtime: {} as any,
    ui: {} as any,
    chat: {
      chats,
      activeChatId,
      refineChat: null,
    },
  } as unknown as RootState;
}

describe("buildStoryEnginePrefix chat injection", () => {
  it("uses contextSlice from active chat's spec when chat slice has an active chat", async () => {
    const chat: Chat = {
      id: "c1",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [{ id: "u", role: "user", content: ACTIVE_PROBE }],
      seed: { kind: "blank" },
    };
    const getState = () => makeState({ activeChat: chat });

    const prefix = await buildStoryEnginePrefix(getState);
    const concat = prefix.map((m) => m.content).join("\n");
    expect(concat).toContain(ACTIVE_PROBE);
    expect(concat).toContain("[BRAINSTORM]");
  });

  it("omits the chat block entirely when no chat is active", async () => {
    const getState = () => makeState();

    const prefix = await buildStoryEnginePrefix(getState);
    const concat = prefix.map((m) => m.content).join("\n");
    expect(concat).not.toContain("[BRAINSTORM]");
  });

  it("excludeChat suppresses chat injection entirely (active chat path)", async () => {
    const chat: Chat = {
      id: "c1",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [{ id: "u", role: "user", content: ACTIVE_PROBE }],
      seed: { kind: "blank" },
    };
    const getState = () => makeState({ activeChat: chat });

    const prefix = await buildStoryEnginePrefix(getState, {
      excludeChat: true,
    });
    const concat = prefix.map((m) => m.content).join("\n");
    expect(concat).not.toContain(ACTIVE_PROBE);
    expect(concat).not.toContain("[BRAINSTORM]");
  });

  it("excludeSections 'brainstorm' continues to suppress chat injection (regression)", async () => {
    const chat: Chat = {
      id: "c1",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [{ id: "u", role: "user", content: ACTIVE_PROBE }],
      seed: { kind: "blank" },
    };
    const getState = () => makeState({ activeChat: chat });

    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["brainstorm"],
    });
    const concat = prefix.map((m) => m.content).join("\n");
    expect(concat).not.toContain(ACTIVE_PROBE);
    expect(concat).not.toContain("[BRAINSTORM]");
  });
});

describe("buildForgeBriefing", () => {
  it("includes the BRAINSTORM block from the active chat", async () => {
    const chat: Chat = {
      id: "c1",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [{ id: "u", role: "user", content: "a haunted lighthouse" }],
      seed: { kind: "blank" },
    };
    const getState = () => makeState({ activeChat: chat });
    const briefing = await buildForgeBriefing(getState);
    expect(briefing).toContain("[BRAINSTORM]");
    expect(briefing).toContain("a haunted lighthouse");
  });

  it("includes ATTG / STYLE / NARRATIVE FOUNDATION when foundation is populated", async () => {
    const getState = () => {
      const s = makeState();
      s.foundation.attg = "Author: X; Title: Y";
      s.foundation.style = "terse, dread-soaked";
      s.foundation.intent = "a slow unravelling";
      return s;
    };
    const briefing = await buildForgeBriefing(getState);
    expect(briefing).toContain("[ATTG]");
    expect(briefing).toContain("[STYLE]");
    expect(briefing).toContain("[NARRATIVE FOUNDATION]");
    expect(briefing).toContain("a slow unravelling");
  });

  it("returns an empty string when there is no context at all", async () => {
    const getState = () => makeState();
    const briefing = await buildForgeBriefing(getState);
    expect(briefing).toBe("");
  });
});
