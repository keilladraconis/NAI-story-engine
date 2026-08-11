import { createSlice } from "nai-store";
import { WorldState, WorldGroup, WorldEntity } from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";

export const initialWorldState: WorldState = {
  groups: [],
  entitiesById: {},
  entityIds: [],
};

/** The set of lorebook entry ids some entity already binds.
 *
 *  A lorebook entry belongs to at most one entity — two entities over the same
 *  entry would generate into it twice and show it twice in the World. The bind
 *  actions are the only way to break that (Cast and the Forge attach an entry to
 *  an entity that exists), and the Import wizard can fire one twice from a single
 *  mobile tap, so both bind reducers drop entries that are already spoken for. */
function boundEntryIds(state: WorldState): Set<string> {
  const ids = new Set<string>();
  for (const id of state.entityIds) {
    const entryId = state.entitiesById[id]?.lorebookEntryId;
    if (entryId) ids.add(entryId);
  }
  return ids;
}

export const worldSlice = createSlice({
  name: "world",
  initialState: initialWorldState,
  reducers: {
    entityForged: (state, payload: { entity: WorldEntity }) => ({
      ...state,
      entitiesById: {
        ...state.entitiesById,
        [payload.entity.id]: payload.entity,
      },
      entityIds: [...state.entityIds, payload.entity.id],
    }),

    entityDeleted: (state, payload: { entityId: string }) => {
      const { [payload.entityId]: _, ...rest } = state.entitiesById;
      return {
        ...state,
        entitiesById: rest,
        entityIds: state.entityIds.filter((id) => id !== payload.entityId),
        groups: state.groups.map((g) => ({
          ...g,
          entityIds: g.entityIds.filter((id) => id !== payload.entityId),
        })),
      };
    },

    entitySummaryUpdated: (
      state,
      payload: {
        entityId: string;
        summary: string;
        lastAffectingMessageId?: string;
      },
    ) => {
      const entity = state.entitiesById[payload.entityId];
      if (!entity) return state;
      return {
        ...state,
        entitiesById: {
          ...state.entitiesById,
          [payload.entityId]: {
            ...entity,
            summary: payload.summary,
            ...(payload.lastAffectingMessageId !== undefined
              ? { lastAffectingMessageId: payload.lastAffectingMessageId }
              : {}),
          },
        },
      };
    },

    entityEdited: (
      state,
      payload: { entityId: string; name: string; summary: string },
    ) => {
      const entity = state.entitiesById[payload.entityId];
      if (!entity) return state;
      return {
        ...state,
        entitiesById: {
          ...state.entitiesById,
          [payload.entityId]: {
            ...entity,
            name: payload.name,
            summary: payload.summary,
          },
        },
      };
    },

    entityCategoryChanged: (
      state,
      payload: { entityId: string; categoryId: DulfsFieldID },
    ) => {
      const entity = state.entitiesById[payload.entityId];
      if (!entity) return state;
      return {
        ...state,
        entitiesById: {
          ...state.entitiesById,
          [payload.entityId]: { ...entity, categoryId: payload.categoryId },
        },
      };
    },

    // Attach a freshly-created lorebook entry to an existing draft entity,
    // promoting it to "live" without touching other fields. Setting
    // lifecycle here means every caller (Cast, SeEntityEditPane Save,
    // Generate Content/Keys) gets correct draft→live promotion without
    // having to dispatch a second action.
    entityLorebookEntryBound: (
      state,
      payload: { entityId: string; lorebookEntryId: string },
    ) => {
      const entity = state.entitiesById[payload.entityId];
      if (!entity) return state;
      return {
        ...state,
        entitiesById: {
          ...state.entitiesById,
          [payload.entityId]: {
            ...entity,
            lorebookEntryId: payload.lorebookEntryId,
            lifecycle: "live",
          },
        },
      };
    },

    // Bind/Unbind (adopt existing lorebook entries)
    entityBound: (state, payload: { entity: WorldEntity }) => {
      const { lorebookEntryId } = payload.entity;
      if (lorebookEntryId && boundEntryIds(state).has(lorebookEntryId)) {
        return state;
      }
      return {
        ...state,
        entitiesById: {
          ...state.entitiesById,
          [payload.entity.id]: payload.entity,
        },
        entityIds: [...state.entityIds, payload.entity.id],
      };
    },

    // Batch bind: single dispatch for N entities — prevents N concurrent _rebuildBody() races
    entitiesBoundBatch: (state, payload: WorldEntity[]) => {
      const taken = boundEntryIds(state);
      const newById: Record<string, WorldEntity> = {};
      const newIds: string[] = [];
      for (const entity of payload) {
        // Also guards a batch that repeats an entry within itself.
        if (entity.lorebookEntryId) {
          if (taken.has(entity.lorebookEntryId)) continue;
          taken.add(entity.lorebookEntryId);
        }
        newById[entity.id] = entity;
        newIds.push(entity.id);
      }
      return {
        ...state,
        entitiesById: { ...state.entitiesById, ...newById },
        entityIds: [...state.entityIds, ...newIds],
      };
    },

    entityUnbound: (state, payload: { entityId: string }) => {
      const { [payload.entityId]: _, ...rest } = state.entitiesById;
      return {
        ...state,
        entitiesById: rest,
        entityIds: state.entityIds.filter((id) => id !== payload.entityId),
      };
    },

    // Group (Thread) management
    groupCreated: (state, payload: { group: WorldGroup }) => ({
      ...state,
      groups: [...state.groups, payload.group],
    }),

    groupDeleted: (state, payload: { groupId: string }) => ({
      ...state,
      groups: state.groups.filter((g) => g.id !== payload.groupId),
    }),

    groupRenamed: (state, payload: { groupId: string; title: string }) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === payload.groupId ? { ...g, title: payload.title } : g,
      ),
    }),

    groupSummaryUpdated: (
      state,
      payload: { groupId: string; summary: string },
    ) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === payload.groupId ? { ...g, summary: payload.summary } : g,
      ),
    }),

    entityGroupToggled: (
      state,
      payload: { groupId: string; entityId: string },
    ) => ({
      ...state,
      groups: state.groups.map((g) => {
        if (g.id !== payload.groupId) return g;
        const isMember = g.entityIds.includes(payload.entityId);
        return {
          ...g,
          entityIds: isMember
            ? g.entityIds.filter((id) => id !== payload.entityId)
            : [...g.entityIds, payload.entityId],
        };
      }),
    }),

    groupLorebookEntrySet: (
      state,
      payload: { groupId: string; entryId: string | undefined },
    ) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === payload.groupId
          ? { ...g, lorebookEntryId: payload.entryId }
          : g,
      ),
    }),

    worldCleared: () => initialWorldState,
  },
});

export const {
  worldCleared,
  entityForged,
  entityDeleted,
  entitySummaryUpdated,
  entityEdited,
  entityCategoryChanged,
  entityLorebookEntryBound,
  entityBound,
  entitiesBoundBatch,
  entityUnbound,
  groupCreated,
  groupDeleted,
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
  groupLorebookEntrySet,
} = worldSlice.actions;
