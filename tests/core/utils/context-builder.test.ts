import { describe, it, expect } from "vitest";
import { buildStoryEnginePrefix } from "../../../src/core/utils/context-builder";
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
      forgeLoopActive: false,
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

    const prefix = await buildStoryEnginePrefix(getState, { excludeChat: true });
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
