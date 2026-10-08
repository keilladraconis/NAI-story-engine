import { describe, it, expect } from "vitest";
import {
  worldSlice,
  entityForged,
  entityDeleted,
  entitySummaryUpdated,
  entityLorebookEntryBound,
  entityBound,
  entitiesBoundBatch,
  entityUnbound,
  threadCreated,
  threadDeleted,
  threadRenamed,
  threadLedgerUpdated,
  threadWishSet,
  threadMemberToggled,
  threadStatusSet,
} from "../../../../src/core/store/slices/world";
import {
  Thread,
  WorldState,
  WorldEntity,
} from "../../../../src/core/store/types";
import { rootReducer } from "../../../../src/core/store";
import { engineSettingsChanged } from "../../../../src/core/store/slices/engine";
import { ENGINE_DEFAULTS } from "../../../../src/core/engine/settings";
import {
  FieldID,
  DulfsFieldID,
} from "../../../../src/config/field-definitions";

const reduce = (
  state: WorldState,
  action: { type: string; payload?: unknown },
) => worldSlice.reducer(state, action as any);

const makeState = (overrides: Partial<WorldState> = {}): WorldState => ({
  threads: [],
  entitiesById: {},
  entityIds: [],
  ...overrides,
});

const ENTITY: WorldEntity = {
  id: "e1",
  categoryId: FieldID.DramatisPersonae as DulfsFieldID,
  name: "Elara",
  summary: "",
  lifecycle: "live" as const,
};

const THREAD: Thread = {
  id: "t1",
  title: "Main Circle",
  state: "The cooperative's keepers share the east hives.",
  latent: "",
  wish: "",
  entityIds: [],
  status: "open",
};

// ─────────────────────────────────────────────────────────────────────────────
// Thread actions
// ─────────────────────────────────────────────────────────────────────────────

describe("threadCreated", () => {
  it("adds a thread", () => {
    const state = reduce(makeState(), threadCreated({ thread: THREAD }));
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0].title).toBe("Main Circle");
  });

  it("defaults latent and status when the payload omits them", () => {
    const state = reduce(
      makeState(),
      threadCreated({
        thread: { id: "t2", title: "Bare", state: "", entityIds: [] },
      }),
    );
    expect(state.threads[0].latent).toBe("");
    expect(state.threads[0].status).toBe("open");
  });

  it("keeps an explicit latent and status", () => {
    const state = reduce(
      makeState(),
      threadCreated({
        thread: {
          ...THREAD,
          latent: "Nobody has said it.",
          status: "concluded",
        },
      }),
    );
    expect(state.threads[0].latent).toBe("Nobody has said it.");
    expect(state.threads[0].status).toBe("concluded");
  });
});

// The thread limit restrains the Engine's admissions, not the reducer: it is
// checked in `applyFloors` and the drain (see engine/thread-cap.ts).
describe("the thread limit is not a reducer invariant", () => {
  it("lets any callsite create past the limit", () => {
    let state = rootReducer(undefined, { type: "@@INIT" });
    state = rootReducer(
      state,
      engineSettingsChanged({ ...ENGINE_DEFAULTS, threadCap: 2 }),
    );
    for (const id of ["a", "b", "c", "d"]) {
      state = rootReducer(
        state,
        threadCreated({ thread: { ...THREAD, id, title: id } }),
      );
    }
    expect(state.world.threads.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("mirrors a cap-only settings change into the store", () => {
    // The engine slice returns the same object when a re-read changed nothing,
    // so a settings comparison that forgot `threadCap` would leave the cap at
    // whatever it was when the delay last moved.
    const state = rootReducer(
      rootReducer(undefined, { type: "@@INIT" }),
      engineSettingsChanged({ ...ENGINE_DEFAULTS, threadCap: 3 }),
    );
    expect(state.engine.settings.threadCap).toBe(3);
  });
});

describe("threadDeleted", () => {
  it("removes a thread by id", () => {
    const state = reduce(
      makeState({ threads: [THREAD] }),
      threadDeleted({ threadId: "t1", lorebookEntryId: undefined }),
    );
    expect(state.threads).toHaveLength(0);
  });
});

describe("threadRenamed", () => {
  it("renames a thread by id", () => {
    const state = reduce(
      makeState({ threads: [THREAD] }),
      threadRenamed({ threadId: "t1", title: "Inner Ring" }),
    );
    expect(state.threads[0].title).toBe("Inner Ring");
  });
});

describe("threadLedgerUpdated", () => {
  it("writes state and latent together, and nothing else about the thread", () => {
    const state = reduce(
      makeState({ threads: [{ ...THREAD, entityIds: ["e1"] }] }),
      threadLedgerUpdated({
        threadId: "t1",
        state: "Bound by oaths.",
        latent: "One keeper means to leave.",
      }),
    );
    expect(state.threads[0]).toEqual({
      ...THREAD,
      entityIds: ["e1"],
      state: "Bound by oaths.",
      latent: "One keeper means to leave.",
    });
  });

  it("no-ops on an id no thread has", () => {
    const state = reduce(
      makeState({ threads: [THREAD] }),
      threadLedgerUpdated({ threadId: "nope", state: "x", latent: "y" }),
    );
    expect(state.threads).toEqual([THREAD]);
  });
});

describe("threadMemberToggled", () => {
  it("adds entity to thread when not a member", () => {
    const state = reduce(
      makeState({ threads: [THREAD] }),
      threadMemberToggled({ threadId: "t1", entityId: "e1" }),
    );
    expect(state.threads[0].entityIds).toContain("e1");
  });

  it("removes entity from thread when already a member", () => {
    const threadWithMember = { ...THREAD, entityIds: ["e1"] };
    const state = reduce(
      makeState({ threads: [threadWithMember] }),
      threadMemberToggled({ threadId: "t1", entityId: "e1" }),
    );
    expect(state.threads[0].entityIds).not.toContain("e1");
  });
});

describe("threadStatusSet", () => {
  it("concludes a thread without touching the rest of it", () => {
    const state = reduce(
      makeState({ threads: [{ ...THREAD, entityIds: ["e1"] }] }),
      threadStatusSet({ threadId: "t1", status: "concluded" }),
    );
    expect(state.threads[0]).toEqual({
      ...THREAD,
      entityIds: ["e1"],
      status: "concluded",
    });
  });

  it("reopens a concluded thread", () => {
    const concluded: Thread = { ...THREAD, status: "concluded" };
    const state = reduce(
      makeState({ threads: [concluded] }),
      threadStatusSet({ threadId: "t1", status: "open" }),
    );
    expect(state.threads[0].status).toBe("open");
  });

  it("is a setter, not a toggle: the same payload twice lands the same value", () => {
    const once = reduce(
      makeState({ threads: [THREAD] }),
      threadStatusSet({ threadId: "t1", status: "concluded" }),
    );
    const twice = reduce(
      once,
      threadStatusSet({ threadId: "t1", status: "concluded" }),
    );
    expect(twice.threads[0].status).toBe("concluded");
    expect(twice.threads).toEqual(once.threads);
  });

  it("no-ops on an id no thread has", () => {
    const state = reduce(
      makeState({ threads: [THREAD] }),
      threadStatusSet({ threadId: "nope", status: "concluded" }),
    );
    expect(state.threads).toEqual([THREAD]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity actions
// ─────────────────────────────────────────────────────────────────────────────

describe("entityForged", () => {
  it("adds an entity with a lorebook entry", () => {
    const entity = { ...ENTITY, lorebookEntryId: "lb1" };
    const state = reduce(makeState(), entityForged({ entity }));
    expect(state.entityIds).toHaveLength(1);
    expect(state.entitiesById["e1"].lorebookEntryId).toBe("lb1");
  });
});

describe("entityDeleted", () => {
  it("removes the entity and cleans up thread membership", () => {
    const threadWithMember = { ...THREAD, entityIds: ["e1"] };
    const state = reduce(
      makeState({
        entitiesById: { e1: ENTITY },
        entityIds: ["e1"],
        threads: [threadWithMember],
      }),
      entityDeleted({ entityId: "e1" }),
    );
    expect(state.entityIds).toHaveLength(0);
    expect(state.entitiesById["e1"]).toBeUndefined();
    expect(state.threads[0].entityIds).toHaveLength(0);
  });
});

describe("entitySummaryUpdated", () => {
  it("updates the summary of an entity", () => {
    const state = reduce(
      makeState({ entitiesById: { e1: ENTITY }, entityIds: ["e1"] }),
      entitySummaryUpdated({ entityId: "e1", summary: "A disgraced knight." }),
    );
    expect(state.entitiesById["e1"].summary).toBe("A disgraced knight.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bind / Unbind
// ─────────────────────────────────────────────────────────────────────────────

describe("entityBound", () => {
  it("adds an entity with a lorebook entry", () => {
    const bound = { ...ENTITY, lorebookEntryId: "lb1" };
    const state = reduce(makeState(), entityBound({ entity: bound }));
    expect(state.entitiesById["e1"].lorebookEntryId).toBe("lb1");
  });

  // The Import wizard's Bind mints a fresh entity id per click, so a doubled
  // mobile tap arrives as two binds that differ only by id.
  it("ignores a second bind of a lorebook entry already bound", () => {
    const first = reduce(
      makeState(),
      entityBound({ entity: { ...ENTITY, lorebookEntryId: "lb1" } }),
    );
    const second = reduce(
      first,
      entityBound({
        entity: { ...ENTITY, id: "e2", lorebookEntryId: "lb1" },
      }),
    );
    expect(second.entityIds).toEqual(["e1"]);
    expect(second.entitiesById["e2"]).toBeUndefined();
  });

  it("still binds a different lorebook entry", () => {
    const first = reduce(
      makeState(),
      entityBound({ entity: { ...ENTITY, lorebookEntryId: "lb1" } }),
    );
    const second = reduce(
      first,
      entityBound({
        entity: { ...ENTITY, id: "e2", lorebookEntryId: "lb2" },
      }),
    );
    expect(second.entityIds).toEqual(["e1", "e2"]);
  });

  it("binds again after the entry is unbound", () => {
    const first = reduce(
      makeState(),
      entityBound({ entity: { ...ENTITY, lorebookEntryId: "lb1" } }),
    );
    const cleared = reduce(first, entityUnbound({ entityId: "e1" }));
    const rebound = reduce(
      cleared,
      entityBound({
        entity: { ...ENTITY, id: "e2", lorebookEntryId: "lb1" },
      }),
    );
    expect(rebound.entitiesById["e2"].lorebookEntryId).toBe("lb1");
  });
});

describe("entitiesBoundBatch", () => {
  it("binds every unmanaged entry in one dispatch", () => {
    const state = reduce(
      makeState(),
      entitiesBoundBatch([
        { ...ENTITY, id: "e1", lorebookEntryId: "lb1" },
        { ...ENTITY, id: "e2", lorebookEntryId: "lb2" },
      ]),
    );
    expect(state.entityIds).toEqual(["e1", "e2"]);
  });

  it("skips entries already bound, keeping the rest", () => {
    const first = reduce(
      makeState(),
      entityBound({ entity: { ...ENTITY, lorebookEntryId: "lb1" } }),
    );
    const state = reduce(
      first,
      entitiesBoundBatch([
        { ...ENTITY, id: "e2", lorebookEntryId: "lb1" },
        { ...ENTITY, id: "e3", lorebookEntryId: "lb2" },
      ]),
    );
    expect(state.entityIds).toEqual(["e1", "e3"]);
  });

  it("keeps one entity when the batch repeats an entry within itself", () => {
    const state = reduce(
      makeState(),
      entitiesBoundBatch([
        { ...ENTITY, id: "e1", lorebookEntryId: "lb1" },
        { ...ENTITY, id: "e2", lorebookEntryId: "lb1" },
      ]),
    );
    expect(state.entityIds).toEqual(["e1"]);
  });
});

describe("entityLorebookEntryBound", () => {
  it("attaches the lorebook entry id to the entity", () => {
    const draft: WorldEntity = { ...ENTITY, lifecycle: "draft" };
    const state = reduce(
      makeState({ entitiesById: { e1: draft }, entityIds: ["e1"] }),
      entityLorebookEntryBound({ entityId: "e1", lorebookEntryId: "lb-new" }),
    );
    expect(state.entitiesById["e1"].lorebookEntryId).toBe("lb-new");
  });

  it("promotes a draft entity to live when binding", () => {
    const draft: WorldEntity = { ...ENTITY, lifecycle: "draft" };
    const state = reduce(
      makeState({ entitiesById: { e1: draft }, entityIds: ["e1"] }),
      entityLorebookEntryBound({ entityId: "e1", lorebookEntryId: "lb-new" }),
    );
    expect(state.entitiesById["e1"].lifecycle).toBe("live");
  });

  it("keeps a live entity live when re-bound", () => {
    const live: WorldEntity = {
      ...ENTITY,
      lifecycle: "live",
      lorebookEntryId: "lb-old",
    };
    const state = reduce(
      makeState({ entitiesById: { e1: live }, entityIds: ["e1"] }),
      entityLorebookEntryBound({ entityId: "e1", lorebookEntryId: "lb-new" }),
    );
    expect(state.entitiesById["e1"].lifecycle).toBe("live");
    expect(state.entitiesById["e1"].lorebookEntryId).toBe("lb-new");
  });

  it("no-ops when the entity does not exist", () => {
    const before = makeState();
    const after = reduce(
      before,
      entityLorebookEntryBound({
        entityId: "missing",
        lorebookEntryId: "lb-x",
      }),
    );
    expect(after).toBe(before);
  });
});

describe("entityUnbound", () => {
  it("removes the entity from world state", () => {
    const entity = { ...ENTITY, lorebookEntryId: "lb1" };
    const state = reduce(
      makeState({ entitiesById: { e1: entity }, entityIds: ["e1"] }),
      entityUnbound({ entityId: "e1" }),
    );
    expect(state.entityIds).toHaveLength(0);
    expect(state.entitiesById["e1"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lifecycle and sourceChatId fields
// ─────────────────────────────────────────────────────────────────────────────

describe("worldSlice — lifecycle and sourceChatId", () => {
  it("entityForged stores lifecycle and sourceChatId on the entity", () => {
    const entity: WorldEntity = {
      id: "e1",
      categoryId: FieldID.DramatisPersonae,
      name: "Vesper",
      summary: "Paranoid governess",
      lifecycle: "draft",
      sourceChatId: "chat-abc",
    };
    const state = reduce(makeState(), entityForged({ entity }));
    expect(state.entitiesById["e1"]).toEqual(entity);
  });

  it("entityForged accepts live entities without sourceChatId", () => {
    const entity: WorldEntity = {
      id: "e2",
      categoryId: FieldID.Locations,
      name: "Old Quay",
      summary: "Decaying waterfront",
      lifecycle: "live",
      lorebookEntryId: "lb-1",
    };
    const state = reduce(makeState(), entityForged({ entity }));
    expect(state.entitiesById["e2"].lifecycle).toBe("live");
    expect(state.entitiesById["e2"].sourceChatId).toBeUndefined();
  });
});

describe("entitySummaryUpdated", () => {
  it("replaces the summary and nothing else", () => {
    const entity: WorldEntity = {
      id: "e1",
      categoryId: FieldID.DramatisPersonae,
      name: "Vesper",
      summary: "Paranoid governess",
      lifecycle: "draft",
    };
    const seeded = reduce(makeState(), entityForged({ entity }));
    const next = reduce(
      seeded,
      entitySummaryUpdated({ entityId: "e1", summary: "revised" }),
    );
    expect(next.entitiesById["e1"]).toEqual({ ...entity, summary: "revised" });
  });
});

describe("a Thread's wish", () => {
  const draft = {
    id: "t1",
    title: "Half the House",
    state: "s",
    entityIds: [],
  };

  it("defaults to empty when a creator does not supply one", () => {
    const next = reduce(makeState(), threadCreated({ thread: draft }));
    expect(next.threads[0].wish).toBe("");
  });

  it("is kept when a creator supplies one", () => {
    const next = reduce(
      makeState(),
      threadCreated({ thread: { ...draft, wish: "She floods the cut." } }),
    );
    expect(next.threads[0].wish).toBe("She floods the cut.");
  });

  it("is set by threadWishSet and survives a ledger update", () => {
    let s = reduce(makeState(), threadCreated({ thread: draft }));
    s = reduce(s, threadWishSet({ threadId: "t1", wish: "W" }));
    s = reduce(
      s,
      threadLedgerUpdated({ threadId: "t1", state: "new", latent: "hidden" }),
    );
    expect(s.threads[0]).toMatchObject({
      state: "new",
      latent: "hidden",
      wish: "W",
    });
  });
});
