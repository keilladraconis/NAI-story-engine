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
import {
  DEFAULT_THREAD_ANCHOR,
  DEFAULT_THREAD_HORIZON,
  DEFAULT_THREAD_STATUS,
  initialWorldState,
} from "../../src/core/store/slices/world";
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
          text: "unsettled",
          horizon: "plot",
          status: "open",
          entityIds: ["e1"],
          anchorParagraph: 7,
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

  it("defaults a thread written before horizon and status existed", async () => {
    // `statusOption(undefined).help` and `horizonOption(undefined).help` throw
    // on `undefined.help`, in the World list and in the edit pane — so a record
    // from an earlier build would reach the UI and take it down.
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [{ id: "g1", title: "The Guild", text: "", entityIds: [] }],
      },
    });
    expect((await loadWorldRecord()).world.threads).toEqual([
      {
        id: "g1",
        title: "The Guild",
        text: "",
        entityIds: [],
        horizon: DEFAULT_THREAD_HORIZON,
        status: DEFAULT_THREAD_STATUS,
        anchorParagraph: DEFAULT_THREAD_ANCHOR,
      },
    ]);
  });

  it("keeps an anchor of zero, which is a real anchor", async () => {
    // A thread opened in the story's first paragraph. A `||` here would read it
    // as missing and hand expiry a thread that has in fact been touched.
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [
          {
            id: "g1",
            title: "The Guild",
            text: "",
            entityIds: [],
            horizon: "arc",
            status: "open",
            anchorParagraph: 0,
          },
        ],
      },
    });
    expect((await loadWorldRecord()).world.threads[0].anchorParagraph).toBe(0);
  });

  it("keeps what a thread record does carry", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [
          {
            id: "g1",
            title: "The Guild",
            text: "",
            entityIds: [],
            horizon: "arc",
            status: "satisfied",
          },
        ],
      },
    });
    const thread = (await loadWorldRecord()).world.threads[0];
    expect(thread.horizon).toBe("arc");
    expect(thread.status).toBe("satisfied");
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
