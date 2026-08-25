import { describe, it, expect, beforeEach, vi } from "vitest";
import { installStoryStorageFake } from "../helpers/story-storage-fake";
import { registerAutosaveEffects } from "../../src/core/store/effects/autosave";
import { loadWorldRecord } from "../../src/core/store/persistence/story-store";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import { initialUIState } from "../../src/core/store/slices/ui";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import { initialForgeState } from "../../src/core/store/slices/forge";
import { initialEngineState } from "../../src/core/store/slices/engine";
import { STORAGE_KEYS } from "../../src/core/keys";
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
 *  handler so the test can fire actions synchronously. The state is read
 *  through a getter, so a burst can change it between actions. */
function harness(getState: () => RootState) {
  const handlers: Array<{
    match: (a: Action) => boolean;
    run: (a: Action) => void;
  }> = [];
  const subscribeEffect = ((match: never, run: never) => {
    handlers.push({ match, run });
    return () => {};
  }) as never;
  registerAutosaveEffects(subscribeEffect, getState);
  return {
    fire(type: string) {
      const action = { type } as Action;
      for (const h of handlers) if (h.match(action)) h.run(action);
    },
  };
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
    engine: initialEngineState,
  } as RootState;
}

describe("autosave", () => {
  beforeEach(() => {
    installStoryStorageFake();
    vi.useFakeTimers();
  });

  it("writes the World record after the debounce", async () => {
    const state = baseState(["a"]);
    const { fire } = harness(() => state);
    fire("world/entityForged");
    await vi.runAllTimersAsync();
    expect((await loadWorldRecord()).world.entityIds).toEqual(["a"]);
  });

  it("does not write before the debounce elapses", async () => {
    const state = baseState(["a"]);
    const { fire } = harness(() => state);
    fire("world/entityForged");
    expect(api.v1.storyStorage.set).not.toHaveBeenCalled();
  });

  it("writes chat to its own record", async () => {
    const state = baseState();
    const { fire } = harness(() => state);
    fire("chat/messageAdded");
    await vi.runAllTimersAsync();
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      STORAGE_KEYS.CHAT,
      expect.anything(),
    );
  });

  it("writes the Foundation to its own record", async () => {
    // Its own record rather than a field of the World's: the Foundation is the
    // story's premise, and it changes on a different rhythm from the notebook
    // the Engine keeps.
    const state = baseState();
    const { fire } = harness(() => state);
    fire("foundation/intentSet");
    await vi.runAllTimersAsync();
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      STORAGE_KEYS.FOUNDATION,
      expect.anything(),
    );
  });

  it("ignores actions from slices it does not persist", async () => {
    const state = baseState(["a"]);
    const { fire } = harness(() => state);
    fire("ui/uiEditableActivate");
    fire("runtime/requestQueued");
    await vi.runAllTimersAsync();
    expect(api.v1.storyStorage.set).not.toHaveBeenCalled();
  });

  it("writes the state as it stands when the debounce fires, not when it started", async () => {
    // The whole burst collapses into one write, and that write is the current
    // state — an edit arriving inside the window is carried, not deferred to
    // the next one.
    let state = baseState(["E1"]);
    const { fire } = harness(() => state);

    fire("world/entityForged");
    state = baseState(["E1", "E2"]);
    fire("world/entityForged");
    await vi.runAllTimersAsync();

    expect((await loadWorldRecord()).world.entityIds).toEqual(["E1", "E2"]);
  });

  it("persists a deletion by writing what is left", async () => {
    // No index and no tombstone: the record is the whole World, so an entity
    // that is gone from the state is gone from the next write.
    let state = baseState(["a", "b"]);
    const { fire } = harness(() => state);
    fire("world/entityForged");
    await vi.runAllTimersAsync();

    state = baseState(["a"]);
    fire("world/entityDeleted");
    await vi.runAllTimersAsync();

    expect((await loadWorldRecord()).world.entityIds).toEqual(["a"]);
  });
});
