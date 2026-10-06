// The World and the story fields, as one storyStorage record.
//
// Story Engine's records move forward. They are the writer's notebook about the
// story rather than a projection of the document, so nothing here is scoped to a
// point in history and nothing here reverts when the writer undoes.
//
// ONE record, not one per entity/thread/field. The whole World changes as one
// thing — a save writes what the store holds, a load hands it back — so there is
// nothing a shard would buy, and no index deciding what exists: what the newest
// write does not carry is gone, which is all deletion has to mean.
//
// Persisted JSON is still hydrated rather than trusted. The record is whatever
// some build of Story Engine wrote, and this is the one path by which a `Thread`
// enters the store without passing through `threadCreated`'s defaults — a thread
// reaching the World list without a `latent` or a `status` takes the pane down
// with it. Hydration drops and defaults; it never converts (alpha, §10).

import type {
  RootState,
  StoryField,
  StoryState,
  Thread,
  WorldEntity,
  WorldState,
} from "../types";
import { STORAGE_KEYS } from "../../keys";
import { initialStoryState } from "../slices/story";
import { DEFAULT_THREAD_STATUS, initialWorldState } from "../slices/world";

/** What the record holds: the two slices derived from what the writer and the
 *  Engine have put in the notebook. `chat` and `foundation` are storyStorage
 *  records of their own — they were never part of this one. */
export type WorldRecord = {
  story: StoryState;
  world: WorldState;
  /** Lorebook entry ids owned by Threads dropped on load, for the caller to
   *  switch off. Not persisted: it describes this load, not the record. */
  droppedThreadEntryIds: string[];
};

/** A record as it may actually be on disk: every field optional, every field of
 *  unknown type. `storyStorage.get` is typed `any`, so the shape is named at the
 *  boundary rather than let loose into `PersistedData`. */
type StoredWorldRecord = {
  story?: { fields?: Record<string, StoryField> };
  world?: {
    threads?: Partial<Thread>[];
    entitiesById?: Record<string, WorldEntity>;
    entityIds?: string[];
  };
};

function hydrate(value: unknown): WorldRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      story: initialStoryState,
      world: initialWorldState,
      droppedThreadEntryIds: [],
    };
  }
  const record = value as StoredWorldRecord;

  // `entityIds` is the order the World list renders in and the authority on
  // what exists; `entitiesById` is looked up through it. Rebuilding the map
  // from the filtered ids keeps the two from disagreeing, so an id with no
  // entity behind it is dropped rather than left as a hole the UI has to
  // defend against.
  const stored = record.world?.entitiesById ?? {};
  const entityIds = (record.world?.entityIds ?? []).filter(
    (id) => stored[id] !== undefined,
  );
  const entitiesById: Record<string, WorldEntity> = {};
  for (const id of entityIds) entitiesById[id] = stored[id];

  // A Thread without a `state` string was written before 0.16, when a Thread
  // was a commitment with a reminder. Those are the flood this model replaces,
  // so they are dropped rather than converted — and the ids of the lorebook
  // entries they owned are handed back, because an entry nothing manages any
  // more would otherwise go on injecting.
  const threads: Thread[] = [];
  const droppedThreadEntryIds: string[] = [];
  for (const stored of record.world?.threads ?? []) {
    if (typeof stored.state !== "string") {
      if (stored.lorebookEntryId) {
        droppedThreadEntryIds.push(stored.lorebookEntryId);
      }
      continue;
    }
    threads.push({
      ...(stored as Thread),
      latent: typeof stored.latent === "string" ? stored.latent : "",
      entityIds: stored.entityIds ?? [],
      status:
        stored.status === "concluded" ? "concluded" : DEFAULT_THREAD_STATUS,
    });
  }

  return {
    story: {
      ...initialStoryState,
      // Merge over the seeded skeleton rather than replacing it. story.ts fills
      // initialStoryState.fields at module load with every non-list field
      // (brainstorm, attg, style); a record missing one of those must not leave
      // `story.fields.attg` undefined for the UI to trip over.
      fields: { ...initialStoryState.fields, ...(record.story?.fields ?? {}) },
    },
    world: { ...initialWorldState, entitiesById, entityIds, threads },
    droppedThreadEntryIds,
  };
}

export async function saveWorldRecord(state: RootState): Promise<void> {
  await api.v1.storyStorage.set(STORAGE_KEYS.WORLD, {
    story: state.story,
    world: state.world,
  } satisfies Omit<WorldRecord, "droppedThreadEntryIds">);
}

/** The World as this story last left it, or a pristine one for a story that has
 *  never run Story Engine.
 *
 *  Never throws. It is awaited inside `Promise.all` in mount.ts, reached from a
 *  bare `void start()` — a rejection here would reject unobserved and nothing
 *  would mount at all: no sidebar, no HUD, and no error a writer can see. */
export async function loadWorldRecord(): Promise<WorldRecord> {
  return hydrate(await api.v1.storyStorage.get(STORAGE_KEYS.WORLD));
}
