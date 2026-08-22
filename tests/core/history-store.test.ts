import { describe, it, expect, beforeEach } from "vitest";
import { installHistoryFake, type HistoryFake } from "../helpers/history-fake";
import {
  captureNode,
  saveRecords,
  loadBranchState,
} from "../../src/core/store/persistence/history-store";
import { toRecords } from "../../src/core/store/persistence/keyspace";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import type { RootState, WorldEntity } from "../../src/core/store/types";

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: "",
  };
}

function stateWith(ids: string[]): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const id of ids) entitiesById[id] = entity(id, id.toUpperCase());
  return {
    story: initialStoryState,
    world: { ...initialWorldState, entitiesById, entityIds: ids },
  } as RootState;
}

describe("history-store", () => {
  let h: HistoryFake;
  beforeEach(() => {
    h = installHistoryFake();
  });

  it("loads back what it saved at the same node", async () => {
    const node = await captureNode();
    await saveRecords(toRecords(stateWith(["a"])), node);
    const out = await loadBranchState();
    expect(out.world.entityIds).toEqual(["a"]);
  });

  it("returns pristine state at a node that has never been written", async () => {
    const out = await loadBranchState();
    expect(out.world).toEqual(initialWorldState);
  });

  it("inherits a parent's records at a child node", async () => {
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());
    h.push();
    const out = await loadBranchState();
    expect(out.world.entityIds).toEqual(["a"]);
  });

  it("drops an entity created on a branch once you navigate away", async () => {
    const root = h.current();
    await saveRecords(toRecords(stateWith(["a"])), root);
    h.push();
    await saveRecords(toRecords(stateWith(["a", "b"])), await captureNode());
    expect((await loadBranchState()).world.entityIds).toEqual(["a", "b"]);

    h.goto(root);
    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
  });

  it("deletes branch-locally through the index, leaving the ancestor intact", async () => {
    const root = h.current();
    await saveRecords(toRecords(stateWith(["a", "b"])), root);
    h.push();
    // "Delete" b: write an index without it. The e:b record still exists at the
    // ancestor and is deliberately not removed.
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());

    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
    h.goto(root);
    expect((await loadBranchState()).world.entityIds).toEqual(["a", "b"]);
  });

  it("writes to the node it is given, not to wherever the cursor has moved", async () => {
    // The whole point of capturing at dispatch: the cursor can move between
    // capture and flush, and the write must still land where the state was.
    const node = await captureNode();
    h.push();
    await saveRecords(toRecords(stateWith(["a"])), node);

    expect((await loadBranchState()).world.entityIds).toEqual(["a"]); // inherited
    h.goto(node);
    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
  });

  it("never calls list() — the index is the enumeration", async () => {
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());
    await loadBranchState();
    expect(api.v1.historyStorage.list).not.toHaveBeenCalled();
  });

  it("never removes a record key", async () => {
    await saveRecords(toRecords(stateWith(["a", "b"])), await captureNode());
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());
    expect(api.v1.historyStorage.remove).not.toHaveBeenCalled();
  });
});

describe("history-store survives an index it did not write", () => {
  let h: HistoryFake;
  beforeEach(() => {
    h = installHistoryFake();
  });

  it("loads a pre-rename index instead of throwing on it", async () => {
    // An index written by an earlier build of this branch carries `groupIds`
    // and no `threadIds`. `index.threadIds.map(...)` on that is a TypeError,
    // and nothing catches it: `loadBranchState` is awaited inside `Promise.all`
    // in mount.ts, which `start()` is called from as a bare `void start()`. The
    // whole script fails to mount — no sidebar, no HUD, no visible error.
    //
    // Alpha means no migration. It does not mean a crash: the plan and the
    // CHANGELOG both promise the state is DROPPED, and this is what dropping
    // looks like.
    const node = h.current();
    await api.v1.historyStorage.set("index", { groupIds: ["g1"] }, node);
    await api.v1.historyStorage.set(
      "t:g1",
      { id: "g1", title: "The Guild", text: "", entityIds: [] },
      node,
    );

    const out = await loadBranchState();
    expect(out.world.threads).toEqual([]);
    expect(out.world.entityIds).toEqual([]);
  });

  it("still loads the entities an index does name when a list is missing", async () => {
    // A partial index is a partial load, not an empty one — whatever it names
    // comes back.
    const node = h.current();
    const records = toRecords(stateWith(["a"]));
    for (const [key, value] of Object.entries(records)) {
      await api.v1.historyStorage.set(key, value, node);
    }
    await api.v1.historyStorage.set("index", { entityIds: ["a"] }, node);

    const out = await loadBranchState();
    expect(out.world.entityIds).toEqual(["a"]);
  });
});
