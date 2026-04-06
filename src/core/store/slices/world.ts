import { createSlice } from "nai-store";
import {
  WorldState,
  WorldBatch,
  WorldEntity,
  Relationship,
  EntityLifecycle,
} from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";

export const initialWorldState: WorldState = {
  batches: [],
  entities: [],
  relationships: [],
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
      relationships: state.relationships.filter(
        (r) =>
          r.fromEntityId !== payload.entityId &&
          r.toEntityId !== payload.entityId,
      ),
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

    // Batch management
    batchCreated: (state, payload: { batch: WorldBatch }) => ({
      ...state,
      batches: [...state.batches, payload.batch],
    }),

    batchRenamed: (state, payload: { batchId: string; name: string }) => ({
      ...state,
      batches: state.batches.map((b) =>
        b.id === payload.batchId ? { ...b, name: payload.name } : b,
      ),
    }),

    batchReforged: (state, payload: { batchId: string }) => ({
      ...state,
      entities: state.entities.map((e) =>
        e.batchId === payload.batchId
          ? {
              ...e,
              lifecycle: "draft" as EntityLifecycle,
              lorebookEntryId: undefined,
            }
          : e,
      ),
    }),

    // Relationship management
    relationshipAdded: (state, payload: { relationship: Relationship }) => ({
      ...state,
      relationships: [...state.relationships, payload.relationship],
    }),

    relationshipRemoved: (state, payload: { relationshipId: string }) => ({
      ...state,
      relationships: state.relationships.filter(
        (r) => r.id !== payload.relationshipId,
      ),
    }),

    relationshipUpdated: (
      state,
      payload: { relationshipId: string; description: string },
    ) => ({
      ...state,
      relationships: state.relationships.map((r) =>
        r.id === payload.relationshipId
          ? { ...r, description: payload.description }
          : r,
      ),
    }),

    worldCleared: () => initialWorldState,

    forgeLoopStarted: (state) => ({ ...state, forgeLoopActive: true }),
    forgeLoopEnded: (state) => ({ ...state, forgeLoopActive: false }),

    forgeStepCompleted: (
      state,
      _payload: {
        batchId: string;
        step: number;
        forgeGuidance: string;
        brainstormContext: string;
      },
    ) => state,
    forgeCritiqueReceived: (
      state,
      _payload: { batchId: string; critiqueText: string },
    ) => state,

    // Signal actions — Phase 2 effects handle the actual work
    forgeClearRequested: (state) => state,
    forgeRequested: (state) => state,
    forgeFromBrainstormRequested: (state) => state,
    castAllRequested: (state) => state,
    forgeCastCompleted: (state) => state,
    entityRegenRequested: (state, _payload: { entityId: string }) => state,
    entityReforgeRequested: (state, _payload: { entityId: string }) => state,
    batchReforgeRequested: (state, _payload: { batchId: string }) => state,

    // Immediate state reducers (Phase 2 adds lorebook-side effects for these)
    entityCastRequested: (state, _payload: { entityId: string }) => state,

    entityMoved: (
      state,
      payload: { entityId: string; targetBatchId: string },
    ) => ({
      ...state,
      entities: state.entities.map((e) =>
        e.id === payload.entityId
          ? { ...e, batchId: payload.targetBatchId }
          : e,
      ),
    }),

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
  batchCreated,
  batchRenamed,
  batchReforged,
  relationshipAdded,
  relationshipRemoved,
  relationshipUpdated,
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
  entityReforgeRequested,
  batchReforgeRequested,
  entityMoved,
  entityCastRequested,
  entityDiscardRequested,
  discardAllRequested,
} = worldSlice.actions;
