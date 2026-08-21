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
  threadTextUpdated,
  threadMemberToggled,
} from "../../../../src/core/store/slices/world";
import {
  Thread,
  WorldState,
  WorldEntity,
} from "../../../../src/core/store/types";
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
  text: "Core cast",
  horizon: "plot",
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

  it("defaults horizon and status when the payload omits them", () => {
    const state = reduce(
      makeState(),
      threadCreated({
        thread: { id: "t2", title: "Bare", text: "", entityIds: [] },
      }),
    );
    expect(state.threads[0].horizon).toBe("plot");
    expect(state.threads[0].status).toBe("open");
  });

  it("keeps an explicit horizon and status", () => {
    const state = reduce(
      makeState(),
      threadCreated({
        thread: { ...THREAD, horizon: "arc", status: "satisfied" },
      }),
    );
    expect(state.threads[0].horizon).toBe("arc");
    expect(state.threads[0].status).toBe("satisfied");
  });
});

describe("threadDeleted", () => {
  it("removes a thread by id", () => {
    const state = reduce(
      makeState({ threads: [THREAD] }),
      threadDeleted({ threadId: "t1" }),
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

describe("threadTextUpdated", () => {
  it("updates the thread text", () => {
    const state = reduce(
      makeState({ threads: [THREAD] }),
      threadTextUpdated({ threadId: "t1", text: "Bound by oaths" }),
    );
    expect(state.threads[0].text).toBe("Bound by oaths");
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

// ─────────────────────────────────────────────────────────────────────────────
// lastAffectingMessageId field
// ─────────────────────────────────────────────────────────────────────────────

describe("WorldEntity.lastAffectingMessageId", () => {
  it("entityForged accepts and stores lastAffectingMessageId", () => {
    const entity: WorldEntity = {
      id: "e1",
      categoryId: FieldID.DramatisPersonae,
      name: "Vesper",
      summary: "Paranoid governess",
      lifecycle: "draft",
      lastAffectingMessageId: "m-a",
    };
    const state = reduce(makeState(), entityForged({ entity }));
    expect(state.entitiesById["e1"].lastAffectingMessageId).toBe("m-a");
  });

  it("entitySummaryUpdated can update lastAffectingMessageId", () => {
    const entity: WorldEntity = {
      id: "e1",
      categoryId: FieldID.DramatisPersonae,
      name: "Vesper",
      summary: "Paranoid governess",
      lifecycle: "draft",
      lastAffectingMessageId: "m-a",
    };
    const seeded = reduce(makeState(), entityForged({ entity }));
    const next = reduce(
      seeded,
      entitySummaryUpdated({
        entityId: "e1",
        summary: "revised",
        lastAffectingMessageId: "m-b",
      } as any),
    );
    expect(next.entitiesById["e1"].summary).toBe("revised");
    expect(next.entitiesById["e1"].lastAffectingMessageId).toBe("m-b");
  });
});
