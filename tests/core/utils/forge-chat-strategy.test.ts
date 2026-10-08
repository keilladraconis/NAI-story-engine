import { describe, it, expect } from "vitest";
import { useCreativeModel } from "../../helpers/creative-model";
import {
  buildForgeCleanupStrategy,
  buildScenarioTurnStrategy,
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

/** A reply's applied commands, as the handler records them at completion. */
const applied = (...kinds: string[]) => ({
  forgeSegments: kinds.map((kind) => ({
    kind: "action",
    action: { kind, status: "applied", name: "X" },
  })),
});
const sketched = applied("CREATE");

describe("which kind of turn this is", () => {
  it("is a sketch while no reply has been written", () => {
    expect(
      scenarioTurn(
        chatOf([msg("u", "user", "seed"), msg("p", "assistant", "")]),
        "p",
      ),
    ).toBe("sketch");
  });
  it("is still a sketch when the only reply was prose and the writer answered it", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "Can these people walk away?", {
        forgeSegments: [{ kind: "prose", text: "Can these people walk away?" }],
      }),
      msg("u2", "user", "No, and comfort is the exception."),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("sketch");
  });
  it("is a steer when the writer spoke last after a reply that applied one CREATE", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch", applied("CREATE")),
      msg("u2", "user", "make her older"),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("steer");
  });
  it("is a grow when the Engine spoke last", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch", sketched),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("grow");
  });
  it("is a steer when a reference scrub is queued between the writer's message and the turn", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch", sketched),
      msg("u2", "user", "make her older"),
      msg("k", "assistant", "", { messageKind: "cleanup" }),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("steer");
  });
  it("is a steer when the scrub ahead of it has already written its reply", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch", sketched),
      msg("u2", "user", "make her older"),
      msg("k", "assistant", '[REVISE "X" | y]', {
        messageKind: "cleanup",
        ...applied("REVISE"),
      }),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("steer");
  });
  it("does not count a scrub's commands as a sketch", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("k", "assistant", '[REVISE "X" | y]', {
        messageKind: "cleanup",
        ...applied("REVISE"),
      }),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("sketch");
  });
});

const rejectedCleanup = msg("k", "assistant", '[REVISE "X" | from the scrub]', {
  messageKind: "cleanup",
  forgeSegments: [
    {
      kind: "action",
      action: { kind: "REVISE", status: "rejected", reason: "cleanup pass" },
    },
  ],
});

describe("what the last turn had rejected", () => {
  const withRejection = msg("a", "assistant", "x", {
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
          reason: "is concluded and cannot be rewritten",
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
  });
  const expected =
    '[REJECTED LAST TURN] (not applied)\n- THREAD "T": is concluded and cannot be rewritten\n- REPAIR';

  it("lists each command that was not applied, with its reason", () => {
    expect(formatRejections([withRejection])).toBe(expected);
  });
  it("is empty when everything was applied", () => {
    expect(
      formatRejections([msg("a", "assistant", "x", { forgeSegments: [] })]),
    ).toBe("");
  });
  it("reports the last turn's, not those of a reference scrub that came after it", () => {
    expect(formatRejections([withRejection, rejectedCleanup])).toBe(expected);
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
    chat: { chats: [], activeChatId: null, refineChat: null },
  } as unknown as RootState;

  it("gives the turn, the pool and the Threads' state, and ends on the grow instruction", async () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch", sketched),
      msg("p", "assistant", ""),
    ]);
    const built = await buildScenarioTurnStrategy(() => state, chat, "p")
      .messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n---\n");
    expect(built.messages[0].content).toBe(buildScenarioPrompt("Noir"));
    expect(text).toContain("TURN: GROW");
    expect(text).toContain("Hesper Vane");
    expect(text).toContain("- The Keys | Hesper Vane | She holds them.");
    expect(built.messages.at(-1)).toEqual({
      role: "user",
      content: SCENARIO_GROW_INSTRUCTION,
    });
  });

  it("reads the chat as it stands when the turn is built, not as it stood when it was queued", async () => {
    const queued = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch", sketched),
      msg("p", "assistant", ""),
    ]);
    const strat = buildScenarioTurnStrategy(
      () => ({
        ...state,
        chat: {
          chats: [
            {
              ...queued,
              messages: [
                msg("u", "user", "seed"),
                msg("a", "assistant", "sketch", sketched),
                msg("u2", "user", "ZZ-ADDED-LATER"),
                msg("p", "assistant", ""),
              ],
            },
          ],
          activeChatId: "c1",
          refineChat: null,
        },
      }),
      queued,
      "p",
    );
    const built = await strat.messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n---\n");
    expect(text).toContain("TURN: STEER");
    expect(built.messages.at(-1)).toEqual({
      role: "user",
      content: "ZZ-ADDED-LATER",
    });
  });

  it("sends neither a reference scrub nor an empty message as conversation", async () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch", sketched),
      msg("u2", "user", "make her older"),
      msg("k", "assistant", "ZZ-SCRUB", { messageKind: "cleanup" }),
      msg("e", "assistant", "  "),
      msg("p", "assistant", ""),
    ]);
    const built = await buildScenarioTurnStrategy(() => state, chat, "p")
      .messageFactory!();
    expect(built.messages.map((m) => m.content).join("\n")).not.toContain(
      "ZZ-SCRUB",
    );
    expect(built.messages.slice(-3).map((m) => m.content)).toEqual([
      "seed",
      "sketch",
      "make her older",
    ]);
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
