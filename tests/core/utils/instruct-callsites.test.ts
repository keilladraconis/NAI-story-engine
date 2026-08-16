import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildLorebookKeysPayload,
  createLorebookKeysFactory,
} from "../../../src/core/utils/lorebook-strategy";
import {
  createEntitySummaryFactory,
  createEntitySummaryFromLorebookFactory,
  createThreadSummaryFactory,
} from "../../../src/core/utils/summary-strategy";
import { buildForgeCleanupStrategy } from "../../../src/core/utils/forge-chat-strategy";
import type { RootState } from "../../../src/core/store";
import type { Chat } from "../../../src/core/chat-types/types";

// Minimal RootState the flipped factories actually read: one live entity bound
// to a lorebook entry, one thread holding it, and the empty foundation/chat
// slices buildStoryEnginePrefix walks. Adapted from
// tests/core/utils/summary-strategy.test.ts — keep the two in step.
function makeState(): RootState {
  return {
    world: {
      entitiesById: {
        e1: {
          id: "e1",
          categoryId: "dramatisPersonae",
          name: "Ada",
          summary: "",
          lifecycle: "live",
          lorebookEntryId: "lb1",
        },
      },
      entityIds: ["e1"],
      groups: [{ id: "g1", title: "A thread", summary: "", entityIds: ["e1"] }],
    },
    foundation: {
      shape: null,
      intent: "",
      worldState: "",
      intensity: null,
      contract: null,
      attg: "",
      style: "",
    },
    chat: { chats: [], activeChatId: null, refineChat: null },
    ui: {
      activeEditId: null,
      inputs: {},
      lorebook: { selectedEntryId: null, selectedCategoryId: null },
      worldExpanded: null,
    },
    story: { fields: {} },
    forge: { tombstonesByChatId: {} },
  } as unknown as RootState;
}

const getState = () => makeState();

const forgeChat: Chat = {
  id: "fc-1",
  type: "forge",
  title: "Forge",
  subMode: "sketch",
  messages: [],
  seed: { kind: "blank" },
};

function xialongOn() {
  vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
    key === "xialong_mode" ? true : undefined,
  );
}

/** A Xialong style block is recognisable by its opening token. */
function styleBlocks(messages: Message[]): Message[] {
  return messages.filter((m) => (m.content ?? "").includes("[ Style"));
}

describe("extraction callsites stay on the instruct model", () => {
  beforeEach(() => {
    vi.mocked(api.v1.config.get).mockReset();
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue({
      id: "lb1",
      displayName: "Ada",
      text: "Ada is a locksmith.",
      keys: [],
    });
    xialongOn();
  });

  it("builds the keys payload on GLM even in Xialong Mode", async () => {
    const payload = await buildLorebookKeysPayload(getState, "lb1", "r1");
    expect(payload.params.model).toBe("glm-4-6");
  });

  it("sends no Xialong style block with a keys request", async () => {
    const { messages, params } = await createLorebookKeysFactory(
      getState,
      "lb1",
    )();
    expect(params?.model).toBe("glm-4-6");
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("generates an entity summary on GLM, with no style block", async () => {
    const { messages, params } = await createEntitySummaryFactory(
      getState,
      "e1",
    )();
    expect(params?.model).toBe("glm-4-6");
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("generates a lorebook-seeded summary on GLM, with no style block", async () => {
    const { messages, params } = await createEntitySummaryFromLorebookFactory(
      getState,
      "e1",
    )();
    expect(params?.model).toBe("glm-4-6");
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("keeps the no-entry early return on GLM too", async () => {
    // createEntitySummaryFromLorebookFactory bails with empty messages when the
    // entity has no bound entry, and that path builds its own params. Every
    // other case here sets lorebookEntryId, so without this the early return is
    // flipped but unguarded — a regression would send Xialong params with no
    // messages at all.
    const unbound = () => {
      const s = makeState();
      delete s.world.entitiesById.e1.lorebookEntryId;
      return s;
    };
    const { messages, params } = await createEntitySummaryFromLorebookFactory(
      unbound,
      "e1",
    )();
    expect(messages).toEqual([]);
    expect(params?.model).toBe("glm-4-6");
    expect(params?.top_k).toBeUndefined();
  });

  it("generates a thread summary on GLM, with no style block", async () => {
    const { messages, params } = await createThreadSummaryFactory(
      getState,
      "g1",
    )();
    expect(params?.model).toBe("glm-4-6");
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("runs forge cleanup on GLM", async () => {
    const strategy = buildForgeCleanupStrategy(getState, forgeChat, "asst-1", [
      "Vesper",
    ]);
    const { params } = await strategy.messageFactory!();
    expect(params?.model).toBe("glm-4-6");
  });
});
