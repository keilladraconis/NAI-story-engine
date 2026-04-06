import { createSlice } from "nai-store";
import { WorldState, WorldGroup, WorldEntity, EntityLifecycle } from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";

export const initialWorldState: WorldState = {
  groups: [],
  entities: [],
  forgeLoopActive: false,
};

export const worldSlice = createSlice({
  name: "world",
  initialState: initialWorldState,
  reducers: {
    // Entity lifecycle
    entityForged: (state, payload: { entity: WorldEntity }) => ({
      ...state,
      entities: [...state.entities, payload.entity],
    }),

    entityCast: (
      state,
      payload: { entityId: string; lorebookEntryId: string },
    ) => ({
      ...state,
      entities: state.entities.map((e) =>
        e.id === payload.entityId
          ? {
              ...e,
              lifecycle: "live" as EntityLifecycle,
              lorebookEntryId: payload.lorebookEntryId,
            }
          : e,
      ),
    }),

    entityReforged: (state, payload: { entityId: string }) => ({
      ...state,
      entities: state.entities.map((e) =>
        e.id === payload.entityId
          ? {
              ...e,
              lifecycle: "draft" as EntityLifecycle,
              lorebookEntryId: undefined,
            }
          : e,
      ),
    }),

    entityDeleted: (state, payload: { entityId: string }) => ({
      ...state,
      entities: state.entities.filter((e) => e.id !== payload.entityId),
      groups: state.groups.map((g) => ({
        ...g,
        entityIds: g.entityIds.filter((id) => id !== payload.entityId),
      })),
    }),

    entitySummaryUpdated: (
      state,
      payload: { entityId: string; summary: string },
    ) => ({
      ...state,
      entities: state.entities.map((e) =>
        e.id === payload.entityId ? { ...e, summary: payload.summary } : e,
      ),
    }),

    entityEdited: (
      state,
      payload: { entityId: string; name: string; summary: string },
    ) => ({
      ...state,
      entities: state.entities.map((e) =>
        e.id === payload.entityId
          ? { ...e, name: payload.name, summary: payload.summary }
          : e,
      ),
    }),

    entityCategoryChanged: (
      state,
      payload: { entityId: string; categoryId: DulfsFieldID },
    ) => ({
      ...state,
      entities: state.entities.map((e) =>
        e.id === payload.entityId
          ? { ...e, categoryId: payload.categoryId }
          : e,
      ),
    }),

    // Bind/Unbind (adopt existing lorebook entries)
    entityBound: (state, payload: { entity: WorldEntity }) => ({
      ...state,
      entities: [...state.entities, payload.entity],
    }),

    entityUnbound: (state, payload: { entityId: string }) => ({
      ...state,
      entities: state.entities.filter((e) => e.id !== payload.entityId),
    }),

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
      const memberSet = new Set(group.entityIds);
      return {
        ...state,
        entities: state.entities.map((e) =>
          memberSet.has(e.id)
            ? {
                ...e,
                lifecycle: "draft" as EntityLifecycle,
                lorebookEntryId: undefined,
              }
            : e,
        ),
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

    entityDiscardRequested: (state, payload: { entityId: string }) => ({
      ...state,
      entities: state.entities.filter((e) => e.id !== payload.entityId),
    }),

    discardAllRequested: (state) => ({
      ...state,
      entities: state.entities.filter((e) => e.lifecycle !== "draft"),
    }),
  },
});

export const {
  worldCleared,
  entityForged,
  entityCast,
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
