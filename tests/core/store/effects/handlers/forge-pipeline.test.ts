// End to end over the reported failure: a forge pass emits five CREATEs, and
// the writer sees no cards and a dead Commit button.
//
// The commands parse and execute — that much was measured. What this pins is
// the rest of the path: the drafts reach the world slice, the chat's draft pool
// counts them, and the segments the chat needs in order to draw anything are
// actually recorded on the message.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { forgeChatHandler } from "../../../../../src/core/store/effects/handlers/forge-chat";
import type { CompletionContext } from "../../../../../src/core/store/effects/generation-handlers";
import type {
  RootState,
  WorldEntity,
} from "../../../../../src/core/store/types";
import { rootReducer } from "../../../../../src/core/store";
import type { ForgeSegment } from "../../../../../src/core/chat-types/types";

const CHAT_ID = "fc-1";
const MSG_ID = "asst-1";

const TEXT = `[CREATE CHARACTER "Cameron 'Cammie' Degrassi" | An 18-year-old heiress born into luxury but emotionally starved.]
[CREATE CHARACTER "Aurelia" | A seductive consumption goddess who manifests as everything Cammie lacks.]
[CREATE SYSTEM "Divine Consumption Pact" | A supernatural agreement that transforms basic eating into cosmic claiming.]
[CREATE SYSTEM "Reality Normalization Field" | An aura of magical realism that makes the impossible seem mundane.]
[CREATE SITUATION "Abandoned Birthday" | Cammie sits alone at her own 18th birthday party in a rented water park.]`;

/** A real world slice folded by the actions the handler dispatches. */
async function runPass(): Promise<{
  state: RootState;
  segments: ForgeSegment[];
}> {
  // Through rootReducer, not the world slice alone: the thread cap and other
  // cross-slice rules live one level up, and a draft the slice accepts can
  // still be refused there.
  let state = rootReducer(undefined, { type: "@@INIT" });
  state = {
    ...state,
    chat: { ...state.chat, chats: [], activeChatId: CHAT_ID },
  } as RootState;
  const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state = rootReducer(state, action as any);
  });
  const getState = () => state;

  const ctx = {
    target: { type: "forgeChat", chatId: CHAT_ID, messageId: MSG_ID },
    accumulatedText: TEXT,
    generationSucceeded: true,
    getState,
    dispatch,
  } as unknown as CompletionContext<{
    type: "forgeChat";
    chatId: string;
    messageId: string;
  }>;

  await forgeChatHandler.completion(ctx);

  const setCall = dispatch.mock.calls.find(
    ([a]) => (a as { type: string }).type === "chat/forgeSegmentsSet",
  );
  const segments =
    ((setCall?.[0] as { payload?: { segments?: ForgeSegment[] } })?.payload
      ?.segments as ForgeSegment[]) ?? [];

  return { state: getState(), segments };
}

describe("a forge pass, end to end", () => {
  beforeEach(() => {
    let n = 0;
    vi.mocked(api.v1.lorebook.entries).mockResolvedValue([]);
    vi.mocked(api.v1.lorebook.createEntry).mockImplementation(async () => {
      n += 1;
      return `entry-${n}`;
    });
    vi.mocked(api.v1.lorebook.updateEntry).mockResolvedValue(undefined);
  });

  it("lands five live entities in the world, each bound to its own entry", async () => {
    const { state } = await runPass();
    const made = Object.values(state.world.entitiesById) as WorldEntity[];
    expect(made.length).toBe(5);
    expect(made.every((e) => e.lifecycle === "live")).toBe(true);
    expect(new Set(made.map((e) => e.lorebookEntryId)).size).toBe(5);
  });

  it("stamps every entity with the chat that built it", async () => {
    const { state } = await runPass();
    const made = Object.values(state.world.entitiesById) as WorldEntity[];
    expect(made.length).toBeGreaterThan(0);
    for (const e of made) expect(e.sourceChatId).toBe(CHAT_ID);
  });

  it("records a segment per command, which is what the chat draws", async () => {
    const { segments } = await runPass();
    const actions = segments.filter((s) => s.kind === "action");
    expect(actions.length).toBe(5);
    expect(
      actions.every(
        (s) =>
          (s as { action: { status?: string } }).action.status === "applied",
      ),
    ).toBe(true);
  });
});
