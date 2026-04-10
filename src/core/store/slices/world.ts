import { createSlice } from "nai-store";
import { WorldState, WorldGroup, WorldEntity } from "../types";
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
    entityForged: (state, payload: { entity: WorldEntity }) => ({
      ...state,
      entitiesById: {
        ...state.entitiesById,
        [payload.entity.id]: payload.entity,
      },
      entityIds: [...state.entityIds, payload.entity.id],
    }),

    entityDeleted: (state, payload: { entityId: string; lorebookEntryId?: string }) => {
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

    // Batch bind: single dispatch for N entities — prevents N concurrent _rebuildBody() races
    entitiesBoundBatch: (state, payload: WorldEntity[]) => {
      const newById: Record<string, WorldEntity> = {};
      const newIds: string[] = [];
      for (const entity of payload) {
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

    forgeLoopStarted: (state) => ({ ...state, forgeLoopActive: true }),
    forgeLoopEnded: (state) => ({ ...state, forgeLoopActive: false }),

    forgeStepCompleted: (
      state,
      _payload: {
        step: number;
        forgeGuidance: string;
        brainstormContext: string;
        preForgeEntityIds: string[];
      },
    ) => state,
    forgeCritiqueReceived: (
      state,
      _payload: { critiqueText: string },
    ) => state,

    // Signal actions — effects handle the actual work
    forgeClearRequested: (state) => state,
    forgeRequested: (state) => state,
    forgeFromBrainstormRequested: (state) => state,
    entityRegenRequested: (state, _payload: { entityId: string }) => state,
  },
});

export const {
  worldCleared,
  entityForged,
  entityDeleted,
  entitySummaryUpdated,
  entityEdited,
  entityCategoryChanged,
  entityBound,
  entitiesBoundBatch,
  entityUnbound,
  groupCreated,
  groupDeleted,
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
  groupLorebookEntrySet,
  forgeLoopStarted,
  forgeLoopEnded,
  forgeStepCompleted,
  forgeCritiqueReceived,
  forgeClearRequested,
  forgeRequested,
  forgeFromBrainstormRequested,
  entityRegenRequested,
} = worldSlice.actions;
