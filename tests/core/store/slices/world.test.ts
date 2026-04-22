import { describe, it, expect } from "vitest";
import {
  worldSlice,
  entityForged,
  entityDeleted,
  entitySummaryUpdated,
  entityBound,
  entityUnbound,
  groupCreated,
  groupDeleted,
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
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
  groups: [],
  entitiesById: {},
  entityIds: [],
  forgeLoopActive: false,
  ...overrides,
});

const ENTITY = {
  id: "e1",
  categoryId: FieldID.DramatisPersonae as DulfsFieldID,
  name: "Elara",
  summary: "",
};

const GROUP = { id: "g1", title: "Main Circle", summary: "Core cast", entityIds: [] };

// ─────────────────────────────────────────────────────────────────────────────
// Group (Thread) actions
// ─────────────────────────────────────────────────────────────────────────────

describe("groupCreated", () => {
  it("adds a group", () => {
    const state = reduce(makeState(), groupCreated({ group: GROUP }));
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].title).toBe("Main Circle");
  });
});

describe("groupDeleted", () => {
  it("removes a group by id", () => {
    const state = reduce(
      makeState({ groups: [GROUP] }),
      groupDeleted({ groupId: "g1" }),
    );
    expect(state.groups).toHaveLength(0);
  });
});

describe("groupRenamed", () => {
  it("renames a group by id", () => {
    const state = reduce(
      makeState({ groups: [GROUP] }),
      groupRenamed({ groupId: "g1", title: "Inner Ring" }),
    );
    expect(state.groups[0].title).toBe("Inner Ring");
  });
});

describe("groupSummaryUpdated", () => {
  it("updates the group summary", () => {
    const state = reduce(
      makeState({ groups: [GROUP] }),
      groupSummaryUpdated({ groupId: "g1", summary: "Bound by oaths" }),
    );
    expect(state.groups[0].summary).toBe("Bound by oaths");
  });
});

describe("entityGroupToggled", () => {
  it("adds entity to group when not a member", () => {
    const state = reduce(
      makeState({ groups: [GROUP] }),
      entityGroupToggled({ groupId: "g1", entityId: "e1" }),
    );
    expect(state.groups[0].entityIds).toContain("e1");
  });

  it("removes entity from group when already a member", () => {
    const groupWithMember = { ...GROUP, entityIds: ["e1"] };
    const state = reduce(
      makeState({ groups: [groupWithMember] }),
      entityGroupToggled({ groupId: "g1", entityId: "e1" }),
    );
    expect(state.groups[0].entityIds).not.toContain("e1");
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
  it("removes the entity and cleans up group membership", () => {
    const groupWithMember = { ...GROUP, entityIds: ["e1"] };
    const state = reduce(
      makeState({ entitiesById: { e1: ENTITY }, entityIds: ["e1"], groups: [groupWithMember] }),
      entityDeleted({ entityId: "e1" }),
    );
    expect(state.entityIds).toHaveLength(0);
    expect(state.entitiesById["e1"]).toBeUndefined();
    expect(state.groups[0].entityIds).toHaveLength(0);
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
