import { createSlice } from "nai-store";
import { WorldState, WorldGroup, WorldEntity, EntityLifecycle } from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";

export const initialWorldState: WorldState = {
  groups: [],
  entitiesById: {},
  entityIds: [],
  forgeLoopActive: false,
};

export const worldSlice = createSlice({
  name: "world",
  initialState: initialWorldState,
  reducers: {
    // Entity lifecycle
    entityForged: (state, payload: { entity: WorldEntity }) => ({
      ...state,
      entitiesById: {
        ...state.entitiesById,
        [payload.entity.id]: payload.entity,
      },
      entityIds: [...state.entityIds, payload.entity.id],
    }),

    entityCast: (
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
            lifecycle: "live" as EntityLifecycle,
            lorebookEntryId: payload.lorebookEntryId,
          },
        },
      };
    },

    // Batch cast: single dispatch for N entities
    entitiesCastBatch: (
      state,
      payload: Array<{ entityId: string; lorebookEntryId: string }>,
    ) => {
      const updates: Record<string, WorldEntity> = {};
      for (const { entityId, lorebookEntryId } of payload) {
        const entity = state.entitiesById[entityId];
        if (entity) {
          updates[entityId] = {
            ...entity,
            lifecycle: "live" as EntityLifecycle,
            lorebookEntryId,
          };
        }
      }
      return {
        ...state,
        entitiesById: { ...state.entitiesById, ...updates },
      };
    },

    entityReforged: (state, payload: { entityId: string }) => {
      const entity = state.entitiesById[payload.entityId];
      if (!entity) return state;
      return {
        ...state,
        entitiesById: {
          ...state.entitiesById,
          [payload.entityId]: {
            ...entity,
            lifecycle: "draft" as EntityLifecycle,
            lorebookEntryId: undefined,
          },
        },
      };
    },

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
      payload: { entityId: string; summary: string },
    ) => {
      const entity = state.entitiesById[payload.entityId];
      if (!entity) return state;
      return {
        ...state,
        entitiesById: {
          ...state.entitiesById,
          [payload.entityId]: { ...entity, summary: payload.summary },
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

    // Bind/Unbind (adopt existing lorebook entries)
    entityBound: (state, payload: { entity: WorldEntity }) => ({
      ...state,
      entitiesById: {
        ...state.entitiesById,
        [payload.entity.id]: payload.entity,
      },
      entityIds: [...state.entityIds, payload.entity.id],
    }),

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

    // Reforge all member entities in a group
    groupReforged: (state, payload: { groupId: string }) => {
      const group = state.groups.find((g) => g.id === payload.groupId);
      if (!group) return state;
      const updates: Record<string, WorldEntity> = {};
      for (const id of group.entityIds) {
        const entity = state.entitiesById[id];
        if (entity) {
          updates[id] = {
            ...entity,
            lifecycle: "draft" as EntityLifecycle,
            lorebookEntryId: undefined,
          };
        }
      }
      return {
        ...state,
        entitiesById: { ...state.entitiesById, ...updates },
      };
    },

    worldCleared: () => initialWorldState,

    forgeLoopStarted: (state) => ({ ...state, forgeLoopActive: true }),
    forgeLoopEnded: (state) => ({ ...state, forgeLoopActive: false }),

    forgeStepCompleted: (
      state,
      _payload: {
        step: number;
        forgeGuidance: string;
        brainstormContext: string;
      },
    ) => state,
    forgeCritiqueReceived: (
      state,
      _payload: { critiqueText: string },
    ) => state,

    // Signal actions — Phase 2 effects handle the actual work
    forgeClearRequested: (state) => state,
    forgeRequested: (state) => state,
    forgeFromBrainstormRequested: (state) => state,
    castAllRequested: (state) => state,
    forgeCastCompleted: (state) => state,
    entityRegenRequested: (state, _payload: { entityId: string }) => state,
    groupReforgeRequested: (state, _payload: { groupId: string }) => state,

    // Immediate state reducers (Phase 2 adds lorebook-side effects for these)
    entityCastRequested: (state, _payload: { entityId: string }) => state,

    entityDiscardRequested: (state, payload: { entityId: string }) => {
      const { [payload.entityId]: _, ...rest } = state.entitiesById;
      return {
        ...state,
        entitiesById: rest,
        entityIds: state.entityIds.filter((id) => id !== payload.entityId),
      };
    },

    discardAllRequested: (state) => {
      const kept: Record<string, WorldEntity> = {};
      const keptIds: string[] = [];
      for (const id of state.entityIds) {
        const e = state.entitiesById[id];
        if (e && e.lifecycle !== "draft") {
          kept[id] = e;
          keptIds.push(id);
        }
      }
      return {
        ...state,
        entitiesById: kept,
        entityIds: keptIds,
      };
    },
  },
});

export const {
  worldCleared,
  entityForged,
  entityCast,
  entitiesCastBatch,
  entityReforged,
  entityDeleted,
  entitySummaryUpdated,
  entityEdited,
  entityCategoryChanged,
  entityBound,
  entityUnbound,
  groupCreated,
  groupDeleted,
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
  groupLorebookEntrySet,
  groupReforged,
  forgeLoopStarted,
  forgeLoopEnded,
  forgeStepCompleted,
  forgeCritiqueReceived,
  forgeClearRequested,
  forgeRequested,
  forgeFromBrainstormRequested,
  castAllRequested,
  forgeCastCompleted,
  entityRegenRequested,
  groupReforgeRequested,
  entityCastRequested,
  entityDiscardRequested,
  discardAllRequested,
} = worldSlice.actions;
