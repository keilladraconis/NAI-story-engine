import { describe, it, expect } from "vitest";
import { useCreativeModel } from "../../helpers/creative-model";
import {
  buildScenarioBuildStrategy,
  buildScenarioPlanStrategy,
  formatRejections,
  scenarioConversation,
} from "../../../src/core/utils/forge-chat-strategy";
import type { Chat, ChatMessage } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";
import {
  SCENARIO_BUILD_INSTRUCTION,
  SCENARIO_BUILD_PREFILL,
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

  it("drops the placeholder and empty messages", () => {
    const out = scenarioConversation(
      [
        msg("u1", "user", "A lock-keeper."),
        msg("e1", "assistant", "  "),
        msg("p1", "assistant", "", { mode: "build" }),
      ],
      "p1",
    );
    expect(out).toEqual([{ role: "user", content: "A lock-keeper." }]);
  });
});

describe("rejections survive a Plan reply", () => {
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

  it("reads the last reply that was read for commands, not the last reply", () => {
    const text = formatRejections([
      msg("a1", "assistant", "[THREAD …]", { mode: "build", ...rejected }),
      msg("u1", "user", "Hm."),
      msg("a2", "assistant", "What about the mills?", { mode: "plan" }),
    ] as never);
    expect(text).toContain('- THREAD "T": Name a known element.');
  });

  it("does not outlive a later Build reply that settled nothing", () => {
    const text = formatRejections([
      msg("a1", "assistant", "[THREAD …]", { mode: "build", ...rejected }),
      msg("u1", "user", "Again."),
      // Edited, cancelled or failed: a Build reply with no segments.
      msg("a2", "assistant", '[CREATE CHARACTER "Hesper Vane" | x]', {
        mode: "build",
      }),
    ] as never);
    expect(text).toBe("");
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

  it("starts the reply on its thinking, and keeps that opening", async () => {
    const state = stateOf(chat);
    const strategy = buildScenarioBuildStrategy(() => state, chat, "p1");
    const messages = await run(strategy);
    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: SCENARIO_BUILD_PREFILL,
    });
    expect(strategy.prefillBehavior).toBe("keep");
    expect(strategy.assistantPrefill).toBe(SCENARIO_BUILD_PREFILL);
  });

  it("stands an empty send on the fixed instruction", async () => {
    const state = stateOf(chat);
    const messages = await run(
      buildScenarioBuildStrategy(() => state, chat, "p1"),
    );
    expect(messages[messages.length - 2]).toEqual({
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
    expect(messages[messages.length - 2]).toEqual({
      role: "user",
      content: "Just the two of them for now.",
    });
  });

  describe("told by the send whether it was directed", () => {
    // The tail is the writer's own Plan message, left there by a failed Plan
    // turn or a deleted Plan reply: the transcript alone reads it as directed.
    const tailIsUser = chatOf([
      msg("u1", "user", "A lock-keeper on a dying canal."),
      msg("p1", "assistant", "", { mode: "build" }),
    ]);
    const last = async (directed?: boolean) => {
      const state = stateOf(tailIsUser);
      const messages = await run(
        buildScenarioBuildStrategy(() => state, tailIsUser, "p1", directed),
      );
      return messages[messages.length - 2];
    };
    const instruction = { role: "user", content: SCENARIO_BUILD_INSTRUCTION };
    const own = { role: "user", content: "A lock-keeper on a dying canal." };

    it("appends the instruction to an empty send whatever the tail is", async () => {
      expect(await last(false)).toEqual(instruction);
    });
    it("appends nothing to a typed send", async () => {
      expect(await last(true)).toEqual(own);
    });
    it("reads the tail when the send did not say (a retry)", async () => {
      expect(await last(undefined)).toEqual(own);
    });
    it("appends nothing to a typed send even when the tail is a reply", async () => {
      const state = stateOf(chat);
      const messages = await run(
        buildScenarioBuildStrategy(() => state, chat, "p1", true),
      );
      expect(messages[messages.length - 2]).toEqual({
        role: "assistant",
        content: "What does she owe her brother?",
      });
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

  it("is built without waiting, and carries no prefill of its own", () => {
    const s = buildScenarioPlanStrategy(state, chat, "p1");
    expect(s).not.toBeInstanceOf(Promise);
    expect(s.target).toEqual({ type: "chat", chatId: "c1", messageId: "p1" });
    expect(s.requestId).toBe("chat-c1-p1");
    expect(s.prefillBehavior).toBe("trim");
    expect(s.assistantPrefill).toBeUndefined();
    expect(s.minResponseLength).toBe(4);
  });

  it("opens with the Plan prompt", async () => {
    const s = buildScenarioPlanStrategy(state, chat, "p1");
    expect((await run(s))[0]).toEqual({
      role: "system",
      content: buildScenarioPlanPrompt("unset"),
    });
  });

  it("sees what Build wrote as commands, never its thinking or rejections", async () => {
    const text = JSON.stringify(
      await run(buildScenarioPlanStrategy(state, chat, "p1")),
    );
    expect(text).toContain("Hesper Vane");
    expect(text).not.toContain("the flooding is to come");
    expect(text).not.toContain("[REJECTED LAST TURN]");
  });

  it("ends on the writer's message when the creative model is GLM", async () => {
    const built = await buildScenarioPlanStrategy(state, chat, "p1")
      .messageFactory!();
    expect(built.messages[built.messages.length - 1]).toEqual({
      role: "user",
      content: "What about the mills?",
    });
    expect(built.params?.stop).toBeUndefined();
  });

  describe("on Xialong", () => {
    it("prefills the chat style when it is built into messages, and stops at the next style block", async () => {
      // Built before the model is known; the factory reads it when it runs.
      const s = buildScenarioPlanStrategy(state, chat, "p1");
      useCreativeModel("xialong-v1");
      const built = await s.messageFactory!();
      expect(built.messages[built.messages.length - 1]).toEqual({
        role: "assistant",
        content: XIALONG_STYLE.scenarioPlan,
      });
      expect(built.params?.stop).toEqual(["</think>", "\n[ Style"]);
    });
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
      run(buildScenarioPlanStrategy(get, chat, "p1")),
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
