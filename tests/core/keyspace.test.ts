import { describe, it, expect } from "vitest";
import {
  INDEX_KEY,
  entityKey,
  threadKey,
  fieldKey,
  buildIndex,
  toRecords,
  applyRecords,
} from "../../src/core/store/persistence/keyspace";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import type { RootState, WorldEntity } from "../../src/core/store/types";

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: `${name} summary`,
  };
}

function state(over: Partial<RootState> = {}): RootState {
  return {
    story: {
      ...initialStoryState,
      fields: { dramatisPersonae: { id: "dramatisPersonae", content: "Ada" } },
    },
    world: {
      ...initialWorldState,
      entitiesById: { e1: entity("e1", "Ada") },
      entityIds: ["e1"],
      threads: [
        {
          id: "g1",
          title: "The Guild",
          summary: "unsettled",
          entityIds: ["e1"],
        },
      ],
    },
    foundation: { ...initialFoundationState, intent: "a premise" },
    ...over,
  } as RootState;
}

describe("key builders", () => {
  it("prefixes each record kind distinctly", () => {
    // Entity ids and lorebook entry ids are both UUIDs; the prefix is what
    // keeps them apart in one flat keyspace.
    expect(entityKey("x")).toBe("e:x");
    expect(threadKey("x")).toBe("t:x");
    expect(fieldKey("x")).toBe("f:x");
  });
});

describe("buildIndex", () => {
  it("names every record the state carries", () => {
    expect(buildIndex(state())).toEqual({
      entityIds: ["e1"],
      threadIds: ["g1"],
      fieldIds: ["dramatisPersonae"],
    });
  });

  it("has no entities or threads for a pristine store", () => {
    // NOTE: initialStoryState.fields is NOT empty. story.ts seeds it at module
    // load with every non-list FIELD_CONFIG (brainstorm, attg, style), so a
    // pristine store already names those three fields.
    const empty = {
      story: initialStoryState,
      world: initialWorldState,
      foundation: initialFoundationState,
    } as RootState;
    const index = buildIndex(empty);
    expect(index.entityIds).toEqual([]);
    expect(index.threadIds).toEqual([]);
    expect(index.fieldIds).toEqual(Object.keys(initialStoryState.fields));
    expect(index.fieldIds.length).toBeGreaterThan(0);
  });
});

describe("toRecords", () => {
  it("writes one record per entity, thread and field, plus the singletons", () => {
    const r = toRecords(state());
    // The fixture replaces story.fields wholesale, so only its one field is
    // present — the seeded skeleton is not merged in by toRecords.
    expect(Object.keys(r).sort()).toEqual(
      [INDEX_KEY, "e:e1", "t:g1", "f:dramatisPersonae"].sort(),
    );
    expect(r["e:e1"]).toEqual(entity("e1", "Ada"));
    // Foundation is deliberately absent: it is story-scoped, not branch-scoped.
    expect(Object.keys(r)).not.toContain("foundation");
  });
});

describe("applyRecords", () => {
  it("round-trips a full state", () => {
    const s = state();
    const records = toRecords(s);
    const out = applyRecords(records[INDEX_KEY] as never, records);
    expect(out.world.entitiesById).toEqual(s.world.entitiesById);
    expect(out.world.entityIds).toEqual(["e1"]);
    expect(out.world.threads).toEqual(s.world.threads);
    expect(out.story.fields.dramatisPersonae).toEqual(
      s.story.fields.dramatisPersonae,
    );
  });

  it("returns pristine state when there is no index at this node", () => {
    const out = applyRecords(undefined, {});
    expect(out.world).toEqual(initialWorldState);
    expect(out.story).toEqual(initialStoryState);
  });

  it("ignores a record the index does not name — this is how deletion works", () => {
    // The stale e:e1 record is still readable (it lives at an ancestor and
    // historyStorage has no way to delete it branch-locally), but the index at
    // this node no longer names it, so the entity is gone.
    const records = toRecords(state());
    const index = { entityIds: [], threadIds: ["g1"], fieldIds: [] };
    const out = applyRecords(index, records);
    expect(out.world.entityIds).toEqual([]);
    expect(out.world.entitiesById).toEqual({});
  });

  it("skips an id the index names but whose record is missing", () => {
    const out = applyRecords(
      { entityIds: ["ghost"], threadIds: [], fieldIds: [] },
      {},
    );
    expect(out.world.entityIds).toEqual([]);
    expect(out.world.entitiesById).toEqual({});
  });

  it("preserves index order for entities", () => {
    const records = {
      "e:a": entity("a", "A"),
      "e:b": entity("b", "B"),
    };
    const out = applyRecords(
      { entityIds: ["b", "a"], threadIds: [], fieldIds: [] },
      records,
    );
    expect(out.world.entityIds).toEqual(["b", "a"]);
  });
});
