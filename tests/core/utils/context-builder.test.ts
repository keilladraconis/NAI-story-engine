import { describe, it, expect } from "vitest";
import {
  buildStoryEnginePrefix,
  formatFoundationBlock,
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
      situation: "",
      worldState: "",
      intensity: null,
      contract: null,
      attg: "",
      style: "",
      attgSyncEnabled: false,
      styleSyncEnabled: false,
    },
    world: {
      threads: [],
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

const scenarioChat: Chat = {
  id: "c1",
  type: "scenario",
  title: "Scenario 1",
  messages: [
    { id: "u", role: "user", content: ACTIVE_PROBE },
    {
      id: "a",
      role: "assistant",
      content: `[THREAD "The Split Hive" | "Ines", "Pell" | shared apiary | ${ACTIVE_PROBE} | ${ACTIVE_PROBE}]`,
    },
  ],
  seed: { kind: "blank" },
};

describe("buildStoryEnginePrefix and the chat transcript", () => {
  it("never carries the active chat's transcript", async () => {
    const getState = () => makeState({ activeChat: scenarioChat });

    const prefix = await buildStoryEnginePrefix(getState);
    const concat = prefix.map((m) => m.content).join("\n");
    expect(concat).not.toContain(ACTIVE_PROBE);
    expect(concat).not.toContain("[BRAINSTORM]");
  });

  it("emits no worldbuilding directives — the shared prefix is pure story-state context", async () => {
    const getState = () => makeState({ activeChat: scenarioChat });

    const prefix = await buildStoryEnginePrefix(getState);
    const concat = prefix.map((m) => m.content).join("\n");
    // None of the old MSG1 entity-generation bundle should survive.
    expect(concat).not.toContain("You are a Story Engine Agent");
    expect(concat).not.toContain("Possibility over Plot");
    expect(concat).not.toContain("Weave these connections naturally");
    expect(concat).not.toContain("You are the **Archivist**");
  });

  it("includes ATTG / STYLE / NARRATIVE FOUNDATION when foundation is populated", async () => {
    const getState = () => {
      const s = makeState();
      s.foundation.attg = "Author: X; Title: Y";
      s.foundation.style = "terse, dread-soaked";
      s.foundation.situation = "a slow unravelling";
      return s;
    };
    const concat = (await buildStoryEnginePrefix(getState))
      .map((m) => m.content)
      .join("\n");
    expect(concat).toContain("[ATTG]");
    expect(concat).toContain("[STYLE]");
    expect(concat).toContain("[NARRATIVE FOUNDATION]");
    expect(concat).toContain("a slow unravelling");
  });

  it("includes the Story Contract as binding constraints, with the Prohibited list", async () => {
    const getState = () => {
      const s = makeState();
      s.foundation.contract = {
        required: "cozy mystery, found family",
        prohibited: "death, betrayal, supernatural elements",
        emphasis: "the healing power of tea",
      } as RootState["foundation"]["contract"];
      return s;
    };
    const concat = (await buildStoryEnginePrefix(getState))
      .map((m) => m.content)
      .join("\n");
    expect(concat).toContain("Story Contract — binding");
    expect(concat).toContain("Prohibited (never introduce");
    expect(concat).toContain("death, betrayal, supernatural elements");
  });
});

describe("the Foundation block", () => {
  const foundation = {
    situation: "The company is buying the lock houses.",
    worldState: "",
    intensity: null,
    contract: null,
    attg: "",
    style: "",
    attgSyncEnabled: false,
    styleSyncEnabled: false,
  };
  it("carries the Situation and names no Shape or Intent", () => {
    const block = formatFoundationBlock({ foundation } as unknown as RootState);
    expect(block).toContain(
      "Situation: The company is buying the lock houses.",
    );
    expect(block).not.toMatch(/Shape:|Intent:/);
  });
});
