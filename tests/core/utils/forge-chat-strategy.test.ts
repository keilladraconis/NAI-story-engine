import { describe, it, expect } from "vitest";
import { useCreativeModel } from "../../helpers/creative-model";
import {
  buildForgeCleanupStrategy,
  buildScenarioTurnStrategy,
  extractLastCritique,
  formatRejections,
  scenarioTurn,
} from "../../../src/core/utils/forge-chat-strategy";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";
import { FieldID } from "../../../src/config/field-definitions";
import {
  FORGE_CLEANUP_PROMPT,
  SCENARIO_GROW_INSTRUCTION,
  buildScenarioPrompt,
} from "../../../src/core/utils/prompts";

function makeState(over: Partial<RootState> = {}): RootState {
  return {
    chat: { chats: [], activeChatId: null, refineChat: null },
    foundation: {
      situation: "",
      worldState: "",
      intensity: null,
      contract: null,
      attg: "",
      style: "",
      attgSyncEnabled: false,
      styleSyncEnabled: false,
    },
    world: { threads: [], entitiesById: {}, entityIds: [] },
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

const msg = (
  id: string,
  role: "user" | "assistant",
  content: string,
  extra = {},
) => ({
  id,
  role,
  content,
  ...extra,
});
const chatOf = (messages: ReturnType<typeof msg>[]): Chat => ({
  id: "c1",
  type: "scenario",
  title: "Scenario 1",
  messages,
  seed: { kind: "blank" },
});

describe("which kind of turn this is", () => {
  it("is a sketch while no reply has been written", () => {
    expect(
      scenarioTurn(
        chatOf([msg("u", "user", "seed"), msg("p", "assistant", "")]),
        "p",
      ),
    ).toBe("sketch");
  });
  it("is a steer when the writer spoke last", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch"),
      msg("u2", "user", "make her older"),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("steer");
  });
  it("is a grow when the Engine spoke last", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch"),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("grow");
  });
});

describe("the last critique", () => {
  it("is found wherever it sits in the last reply", () => {
    const messages = [
      msg(
        "a",
        "assistant",
        "prose\n[CRITIQUE | the lock has no witness]\nA question?",
      ),
    ];
    expect(extractLastCritique(messages)).toBe("the lock has no witness");
  });
  it("is null when the last reply has none", () => {
    expect(
      extractLastCritique([msg("a", "assistant", "just prose")]),
    ).toBeNull();
  });
});

describe("what the last turn had rejected", () => {
  it("lists each command that was not applied, with its reason", () => {
    const messages = [
      msg("a", "assistant", "x", {
        forgeSegments: [
          {
            kind: "action",
            action: { kind: "CREATE", status: "applied", name: "Ok" },
          },
          {
            kind: "action",
            action: {
              kind: "THREAD",
              status: "rejected",
              name: "T",
              reason: "no known members",
            },
          },
          {
            kind: "action",
            action: {
              kind: "UNKNOWN",
              status: "unrecognized",
              reason: "REPAIR",
            },
          },
        ],
      }),
    ];
    expect(formatRejections(messages)).toBe(
      '[REJECTED LAST TURN] (not applied; write each again as its repair says)\n- THREAD "T": no known members\n- REPAIR',
    );
  });
  it("is empty when everything was applied", () => {
    expect(
      formatRejections([msg("a", "assistant", "x", { forgeSegments: [] })]),
    ).toBe("");
  });
});

describe("a Scenario turn's messages", () => {
  const state = {
    foundation: {
      situation: "",
      worldState: "",
      intensity: { level: "Noir", description: "No clean exits." },
      contract: null,
      attg: "",
      style: "",
    },
    world: {
      entitiesById: {
        h: {
          id: "h",
          name: "Hesper Vane",
          summary: "Keeps the lock.",
          categoryId: FieldID.DramatisPersonae,
          lifecycle: "draft",
          sourceChatId: "c1",
        },
      },
      entityIds: ["h"],
      threads: [
        {
          id: "t",
          title: "The Keys",
          state: "She holds them.",
          latent: "ZZ-LATENT",
          wish: "ZZ-WISH",
          entityIds: ["h"],
          status: "open",
        },
      ],
    },
    forge: { tombstonesByChatId: {}, pendingScrubByChatId: {} },
  } as unknown as RootState;

  it("gives the turn, the pool and the Threads' state, and ends on the grow instruction", async () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch\n[CRITIQUE | no witness]"),
      msg("p", "assistant", ""),
    ]);
    const built = await buildScenarioTurnStrategy(() => state, chat, "p")
      .messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n---\n");
    expect(built.messages[0].content).toBe(buildScenarioPrompt("Noir"));
    expect(text).toContain("TURN: GROW");
    expect(text).toContain("Hesper Vane");
    expect(text).toContain("- The Keys | Hesper Vane | She holds them.");
    expect(text).toContain("[PREVIOUS CRITIQUE]\nno witness");
    expect(built.messages.at(-1)).toEqual({
      role: "user",
      content: SCENARIO_GROW_INSTRUCTION,
    });
  });

  it("reads a Thread's private halves from the transcript only, never the store", async () => {
    const chat = chatOf([msg("u", "user", "seed"), msg("p", "assistant", "")]);
    const built = await buildScenarioTurnStrategy(() => state, chat, "p")
      .messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n");
    expect(text).not.toContain("ZZ-LATENT");
    expect(text).not.toContain("ZZ-WISH");
    expect(text).toContain("TURN: SKETCH");
  });

  it("runs on the instruct model even when the story is on Xialong", async () => {
    useCreativeModel("xialong-v1");
    const chat = chatOf([msg("u", "user", "seed"), msg("p", "assistant", "")]);
    const strat = buildScenarioTurnStrategy(() => state, chat, "p");
    const built = await strat.messageFactory!();
    expect(built.params?.model).toBe("glm-4-6");
    expect(strat.continuation?.maxCalls).toBeGreaterThan(1);
    expect(strat.requestId).toBe("scenario-c1-p");
    expect(strat.target).toEqual({
      type: "forgeChat",
      chatId: "c1",
      messageId: "p",
    });
  });
});

describe("buildForgeCleanupStrategy", () => {
  it("produces a strategy with forgeCleanup target carrying discardedNames", () => {
    const chat: Chat = {
      id: "fc-1",
      type: "scenario",
      title: "Scenario 1",
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
      type: "scenario",
      title: "Scenario 1",
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
      type: "scenario",
      title: "Scenario 1",
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
      type: "scenario",
      title: "Scenario 1",
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
      type: "scenario",
      title: "Scenario 1",
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
