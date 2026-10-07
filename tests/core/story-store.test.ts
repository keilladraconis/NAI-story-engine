import { describe, it, expect, beforeEach } from "vitest";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../helpers/story-storage-fake";
import {
  loadWorldRecord,
  saveWorldRecord,
} from "../../src/core/store/persistence/story-store";
import { STORAGE_KEYS } from "../../src/core/keys";
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
          state: "The guild holds the harbour.",
          latent: "",
          wish: "",
          status: "open",
          entityIds: ["e1"],
        },
      ],
    },
    foundation: { ...initialFoundationState, intent: "a premise" },
    ...over,
  } as RootState;
}

let story: StoryStorageFake;

beforeEach(() => {
  story = installStoryStorageFake();
});

describe("the World record", () => {
  it("round-trips a full state through one storyStorage key", async () => {
    const s = state();
    await saveWorldRecord(s);

    expect(story.keys()).toEqual([STORAGE_KEYS.WORLD]);
    const out = await loadWorldRecord();
    expect(out.world.entitiesById).toEqual(s.world.entitiesById);
    expect(out.world.entityIds).toEqual(["e1"]);
    expect(out.world.threads).toEqual(s.world.threads);
    expect(out.story.fields.dramatisPersonae).toEqual(
      s.story.fields.dramatisPersonae,
    );
  });

  it("carries neither the Foundation nor the chat", async () => {
    // Both are storyStorage records of their own. Folding them in here would
    // rewrite the whole World on every keystroke in a brainstorm.
    await saveWorldRecord(state());
    expect(story.get(STORAGE_KEYS.WORLD)).not.toHaveProperty("foundation");
    expect(story.get(STORAGE_KEYS.WORLD)).not.toHaveProperty("chat");
  });

  it("returns pristine state for a story that has never been saved", async () => {
    const out = await loadWorldRecord();
    expect(out.world).toEqual(initialWorldState);
    expect(out.story).toEqual(initialStoryState);
  });

  it("forgets what the last write left out — this is how deletion works", async () => {
    // No index, no tombstone, no ancestor to uncover: the record IS the World,
    // so what the newest write does not carry is gone.
    await saveWorldRecord(state());
    await saveWorldRecord(
      state({ world: { ...initialWorldState, threads: [] } }),
    );

    const out = await loadWorldRecord();
    expect(out.world.entityIds).toEqual([]);
    expect(out.world.entitiesById).toEqual({});
    expect(out.world.threads).toEqual([]);
  });

  it("preserves the stored order of entities", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        entityIds: ["b", "a"],
        entitiesById: { a: entity("a", "A"), b: entity("b", "B") },
      },
    });
    expect((await loadWorldRecord()).world.entityIds).toEqual(["b", "a"]);
  });
});

describe("the World record defends the store from a record it did not write", () => {
  // This is the ONE path by which a `Thread` enters the store without passing
  // through `threadCreated`'s defaults, and the record is JSON some build of
  // Story Engine wrote. Alpha means no migration — it does not mean a
  // `TypeError` on load. Every defence below drops or defaults; none converts.

  it("reads a record of the wrong shape entirely as no record at all", async () => {
    story.set(STORAGE_KEYS.WORLD, "not a record");
    const out = await loadWorldRecord();
    expect(out.world).toEqual(initialWorldState);
    expect(out.story).toEqual(initialStoryState);
  });

  it("skips an id the record names but whose entity is missing", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: { entityIds: ["ghost"], entitiesById: {} },
    });
    const out = await loadWorldRecord();
    expect(out.world.entityIds).toEqual([]);
    expect(out.world.entitiesById).toEqual({});
  });

  it("drops Threads written before 0.16 and hands back their entry ids", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [
          {
            id: "old",
            title: "The glass",
            text: "x",
            horizon: "plot",
            lorebookEntryId: "le-old",
          },
          { id: "old2", title: "No entry", text: "y" },
          { id: "new", title: "Kept", state: "Stands.", entityIds: [] },
        ],
      },
    });

    const record = await loadWorldRecord();

    expect(record.world.threads).toEqual([
      {
        id: "new",
        title: "Kept",
        state: "Stands.",
        latent: "",
        wish: "",
        entityIds: [],
        status: "open",
      },
    ]);
    expect(record.droppedThreadEntryIds).toEqual(["le-old"]);
  });

  it("reads a Thread's wish, and defaults a record without one to empty", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [
          { id: "a", title: "A", state: "s", entityIds: [] },
          { id: "b", title: "B", state: "s", wish: "W", entityIds: [] },
        ],
      },
    });
    const { threads } = (await loadWorldRecord()).world;
    expect(threads.map((t) => t.wish)).toEqual(["", "W"]);
  });

  it("reads an unknown status as open", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [
          {
            id: "t",
            title: "T",
            state: "s",
            latent: "l",
            entityIds: [],
            status: "satisfied",
          },
        ],
      },
    });
    expect((await loadWorldRecord()).world.threads[0].status).toBe("open");
  });

  it("seeds the fields a record does not carry", async () => {
    // story.ts fills `initialStoryState.fields` at module load with every
    // non-list field. A record missing one must not leave `story.fields.attg`
    // undefined for the UI to trip over.
    story.set(STORAGE_KEYS.WORLD, { world: { entityIds: [] } });
    const out = await loadWorldRecord();
    expect(Object.keys(initialStoryState.fields).length).toBeGreaterThan(0);
    expect(out.story.fields).toEqual(initialStoryState.fields);
  });
});
