import { describe, it, expect } from "vitest";
import {
  buildForgeChatStrategy,
  buildForgeCleanupStrategy,
  buildForgeDiscussStrategy,
  extractLastCritique,
} from "../../../src/core/utils/forge-chat-strategy";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState, WorldEntity } from "../../../src/core/store/types";
import { FieldID } from "../../../src/config/field-definitions";
import {
  FORGE_SKETCH_PROMPT,
  FORGE_EXPAND_PROMPT,
  FORGE_WEAVE_PROMPT,
  FORGE_CLEANUP_PROMPT,
  FORGE_DISCUSS_PROMPT,
} from "../../../src/core/utils/prompts";

function makeEntity(over: Partial<WorldEntity>): WorldEntity {
  return {
    id: "e",
    categoryId: FieldID.DramatisPersonae,
    name: "X",
    summary: "",
    lifecycle: "draft",
    ...over,
  } as WorldEntity;
}

function makeState(over: Partial<RootState> = {}): RootState {
  return {
    chat: { chats: [], activeChatId: null, refineChat: null },
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
    world: { groups: [], entitiesById: {}, entityIds: [] },
    story: { fields: {}, attgEnabled: false, styleEnabled: false },
    ui: {
      activeEditId: null,
      inputs: {},
      lorebook: { selectedEntryId: null, selectedCategoryId: null },
      worldExpanded: null,
    },
    runtime: {} as RootState["runtime"],
    forge: { tombstonesByChatId: {} },
    ...over,
  } as RootState;
}

describe("extractLastCritique", () => {
  it("returns text from last assistant CRITIQUE", () => {
    const messages = [
      { id: "u", role: "user" as const, content: "go" },
      {
        id: "a1",
        role: "assistant" as const,
        content: '[CREATE CHARACTER "A" | foo]\n[CRITIQUE | the pool is thin]',
      },
    ];
    expect(extractLastCritique(messages)).toBe("the pool is thin");
  });

  it("returns null when no CRITIQUE present", () => {
    const messages = [
      {
        id: "a",
        role: "assistant" as const,
        content: '[CREATE CHARACTER "A" | foo]',
      },
    ];
    expect(extractLastCritique(messages)).toBeNull();
  });

  it("scans only the most recent assistant message", () => {
    const messages = [
      { id: "a1", role: "assistant" as const, content: "[CRITIQUE | old]" },
      { id: "u", role: "user" as const, content: "more" },
      {
        id: "a2",
        role: "assistant" as const,
        content: '[CREATE CHARACTER "A" | foo]',
      },
    ];
    expect(extractLastCritique(messages)).toBeNull();
  });
});

describe("buildForgeChatStrategy", () => {
  const chat: Chat = {
    id: "fc-1",
    type: "forge",
    title: "Forge",
    subMode: "sketch",
    messages: [
      { id: "u1", role: "user", content: "include Vesper" },
      { id: "asst-pending", role: "assistant", content: "" },
    ],
    seed: { kind: "blank" },
  };

  it("produces a strategy with forgeChat target", () => {
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    expect(strat.target).toEqual({
      type: "forgeChat",
      chatId: "fc-1",
      messageId: "asst-pending",
    });
    expect(strat.requestId).toContain("fc-1");
    expect(strat.prefillBehavior).toBe("trim");
  });

  it("uses the sketch prompt as the system message for sketch phase", async () => {
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    const built = await strat.messageFactory!();
    expect(
      built.messages.some(
        (m) => m.role === "system" && m.content === FORGE_SKETCH_PROMPT,
      ),
    ).toBe(true);
  });

  it("uses the expand prompt when subMode is expand", async () => {
    const expandChat = { ...chat, subMode: "expand" };
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, expandChat, "asst-pending");
    const built = await strat.messageFactory!();
    expect(
      built.messages.some(
        (m) => m.role === "system" && m.content === FORGE_EXPAND_PROMPT,
      ),
    ).toBe(true);
  });

  it("uses the weave prompt when subMode is weave", async () => {
    const weaveChat = { ...chat, subMode: "weave" };
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, weaveChat, "asst-pending");
    const built = await strat.messageFactory!();
    expect(
      built.messages.some(
        (m) => m.role === "system" && m.content === FORGE_WEAVE_PROMPT,
      ),
    ).toBe(true);
  });

  it("includes POOL block listing drafts with D: prefix", async () => {
    const getState = () =>
      makeState({
        world: {
          groups: [],
          entitiesById: {
            d1: makeEntity({
              id: "d1",
              name: "Vesper",
              summary: "paranoid governess",
              lifecycle: "draft",
              sourceChatId: "fc-1",
            }),
          },
          entityIds: ["d1"],
        },
      });
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    const built = await strat.messageFactory!();
    const allText = built.messages.map((m) => m.content).join("\n");
    expect(allText).toContain("[POOL]");
    expect(allText).toContain("D:d1");
    expect(allText).toContain("Vesper");
  });

  it("includes LIVE block listing live entities with L: prefix", async () => {
    const getState = () =>
      makeState({
        world: {
          groups: [],
          entitiesById: {
            l1: makeEntity({
              id: "l1",
              name: "Old Quay",
              summary: "decaying waterfront",
              lifecycle: "live",
              lorebookEntryId: "lb-1",
              categoryId: FieldID.Locations,
            }),
          },
          entityIds: ["l1"],
        },
      });
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    const built = await strat.messageFactory!();
    const allText = built.messages.map((m) => m.content).join("\n");
    expect(allText).toContain("[LIVE]");
    expect(allText).toContain("L:l1");
    expect(allText).toContain("Old Quay");
  });

  it("includes TOMBSTONES block when this chat has tombstones", async () => {
    const getState = () =>
      makeState({
        forge: {
          tombstonesByChatId: {
            "fc-1": [{ name: "Felix", category: "Character", reason: "user" }],
          },
          pendingScrubByChatId: {},
        },
      });
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    const built = await strat.messageFactory!();
    const allText = built.messages.map((m) => m.content).join("\n");
    expect(allText).toContain("[TOMBSTONES]");
    expect(allText).toContain("Felix");
  });

  it("omits TOMBSTONES block when no tombstones for this chat", async () => {
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    const built = await strat.messageFactory!();
    // The system prompt itself mentions [TOMBSTONES] as part of its instructions.
    // The assertion here is that no context-block message emits a [TOMBSTONES] header.
    const contextMessages = built.messages.filter(
      (m) => m.role === "assistant",
    );
    const contextText = contextMessages.map((m) => m.content).join("\n");
    expect(contextText).not.toContain("[TOMBSTONES]");
  });

  it("includes PREVIOUS CRITIQUE block when last assistant message had one", async () => {
    const chatWithCritique: Chat = {
      ...chat,
      messages: [
        { id: "u1", role: "user", content: "go" },
        {
          id: "a1",
          role: "assistant",
          content:
            '[CREATE CHARACTER "A" | foo]\n[CRITIQUE | needs antagonist]',
        },
        { id: "asst-pending", role: "assistant", content: "" },
      ],
    };
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(
      getState,
      chatWithCritique,
      "asst-pending",
    );
    const built = await strat.messageFactory!();
    const allText = built.messages.map((m) => m.content).join("\n");
    expect(allText).toContain("[PREVIOUS CRITIQUE]");
    expect(allText).toContain("needs antagonist");
  });

  it("excludes the in-progress assistant placeholder from the transcript", async () => {
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    const built = await strat.messageFactory!();
    expect(
      built.messages.every(
        (m) => !(m.role === "assistant" && m.content === ""),
      ),
    ).toBe(true);
  });

  it("includes phase-appropriate max_tokens and temperature in params", async () => {
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    const built = await strat.messageFactory!();
    expect(built.params?.max_tokens).toBe(1536);
    expect(built.params?.temperature).toBeCloseTo(0.9, 5);
  });

  it("primes assistantPrefill with '[' so model continues the command syntax", () => {
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, chat, "asst-pending");
    expect(strat.assistantPrefill).toBe("[");
  });
});

describe("buildForgeCleanupStrategy", () => {
  it("produces a strategy with forgeCleanup target carrying discardedNames", () => {
    const chat: Chat = {
      id: "fc-1",
      type: "forge",
      title: "Forge",
      subMode: "sketch",
      messages: [],
      seed: { kind: "blank" },
    };
    const getState = () => makeState();
    const strat = buildForgeCleanupStrategy(getState, chat, "asst-cleanup", [
      "Vesper",
    ]);
    expect(strat.target).toEqual({
      type: "forgeCleanup",
      chatId: "fc-1",
      messageId: "asst-cleanup",
      discardedNames: ["Vesper"],
    });
    expect(strat.requestId).toContain("fc-1");
  });

  it("uses FORGE_CLEANUP_PROMPT as system message", async () => {
    const chat: Chat = {
      id: "fc-1",
      type: "forge",
      title: "Forge",
      subMode: "sketch",
      messages: [],
      seed: { kind: "blank" },
    };
    const getState = () => makeState();
    const strat = buildForgeCleanupStrategy(getState, chat, "asst-cleanup", [
      "Vesper",
    ]);
    const built = await strat.messageFactory!();
    expect(
      built.messages.some(
        (m) => m.role === "system" && m.content === FORGE_CLEANUP_PROMPT,
      ),
    ).toBe(true);
  });

  it("includes a user message naming the discarded entity for a single discard", async () => {
    const chat: Chat = {
      id: "fc-1",
      type: "forge",
      title: "Forge",
      subMode: "sketch",
      messages: [],
      seed: { kind: "blank" },
    };
    const getState = () => makeState();
    const strat = buildForgeCleanupStrategy(getState, chat, "asst-cleanup", [
      "Vesper",
    ]);
    const built = await strat.messageFactory!();
    const userTurn = built.messages.find((m) => m.role === "user");
    expect(userTurn).toBeDefined();
    expect(userTurn!.content).toContain("Discarded entity:");
    expect(userTurn!.content).toContain('"Vesper"');
  });

  it("pluralizes the user message when multiple entities were discarded", async () => {
    const chat: Chat = {
      id: "fc-1",
      type: "forge",
      title: "Forge",
      subMode: "sketch",
      messages: [],
      seed: { kind: "blank" },
    };
    const getState = () => makeState();
    const strat = buildForgeCleanupStrategy(getState, chat, "asst-cleanup", [
      "Vesper",
      "Hollow",
      "Echo",
    ]);
    const built = await strat.messageFactory!();
    const userTurn = built.messages.find((m) => m.role === "user");
    expect(userTurn).toBeDefined();
    expect(userTurn!.content).toContain("Discarded entities:");
    expect(userTurn!.content).toContain('"Vesper"');
    expect(userTurn!.content).toContain('"Hollow"');
    expect(userTurn!.content).toContain('"Echo"');
    expect(userTurn!.content).toContain("any of those entities");
  });

  it("uses a tight max_tokens budget (~400)", async () => {
    const chat: Chat = {
      id: "fc-1",
      type: "forge",
      title: "Forge",
      subMode: "sketch",
      messages: [],
      seed: { kind: "blank" },
    };
    const getState = () => makeState();
    const strat = buildForgeCleanupStrategy(getState, chat, "asst-cleanup", [
      "Vesper",
    ]);
    const built = await strat.messageFactory!();
    expect(built.params?.max_tokens).toBeLessThanOrEqual(512);
    expect(built.params?.max_tokens).toBeGreaterThanOrEqual(256);
  });
});

describe("buildForgeChatStrategy briefing anchoring", () => {
  const briefingChat: Chat = {
    id: "fc-1",
    type: "forge",
    title: "Forge",
    subMode: "sketch",
    messages: [
      {
        id: "brief",
        role: "system",
        content:
          "STORY ENGINE BRIEFING\n\n[BRAINSTORM]\nUSER: haunted lighthouse",
      },
      { id: "u1", role: "user", content: "begin" },
    ],
    seed: { kind: "blank" },
  };

  it("does not inject the shared prefix (no archivist directives, no [WORLD ENTRIES])", async () => {
    const getState = () =>
      makeState({
        world: {
          groups: [],
          entitiesById: {
            l1: makeEntity({
              id: "l1",
              name: "Old Quay",
              summary: "decaying",
              lifecycle: "live",
              lorebookEntryId: "lb-1",
              categoryId: FieldID.Locations,
            }),
          },
          entityIds: ["l1"],
        },
      });
    const strat = buildForgeChatStrategy(
      getState,
      briefingChat,
      "asst-pending",
    );
    const built = await strat.messageFactory!();
    const allText = built.messages.map((m) => m.content).join("\n");
    expect(allText).toContain("[LIVE]");
    expect(allText).not.toContain("[WORLD ENTRIES]");
    expect(allText).not.toContain("You are the **Archivist**");
  });

  it("places the frozen briefing right after the phase prompt and before [POOL]", async () => {
    const getState = () =>
      makeState({
        world: {
          groups: [],
          entitiesById: {
            d1: makeEntity({
              id: "d1",
              name: "Vesper",
              lifecycle: "draft",
              sourceChatId: "fc-1",
            }),
          },
          entityIds: ["d1"],
        },
      });
    const strat = buildForgeChatStrategy(
      getState,
      briefingChat,
      "asst-pending",
    );
    const built = await strat.messageFactory!();
    const briefingIdx = built.messages.findIndex((m) =>
      m.content?.includes("STORY ENGINE BRIEFING"),
    );
    const poolIdx = built.messages.findIndex((m) =>
      m.content?.includes("[POOL]"),
    );
    const sketchIdx = built.messages.findIndex(
      (m) => m.content === FORGE_SKETCH_PROMPT,
    );
    expect(sketchIdx).toBeGreaterThanOrEqual(0);
    expect(briefingIdx).toBeGreaterThan(sketchIdx);
    expect(poolIdx).toBeGreaterThan(briefingIdx);
    // The briefing must NOT be re-sent as a conversational turn.
    const briefingMsgs = built.messages.filter((m) =>
      m.content?.includes("STORY ENGINE BRIEFING"),
    );
    expect(briefingMsgs).toHaveLength(1);
  });

  it("works without a briefing (legacy session whose first message is not system)", async () => {
    const legacy: Chat = {
      id: "fc-1",
      type: "forge",
      title: "Forge",
      subMode: "sketch",
      messages: [{ id: "u1", role: "user", content: "begin" }],
      seed: { kind: "blank" },
    };
    const getState = () => makeState();
    const strat = buildForgeChatStrategy(getState, legacy, "asst-pending");
    const built = await strat.messageFactory!();
    expect(built.messages.some((m) => m.content === FORGE_SKETCH_PROMPT)).toBe(
      true,
    );
    expect(
      built.messages.some((m) => m.role === "user" && m.content === "begin"),
    ).toBe(true);
  });
});

describe("buildForgeDiscussStrategy", () => {
  const discussChat: Chat = {
    id: "fc-1",
    type: "forge",
    title: "Forge",
    subMode: "sketch",
    messages: [
      {
        id: "brief",
        role: "system",
        content: "STORY ENGINE BRIEFING\n\n[BRAINSTORM]\nUSER: lighthouse",
      },
      { id: "u1", role: "user", content: "what's the antagonist's wound?" },
    ],
    seed: { kind: "blank" },
  };

  it("uses FORGE_DISCUSS_PROMPT as the system message and has no command prefill", async () => {
    const getState = () => makeState();
    const strat = buildForgeDiscussStrategy(
      getState,
      discussChat,
      "asst-pending",
    );
    expect(strat.assistantPrefill).toBeUndefined();
    expect(strat.target.type).toBe("forgeChat");
    expect(strat.requestId).toContain("forge-discuss-fc-1");
    const built = await strat.messageFactory!();
    expect(
      built.messages.some(
        (m) => m.role === "system" && m.content === FORGE_DISCUSS_PROMPT,
      ),
    ).toBe(true);
  });

  it("keeps the briefing ahead of the conversation and never adds a phase prompt", async () => {
    const getState = () => makeState();
    const strat = buildForgeDiscussStrategy(
      getState,
      discussChat,
      "asst-pending",
    );
    const built = await strat.messageFactory!();
    const briefingIdx = built.messages.findIndex((m) =>
      m.content?.includes("STORY ENGINE BRIEFING"),
    );
    const discussIdx = built.messages.findIndex(
      (m) => m.content === FORGE_DISCUSS_PROMPT,
    );
    expect(discussIdx).toBeGreaterThanOrEqual(0);
    expect(briefingIdx).toBeGreaterThan(discussIdx);
    expect(built.messages.some((m) => m.content === FORGE_SKETCH_PROMPT)).toBe(
      false,
    );
  });
});
