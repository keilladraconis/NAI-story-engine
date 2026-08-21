import { createSlice } from "nai-store";
import {
  WorldState,
  ThreadDraft,
  ThreadHorizon,
  ThreadStatus,
  WorldEntity,
} from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";

/** A thread created without an explicit horizon is a plot thread: the middle
 *  rung, and the one a commitment noticed mid-story almost always is. Guessing
 *  "arc" would over-hold context for a passing promise; guessing "point" would
 *  let a real subplot decay out of reach. */
export const DEFAULT_THREAD_HORIZON: ThreadHorizon = "plot";

/** Threads are created because something is unresolved; nothing creates a
 *  satisfied one. */
export const DEFAULT_THREAD_STATUS: ThreadStatus = "open";

export const initialWorldState: WorldState = {
  threads: [],
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
        threads: state.threads.map((t) => ({
          ...t,
          entityIds: t.entityIds.filter((id) => id !== payload.entityId),
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

    // Thread management
    //
    // Defaults land here rather than at the callsites. `horizon` and `status`
    // are new in phase 5 and every existing creator (the Forge's [THREAD]
    // command, the World's "+ New Thread") predates them; defaulting in the
    // reducer means none of them can ship a thread with the fields missing,
    // and a future creator gets the same treatment for free. Tasks 2 and 3
    // both branch on `horizon`, so a silently-undefined one is the failure
    // mode worth spending an invariant on.
    //
    // **The thread cap is enforced on this action, one level up.** It is a
    // reducer invariant like one-entity-per-lorebook-entry above, but the cap
    // is an Engine setting mirrored into the engine slice, and a slice reducer
    // cannot read another slice — so `rootReducer` (store/index.ts) runs the
    // append through `enforceThreadCap` and may drop the weakest thread to
    // make room. Nothing that dispatches this can opt out; see
    // `src/core/engine/thread-cap.ts` for which thread gives way and why.
    threadCreated: (state, payload: { thread: ThreadDraft }) => ({
      ...state,
      threads: [
        ...state.threads,
        {
          ...payload.thread,
          horizon: payload.thread.horizon ?? DEFAULT_THREAD_HORIZON,
          status: payload.thread.status ?? DEFAULT_THREAD_STATUS,
        },
      ],
    }),

    threadDeleted: (state, payload: { threadId: string }) => ({
      ...state,
      threads: state.threads.filter((t) => t.id !== payload.threadId),
    }),

    threadRenamed: (state, payload: { threadId: string; title: string }) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId ? { ...t, title: payload.title } : t,
      ),
    }),

    threadTextUpdated: (
      state,
      payload: { threadId: string; text: string },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId ? { ...t, text: payload.text } : t,
      ),
    }),

    threadMemberToggled: (
      state,
      payload: { threadId: string; entityId: string },
    ) => ({
      ...state,
      threads: state.threads.map((t) => {
        if (t.id !== payload.threadId) return t;
        const isMember = t.entityIds.includes(payload.entityId);
        return {
          ...t,
          entityIds: isMember
            ? t.entityIds.filter((id) => id !== payload.entityId)
            : [...t.entityIds, payload.entityId],
        };
      }),
    }),

    threadLorebookEntrySet: (
      state,
      payload: { threadId: string; entryId: string | undefined },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId
          ? { ...t, lorebookEntryId: payload.entryId }
          : t,
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
  threadCreated,
  threadDeleted,
  threadRenamed,
  threadTextUpdated,
  threadMemberToggled,
  threadLorebookEntrySet,
} = worldSlice.actions;
