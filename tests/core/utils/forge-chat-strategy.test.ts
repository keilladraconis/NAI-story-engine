import { describe, it, expect } from "vitest";
import { useCreativeModel } from "../../helpers/creative-model";
import {
  buildForgeCleanupStrategy,
  buildScenarioBuildStrategy,
  buildScenarioPlanStrategy,
  formatRejections,
  scenarioConversation,
} from "../../../src/core/utils/forge-chat-strategy";
import type { Chat, ChatMessage } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";
import {
  FORGE_CLEANUP_PROMPT,
  SCENARIO_BUILD_INSTRUCTION,
  XIALONG_STYLE,
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
} from "../../../src/core/utils/prompts";

const BUILT =
  'So the sale is fact and the flooding is to come.\n[CREATE CHARACTER "Hesper Vane" | Keeps Tolland Lock.]\nAnd one thread.\n[THREAD "Half the House" | "Hesper Vane" | He sold his half. | He was paid. | She floods the cut.]';

const run = async (strategy: {
  messageFactory?: () => Promise<{ messages: Message[] }>;
}) => (await strategy.messageFactory!()).messages;

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
const chatOf = (messages: ChatMessage[]): Chat => ({
  id: "c1",
  type: "scenario",
  title: "Scenario 1",
  messages,
  seed: { kind: "blank" },
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

describe("the conversation a Scenario turn is shown", () => {
  it("reduces a Build reply to its commands", () => {
    const out = scenarioConversation([
      msg("u1", "user", "A lock-keeper."),
      msg("a1", "assistant", BUILT, { mode: "build" }),
    ]);
    expect(out[1]).toEqual({
      role: "assistant",
      content:
        '[CREATE CHARACTER "Hesper Vane" | Keeps Tolland Lock.]\n[THREAD "Half the House" | "Hesper Vane" | He sold his half. | He was paid. | She floods the cut.]',
    });
    expect(JSON.stringify(out)).not.toContain("the flooding is to come");
  });

  it("leaves out a Build reply that wrote no command", () => {
    const out = scenarioConversation([
      msg("u1", "user", "A lock-keeper."),
      msg("a1", "assistant", "Nothing new to record.", { mode: "build" }),
    ]);
    expect(out).toEqual([{ role: "user", content: "A lock-keeper." }]);
  });

  it("keeps Plan replies and older replies whole", () => {
    const out = scenarioConversation([
      msg("a1", "assistant", "What does she owe him?", { mode: "plan" }),
      msg("a2", "assistant", 'An old reply [CREATE CHARACTER "X" | y]'),
    ]);
    expect(out.map((m) => m.content)).toEqual([
      "What does she owe him?",
      'An old reply [CREATE CHARACTER "X" | y]',
    ]);
  });

  it("drops the placeholder, scrubs and empty messages", () => {
    const out = scenarioConversation(
      [
        msg("u1", "user", "A lock-keeper."),
        msg("s1", "assistant", '[REVISE "X" | y]', { messageKind: "cleanup" }),
        msg("e1", "assistant", "  "),
        msg("p1", "assistant", "", { mode: "build" }),
      ],
      "p1",
    );
    expect(out).toEqual([{ role: "user", content: "A lock-keeper." }]);
  });
});

describe("rejections survive a Plan reply", () => {
  it("reads the last reply that has segments, not the last reply", () => {
    const rejected = {
      forgeSegments: [
        {
          kind: "action",
          action: {
            kind: "THREAD",
            status: "rejected",
            name: "T",
            reason: "Name a known element.",
          },
        },
      ],
    };
    const text = formatRejections([
      msg("a1", "assistant", "[THREAD …]", { mode: "build", ...rejected }),
      msg("u1", "user", "Hm."),
      msg("a2", "assistant", "What about the mills?", { mode: "plan" }),
    ] as never);
    expect(text).toContain('- THREAD "T": Name a known element.');
  });
});

describe("a Build turn", () => {
  const chat = chatOf([
    msg("u1", "user", "A lock-keeper on a dying canal."),
    msg("a1", "assistant", "What does she owe her brother?", { mode: "plan" }),
    msg("p1", "assistant", "", { mode: "build" }),
  ]);
  const stateOf = (c: Chat) =>
    makeState({
      chat: { chats: [c], activeChatId: "c1", refineChat: null },
    } as never);

  it("opens with the Build prompt at the story's register", async () => {
    const state = stateOf(chat);
    const messages = await run(
      buildScenarioBuildStrategy(() => state, chat, "p1"),
    );
    expect(messages[0]).toEqual({
      role: "system",
      content: buildScenarioBuildPrompt("unset"),
    });
  });

  it("stands an empty send on the fixed instruction", async () => {
    const state = stateOf(chat);
    const messages = await run(
      buildScenarioBuildStrategy(() => state, chat, "p1"),
    );
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: SCENARIO_BUILD_INSTRUCTION,
    });
  });

  it("lets the writer's own last message direct the build", async () => {
    const directed = chatOf([
      ...chat.messages.slice(0, 2),
      msg("u2", "user", "Just the two of them for now."),
      msg("p1", "assistant", "", { mode: "build" }),
    ]);
    const state = stateOf(directed);
    const messages = await run(
      buildScenarioBuildStrategy(() => state, directed, "p1"),
    );
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "Just the two of them for now.",
    });
  });

  it("has no TURN line and no critique block", async () => {
    const state = stateOf(chat);
    const text = JSON.stringify(
      await run(buildScenarioBuildStrategy(() => state, chat, "p1")),
    );
    expect(text).not.toContain("TURN:");
    expect(text).not.toContain("PREVIOUS CRITIQUE");
  });

  it("targets the command handler", () => {
    const s = buildScenarioBuildStrategy(() => makeState(), chat, "p1");
    expect(s.target).toEqual({
      type: "forgeChat",
      chatId: "c1",
      messageId: "p1",
    });
    expect(s.requestId).toBe("scenario-c1-p1");
  });
});

describe("a Plan turn", () => {
  const chat = chatOf([
    msg("u1", "user", "A lock-keeper on a dying canal."),
    msg("a1", "assistant", BUILT, { mode: "build" }),
    msg("u2", "user", "What about the mills?"),
    msg("p1", "assistant", "", { mode: "plan" }),
  ]);
  const state = () =>
    makeState({
      chat: { chats: [chat], activeChatId: "c1", refineChat: null },
    } as never);

  it("opens with the Plan prompt and targets the ordinary chat handler", async () => {
    const s = await buildScenarioPlanStrategy(state, chat, "p1");
    expect(s.target).toEqual({ type: "chat", chatId: "c1", messageId: "p1" });
    expect(s.requestId).toBe("chat-c1-p1");
    expect((await run(s))[0]).toEqual({
      role: "system",
      content: buildScenarioPlanPrompt("unset"),
    });
  });

  it("sees what Build wrote as commands, never its thinking, tombstones or rejections", async () => {
    const text = JSON.stringify(
      await run(await buildScenarioPlanStrategy(state, chat, "p1")),
    );
    expect(text).toContain("Hesper Vane");
    expect(text).not.toContain("the flooding is to come");
    expect(text).not.toContain("[TOMBSTONES]");
    expect(text).not.toContain("[REJECTED LAST TURN]");
  });

  it("ends on the writer's message when the creative model is GLM", async () => {
    const messages = await run(
      await buildScenarioPlanStrategy(state, chat, "p1"),
    );
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "What about the mills?",
    });
  });

  describe("on Xialong", () => {
    it("prefills the chat style and stops at the next style block", async () => {
      useCreativeModel("xialong-v1");
      const s = await buildScenarioPlanStrategy(state, chat, "p1");
      expect(s.assistantPrefill).toBe(XIALONG_STYLE.scenarioPlan);
      const built = await s.messageFactory!();
      expect(built.messages[built.messages.length - 1]).toEqual({
        role: "assistant",
        content: XIALONG_STYLE.scenarioPlan,
      });
      expect(built.params?.stop).toEqual(["</think>", "\n[ Style"]);
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

describe("what a Scenario turn reads from the store", () => {
  const queued = chatOf([
    msg("u1", "user", "seed"),
    msg("p1", "assistant", "", { mode: "plan" }),
  ]);
  const withThread = (chat: Chat): RootState =>
    makeState({
      world: {
        entitiesById: {
          h: {
            id: "h",
            name: "Hesper Vane",
            summary: "Keeps the lock.",
            categoryId: "dramatisPersonae",
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
      chat: { chats: [chat], activeChatId: "c1", refineChat: null },
    } as never);

  const factories = {
    Build: async (get: () => RootState, chat: Chat) =>
      run(buildScenarioBuildStrategy(get, chat, "p1")),
    Plan: async (get: () => RootState, chat: Chat) =>
      run(await buildScenarioPlanStrategy(get, chat, "p1")),
  };

  for (const [name, build] of Object.entries(factories)) {
    it(`${name} reads a Thread's private halves from the transcript only, never the store`, async () => {
      const text = JSON.stringify(
        await build(() => withThread(queued), queued),
      );
      expect(text).toContain("The Keys");
      expect(text).toContain("She holds them.");
      expect(text).not.toContain("ZZ-LATENT");
      expect(text).not.toContain("ZZ-WISH");
    });

    it(`${name} reads the chat as it stands when built, not as it was queued`, async () => {
      const now = chatOf([
        ...queued.messages.slice(0, 1),
        msg("u2", "user", "ZZ-ADDED-LATER"),
        queued.messages[1],
      ]);
      const text = JSON.stringify(await build(() => withThread(now), queued));
      expect(text).toContain("ZZ-ADDED-LATER");
    });
  }
});
