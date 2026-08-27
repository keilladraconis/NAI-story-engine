// End to end over the reported failure: a forge pass emits five CREATEs and a
// CRITIQUE, and the writer sees no cards and a dead Commit button.
//
// The commands parse and execute — that much was measured. What this pins is
// the rest of the path: the drafts reach the world slice, the chat's draft pool
// counts them, and the segments the chat needs in order to draw anything are
// actually recorded on the message.
import { describe, it, expect, vi } from "vitest";
import { forgeChatHandler } from "../../../../../src/core/store/effects/handlers/forge-chat";
import type { CompletionContext } from "../../../../../src/core/store/effects/generation-handlers";
import type {
  RootState,
  WorldEntity,
} from "../../../../../src/core/store/types";
import { rootReducer } from "../../../../../src/core/store";
import { selectForgeDraftPoolCount } from "../../../../../src/core/store/selectors/forge";
import type { ForgeSegment } from "../../../../../src/core/chat-types/types";

const CHAT_ID = "fc-1";
const MSG_ID = "asst-1";

const TEXT = `[CREATE CHARACTER "Cameron 'Cammie' Degrassi" | An 18-year-old heiress born into luxury but emotionally starved.]
[CREATE CHARACTER "Aurelia" | A seductive consumption goddess who manifests as everything Cammie lacks.]
[CREATE SYSTEM "Divine Consumption Pact" | A supernatural agreement that transforms basic eating into cosmic claiming.]
[CREATE SYSTEM "Reality Normalization Field" | An aura of magical realism that makes the impossible seem mundane.]
[CREATE SITUATION "Abandoned Birthday" | Cammie sits alone at her own 18th birthday party in a rented water park.]
[CRITIQUE | I have established the core characters but need to develop the specific locations.]`;

/** A real world slice folded by the actions the handler dispatches. */
function runPass(): { state: RootState; segments: ForgeSegment[] } {
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

  void forgeChatHandler.completion(ctx);

  const setCall = dispatch.mock.calls.find(
    ([a]) => (a as { type: string }).type === "chat/forgeSegmentsSet",
  );
  const segments =
    ((setCall?.[0] as { payload?: { segments?: ForgeSegment[] } })?.payload
      ?.segments as ForgeSegment[]) ?? [];

  return { state: getState(), segments };
}

describe("a forge pass, end to end", () => {
  it("lands five drafts in the world", () => {
    const { state } = runPass();
    const drafts = Object.values(state.world.entitiesById) as WorldEntity[];
    expect(drafts.length).toBe(5);
    expect(drafts.every((e) => e.lifecycle === "draft")).toBe(true);
  });

  it("stamps every draft with the chat that forged it", () => {
    // `sourceChatId` is what the Commit button counts. A draft without it is
    // invisible to the pool and uncastable — and also leaks into the World
    // list, which hides forge drafts by exactly this field.
    const { state } = runPass();
    const drafts = Object.values(state.world.entitiesById) as WorldEntity[];
    expect(drafts.length).toBeGreaterThan(0);
    for (const e of drafts) expect(e.sourceChatId).toBe(CHAT_ID);
  });

  it("counts them in the draft pool, which is what enables Commit", () => {
    const { state } = runPass();
    expect(selectForgeDraftPoolCount(state, CHAT_ID)).toBe(5);
  });

  it("records a segment per command, which is what the chat draws", () => {
    const { segments } = runPass();
    const actions = segments.filter((s) => s.kind === "action");
    expect(actions.length).toBe(6);
    expect(
      actions.every(
        (s) =>
          (s as { action: { status?: string } }).action.status === "applied",
      ),
    ).toBe(true);
  });
});
