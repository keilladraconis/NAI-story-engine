import { describe, it, expect, beforeEach, vi } from "vitest";
import { installHistoryFake } from "../helpers/history-fake";
import { registerAutosaveEffects } from "../../src/core/store/effects/autosave";
import { loadBranchState } from "../../src/core/store/persistence/history-store";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import { initialUIState } from "../../src/core/store/slices/ui";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import { initialForgeState } from "../../src/core/store/slices/forge";
import type { RootState, WorldEntity } from "../../src/core/store/types";
import type { Action } from "nai-store";

function entity(id: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name: id,
    summary: "",
  };
}

/** Minimal stand-in for the store's subscribeEffect: captures the predicate and
 *  handler so the test can fire actions synchronously. */
function harness(state: RootState) {
  const handlers: Array<{
    match: (a: Action) => boolean;
    run: (a: Action) => void;
  }> = [];
  const subscribeEffect = ((match: never, run: never) => {
    handlers.push({ match, run });
    return () => {};
  }) as never;
  const fire = (type: string) => {
    const action = { type } as Action;
    for (const h of handlers) if (h.match(action)) h.run(action);
  };
  registerAutosaveEffects(subscribeEffect, () => state);
  return { fire };
}

function baseState(entityIds: string[] = []): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const id of entityIds) entitiesById[id] = entity(id);
  return {
    story: initialStoryState,
    world: { ...initialWorldState, entitiesById, entityIds },
    foundation: initialFoundationState,
    ui: initialUIState,
    runtime: initialRuntimeState,
    forge: initialForgeState,
    chat: { chats: [], activeChatId: null },
  } as RootState;
}

describe("autosave", () => {
  beforeEach(() => {
    installHistoryFake();
    vi.useFakeTimers();
  });

  it("writes branch-scoped records after the debounce", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("world/entityForged");
    await vi.runAllTimersAsync();
    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
  });

  it("does not write before the debounce elapses", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("world/entityForged");
    expect(api.v1.historyStorage.set).not.toHaveBeenCalled();
  });

  it("writes chat to storyStorage, never to historyStorage", async () => {
    const { fire } = harness(baseState());
    fire("chat/messageAdded");
    await vi.runAllTimersAsync();
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      "kse-chat",
      expect.anything(),
    );
  });

  it("ignores actions from slices it does not persist", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("ui/uiEditableActivate");
    fire("runtime/requestQueued");
    await vi.runAllTimersAsync();
    expect(api.v1.historyStorage.set).not.toHaveBeenCalled();
  });

  it("never removes a record key", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("world/entityDeleted");
    await vi.runAllTimersAsync();
    expect(api.v1.historyStorage.remove).not.toHaveBeenCalled();
  });
});
