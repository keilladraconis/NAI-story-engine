// State ⇄ records for branch-scoped persistence.
//
// One record per independently-mutating thing, because historyStorage is
// copy-on-write per key per node: a single blob would snapshot the whole World
// onto every node that gets a write.
//
// `index` is authoritative for EXISTENCE. historyStorage.get() falls through to
// the nearest ancestor, so removing `e:<id>` at the current node would not
// delete the entity — it would uncover the parent branch's copy. Deletion is
// therefore an index write, and a record the index does not name is simply
// never read. The orphaned record is harmless; it is unreachable from any
// branch that does not name it.
//
// Foundation is deliberately NOT here. It is the story's premise rather than a
// property of a point in it, and its ATTG/Style mirror into Memory and Author's
// Note, which are story-global — branch-scoping it made undo revert what the
// writer saw while Memory kept what the model actually read. It lives in
// storyStorage under STORAGE_KEYS.FOUNDATION, next to chat.
//
// The Engine loop's own records — `watermark` and `queue` — are branch-scoped
// too and share this node space, but they are not store slices: the engine
// effect reads and writes them directly through history-store, so they appear
// in neither toRecords nor applyRecords. See src/core/engine/intents.ts.
//
// Pure by construction: no api.v1 calls, no promises, no store access.

import type {
  RootState,
  StoryState,
  WorldState,
  WorldEntity,
  WorldGroup,
  StoryField,
} from "../types";
import { initialStoryState } from "../slices/story";
import { initialWorldState } from "../slices/world";

export type PersistIndex = {
  entityIds: string[];
  groupIds: string[];
  fieldIds: string[];
};

export type PersistRecords = Record<string, unknown>;

export const INDEX_KEY = "index";

// Entity ids, group ids and field ids share one flat keyspace, and the first
// two are UUIDs — the prefix is what keeps them apart.
export const entityKey = (id: string): string => `e:${id}`;
export const groupKey = (id: string): string => `t:${id}`;
export const fieldKey = (id: string): string => `f:${id}`;

export function buildIndex(state: RootState): PersistIndex {
  return {
    entityIds: [...state.world.entityIds],
    groupIds: state.world.groups.map((g) => g.id),
    fieldIds: Object.keys(state.story.fields),
  };
}

export function toRecords(state: RootState): PersistRecords {
  const records: PersistRecords = {
    [INDEX_KEY]: buildIndex(state),
  };
  for (const id of state.world.entityIds) {
    const entity = state.world.entitiesById[id];
    if (entity) records[entityKey(id)] = entity;
  }
  for (const group of state.world.groups) {
    records[groupKey(group.id)] = group;
  }
  for (const [id, field] of Object.entries(state.story.fields)) {
    records[fieldKey(id)] = field;
  }
  return records;
}

export function applyRecords(
  index: PersistIndex | undefined,
  records: PersistRecords,
): { story: StoryState; world: WorldState } {
  if (!index) {
    return { story: initialStoryState, world: initialWorldState };
  }

  const entitiesById: Record<string, WorldEntity> = {};
  const entityIds: string[] = [];
  for (const id of index.entityIds) {
    const record = records[entityKey(id)] as WorldEntity | undefined;
    // An id the index names but whose record never landed: skip it rather than
    // seed a hole the UI would have to defend against.
    if (!record) continue;
    entitiesById[id] = record;
    entityIds.push(id);
  }

  const groups: WorldGroup[] = [];
  for (const id of index.groupIds) {
    const record = records[groupKey(id)] as WorldGroup | undefined;
    if (record) groups.push(record);
  }

  const fields: Record<string, StoryField> = {};
  for (const id of index.fieldIds) {
    const record = records[fieldKey(id)] as StoryField | undefined;
    if (record) fields[id] = record;
  }

  return {
    story: {
      ...initialStoryState,
      // Merge over the seeded skeleton rather than replacing it. story.ts fills
      // initialStoryState.fields at module load with every non-list field
      // (brainstorm, attg, style); a record missing for one of those must not
      // leave `story.fields.attg` undefined for the UI to trip over.
      fields: { ...initialStoryState.fields, ...fields },
    },
    world: { ...initialWorldState, entitiesById, entityIds, groups },
  };
}
