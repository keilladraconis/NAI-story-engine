import { describe, it, expect } from "vitest";
import {
  worldSlice,
  entityForged,
  entityCast,
  entityReforged,
  entityDeleted,
  entitySummaryUpdated,
  entityBound,
  entityUnbound,
  batchCreated,
  batchRenamed,
  relationshipAdded,
  relationshipRemoved,
  relationshipUpdated,
} from "../../../../src/core/store/slices/world";
import { WorldState } from "../../../../src/core/store/types";
import {
  FieldID,
  DulfsFieldID,
} from "../../../../src/config/field-definitions";

const reduce = (
  state: WorldState,
  action: { type: string; payload?: unknown },
) => worldSlice.reducer(state, action as any);

const makeState = (overrides: Partial<WorldState> = {}): WorldState => ({
  batches: [],
  entities: [],
  relationships: [],
  forgeLoopActive: false,
  ...overrides,
});

const BATCH = { id: "b1", name: "Main", entityIds: [] };
const ENTITY = {
  id: "e1",
  batchId: "b1",
  categoryId: FieldID.DramatisPersonae as DulfsFieldID,
  lifecycle: "draft" as const,
  name: "Elara",
  summary: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Batch actions
// ─────────────────────────────────────────────────────────────────────────────

describe("batchCreated", () => {
  it("adds a batch", () => {
    const state = reduce(makeState(), batchCreated({ batch: BATCH }));
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].name).toBe("Main");
  });
});

describe("batchRenamed", () => {
  it("renames a batch by id", () => {
    const state = reduce(
      makeState({ batches: [BATCH] }),
      batchRenamed({ batchId: "b1", name: "Chapter One" }),
    );
    expect(state.batches[0].name).toBe("Chapter One");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("entityForged", () => {
  it("adds a draft entity", () => {
    const state = reduce(
      makeState({ batches: [BATCH] }),
      entityForged({ entity: ENTITY }),
    );
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0].lifecycle).toBe("draft");
  });
});

describe("entityCast", () => {
  it("sets lifecycle to live and records lorebookEntryId", () => {
    const state = reduce(
      makeState({ entities: [ENTITY] }),
      entityCast({ entityId: "e1", lorebookEntryId: "lb1" }),
    );
    expect(state.entities[0].lifecycle).toBe("live");
    expect(state.entities[0].lorebookEntryId).toBe("lb1");
  });
});

describe("entityReforged", () => {
  it("sets lifecycle back to draft and clears lorebookEntryId", () => {
    const live = {
      ...ENTITY,
      lifecycle: "live" as const,
      lorebookEntryId: "lb1",
    };
    const state = reduce(
      makeState({ entities: [live] }),
      entityReforged({ entityId: "e1" }),
    );
    expect(state.entities[0].lifecycle).toBe("draft");
    expect(state.entities[0].lorebookEntryId).toBeUndefined();
  });
});

describe("entityDeleted", () => {
  it("removes the entity and its relationships", () => {
    const rel = {
      id: "r1",
      fromEntityId: "e1",
      toEntityId: "e2",
      description: "ally",
    };
    const state = reduce(
      makeState({ entities: [ENTITY], relationships: [rel] }),
      entityDeleted({ entityId: "e1" }),
    );
    expect(state.entities).toHaveLength(0);
    expect(state.relationships).toHaveLength(0);
  });
});

describe("entitySummaryUpdated", () => {
  it("updates the summary of a live entity", () => {
    const state = reduce(
      makeState({ entities: [ENTITY] }),
      entitySummaryUpdated({ entityId: "e1", summary: "A disgraced knight." }),
    );
    expect(state.entities[0].summary).toBe("A disgraced knight.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bind / Unbind
// ─────────────────────────────────────────────────────────────────────────────

describe("entityBound", () => {
  it("adds an entity directly in live state", () => {
    const bound = {
      ...ENTITY,
      lifecycle: "live" as const,
      lorebookEntryId: "lb1",
    };
    const state = reduce(makeState(), entityBound({ entity: bound }));
    expect(state.entities[0].lifecycle).toBe("live");
    expect(state.entities[0].lorebookEntryId).toBe("lb1");
  });
});

describe("entityUnbound", () => {
  it("removes the entity from world state", () => {
    const live = {
      ...ENTITY,
      lifecycle: "live" as const,
      lorebookEntryId: "lb1",
    };
    const state = reduce(
      makeState({ entities: [live] }),
      entityUnbound({ entityId: "e1" }),
    );
    expect(state.entities).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Relationships
// ─────────────────────────────────────────────────────────────────────────────

const REL = {
  id: "r1",
  fromEntityId: "e1",
  toEntityId: "e2",
  description: "ally",
};

describe("relationshipAdded", () => {
  it("adds a relationship", () => {
    const state = reduce(makeState(), relationshipAdded({ relationship: REL }));
    expect(state.relationships).toHaveLength(1);
    expect(state.relationships[0].description).toBe("ally");
  });
});

describe("relationshipUpdated", () => {
  it("updates the description", () => {
    const state = reduce(
      makeState({ relationships: [REL] }),
      relationshipUpdated({ relationshipId: "r1", description: "rival" }),
    );
    expect(state.relationships[0].description).toBe("rival");
  });
});

describe("relationshipRemoved", () => {
  it("removes the relationship by id", () => {
    const state = reduce(
      makeState({ relationships: [REL] }),
      relationshipRemoved({ relationshipId: "r1" }),
    );
    expect(state.relationships).toHaveLength(0);
  });
});
