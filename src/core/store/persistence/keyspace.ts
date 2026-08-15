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
// Pure by construction: no api.v1 calls, no promises, no store access.

import type {
  RootState,
  StoryState,
  WorldState,
  WorldEntity,
  WorldGroup,
  StoryField,
  FoundationState,
} from "../types";
import { initialStoryState } from "../slices/story";
import { initialWorldState } from "../slices/world";
import { initialFoundationState } from "../slices/foundation";

export type PersistIndex = {
  entityIds: string[];
  groupIds: string[];
  fieldIds: string[];
};

export type PersistRecords = Record<string, unknown>;

export const INDEX_KEY = "index";
export const FOUNDATION_KEY = "foundation";
export const STORY_FLAGS_KEY = "story-flags";

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
    [FOUNDATION_KEY]: state.foundation,
    [STORY_FLAGS_KEY]: {
      attgEnabled: state.story.attgEnabled,
      styleEnabled: state.story.styleEnabled,
    },
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
): { story: StoryState; world: WorldState; foundation: FoundationState } {
  if (!index) {
    return {
      story: initialStoryState,
      world: initialWorldState,
      foundation: initialFoundationState,
    };
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

  const flags = (records[STORY_FLAGS_KEY] ?? {}) as Partial<StoryState>;
  const foundation = records[FOUNDATION_KEY] as FoundationState | undefined;

  return {
    story: {
      ...initialStoryState,
      // Merge over the seeded skeleton rather than replacing it. story.ts fills
      // initialStoryState.fields at module load with every non-list field
      // (brainstorm, attg, style); a record missing for one of those must not
      // leave `story.fields.attg` undefined for the UI to trip over.
      fields: { ...initialStoryState.fields, ...fields },
      attgEnabled: flags.attgEnabled ?? initialStoryState.attgEnabled,
      styleEnabled: flags.styleEnabled ?? initialStoryState.styleEnabled,
    },
    world: { ...initialWorldState, entitiesById, entityIds, groups },
    foundation: foundation
      ? { ...initialFoundationState, ...foundation }
      : initialFoundationState,
  };
}
