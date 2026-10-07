import { describe, it, expect, vi } from "vitest";
import { buildLorebookContentStrategy } from "../../../src/core/utils/lorebook-strategy";
import { FieldID } from "../../../src/config/field-definitions";
import type { RootState } from "../../../src/core/store/types";

/**
 * The behavioural half of `latent-privacy.test.ts`. That file scans for the
 * identifier, which cannot see a value travelling as plain text — a Scenario
 * transcript quoting its own `[THREAD …]` command is exactly that. Here a
 * sentinel is planted as the private half and the lorebook-generation context
 * is checked for it.
 *
 * The chat's transcript is no longer a sink: it reaches no prefix at all, and
 * this test keeps it that way. Sinks covered elsewhere: the Thread's own
 * lorebook entry text (`thread-bind.test.ts` — "never the latent", "writing
 * state and not latent") and the bare prefix (`context-builder.test.ts`).
 */

const SENTINEL = "ZZ-PRIVATE-SENTINEL-7781";
const WISH_SENTINEL = "ZZ-WISH-SENTINEL-4410";
const THREAD_STATE = "Ines and Pell share the upper apiary";
const FORGE_STATE = "Pell keeps the swarm ledger for the cooperative";
const ENTRY_ID = "entry-ines";

const state = {
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
    entitiesById: {
      ines: {
        id: "ines",
        categoryId: FieldID.DramatisPersonae,
        lifecycle: "live",
        lorebookEntryId: ENTRY_ID,
        name: "Ines",
        summary: "Keeps the upper hives.",
      },
      pell: {
        id: "pell",
        categoryId: FieldID.DramatisPersonae,
        lifecycle: "live",
        name: "Pell",
        summary: "Keeps the swarm ledger.",
      },
    },
    entityIds: ["ines", "pell"],
    threads: [
      {
        id: "t1",
        title: "The Split Hive",
        state: THREAD_STATE,
        latent: `Pell has not told Ines. ${SENTINEL}`,
        wish: `She leaves. ${WISH_SENTINEL}`,
        entityIds: ["ines", "pell"],
        status: "open",
      },
    ],
  },
  ui: { lorebook: { selectedEntryId: null } },
  runtime: {},
  chat: {
    chats: [
      {
        id: "f1",
        type: "scenario",
        title: "Scenario 1",
        messages: [
          {
            id: "a",
            role: "assistant",
            content: `[THREAD "The Ledger" | "Ines", "Pell" | ${FORGE_STATE} | ${SENTINEL} | ${WISH_SENTINEL}]`,
          },
        ],
        seed: { kind: "blank" },
      },
    ],
    activeChatId: "f1",
    refineChat: null,
  },
} as unknown as RootState;

describe("a Thread's private notes, followed to each sink", () => {
  it("are absent from everything lorebook generation sends, prefix included", async () => {
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue({
      id: ENTRY_ID,
      displayName: "Ines",
      text: "",
      keys: [],
    } as unknown as Awaited<ReturnType<typeof api.v1.lorebook.entry>>);

    const strategy = buildLorebookContentStrategy(() => state, {
      entryId: ENTRY_ID,
      requestId: "req-sink",
    });
    const built = await strategy.messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n");

    // Positive control: the stored Thread reached the context, by its state.
    expect(text).toContain(`- The Split Hive: ${THREAD_STATE}`);
    // The chat's transcript no longer reaches this model at all.
    expect(text).not.toContain(FORGE_STATE);
    for (const message of built.messages) {
      expect(message.content).not.toContain(SENTINEL);
      expect(message.content).not.toContain(WISH_SENTINEL);
    }
  });
});
