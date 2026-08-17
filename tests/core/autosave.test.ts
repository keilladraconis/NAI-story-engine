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
import { initialEngineState } from "../../src/core/store/slices/engine";
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

/** As `harness`, but the state can change between actions — the shape a burst
 *  spanning a node boundary actually has. */
function mutableHarness(getState: () => RootState) {
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
    engine: initialEngineState,
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

  it("writes the Foundation to storyStorage, never to historyStorage", async () => {
    // Foundation is the story's premise, not a property of a point in it. If it
    // ever lands in historyStorage, undo starts reverting it while Memory and
    // Author's Note — which is what actually reaches the model — keep the newer
    // text.
    const { fire } = harness(baseState());
    fire("foundation/intentSet");
    await vi.runAllTimersAsync();
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      "kse-foundation",
      expect.anything(),
    );
    expect(api.v1.historyStorage.set).not.toHaveBeenCalled();
  });

  it("ignores actions from slices it does not persist", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("ui/uiEditableActivate");
    fire("runtime/requestQueued");
    await vi.runAllTimersAsync();
    expect(api.v1.historyStorage.set).not.toHaveBeenCalled();
  });

  it("keeps the whole burst on the node it started at", async () => {
    // Two edits either side of a node boundary both land on the earlier node.
    // That is the deliberate trade: re-capturing per action would stamp the
    // window with the later node instead, and undoing back across the boundary
    // would then lose the first edit outright. A later edit leaking backwards
    // is recoverable; a lost one is not. Do not "fix" this without reading the
    // comment on pendingNode.
    const h = installHistoryFake();
    const n1 = h.current();
    let state = baseState(["E1"]);
    const { fire } = mutableHarness(() => state);

    fire("world/entityForged"); // arms pendingNode = n1
    h.push(); // the writer generates a paragraph; the cursor moves
    state = baseState(["E1", "E2"]);
    fire("world/entityForged"); // extends the debounce, does NOT re-stamp
    await vi.runAllTimersAsync();

    h.goto(n1);
    expect((await loadBranchState(n1)).world.entityIds).toEqual(["E1", "E2"]);
  });

  it("never removes a record key", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("world/entityDeleted");
    await vi.runAllTimersAsync();
    expect(api.v1.historyStorage.remove).not.toHaveBeenCalled();
  });
});
