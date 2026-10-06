import { createSlice } from "nai-store";
import { WorldState, ThreadDraft, ThreadStatus, WorldEntity } from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";

/** Threads are created because something is unresolved; nothing creates a
 *  concluded one. */
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
    // Defaults land here rather than at the callsites, so the World's "+", the
    // Forge's [THREAD] and the Engine's admission cannot disagree about them.
    // The thread limit is NOT enforced here: it restrains the Engine's
    // admissions only, and is checked where those are decided
    // (`applyFloors` in engine/review-strategy.ts, and again in the drain).
    threadCreated: (state, payload: { thread: ThreadDraft }) => ({
      ...state,
      threads: [
        ...state.threads,
        {
          ...payload.thread,
          latent: payload.thread.latent ?? "",
          status: payload.thread.status ?? DEFAULT_THREAD_STATUS,
        },
      ],
    }),

    // `lorebookEntryId` rides on the payload because the effect cannot get it
    // any other way: effects run AFTER the reducer, so by then the thread is
    // gone and with it the only record of which entry it owned. Left behind,
    // that entry is an always-on note nothing will ever name again on any
    // branch — §4.5's orphan, arriving through the writer's own delete button.
    // `string | undefined` rather than optional, so a caller has to answer:
    // a hand-made thread genuinely has no entry, and the two cases must not be
    // told apart by whether someone remembered to pass the field.
    threadDeleted: (
      state,
      payload: { threadId: string; lorebookEntryId: string | undefined },
    ) => ({
      ...state,
      threads: state.threads.filter((t) => t.id !== payload.threadId),
    }),

    // `thread-bind.ts` subscribes to every thread action below and re-syncs the entry.
    threadRenamed: (state, payload: { threadId: string; title: string }) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId ? { ...t, title: payload.title } : t,
      ),
    }),

    /** Both halves of the ledger in one action, because they are written
     *  together: the Thread write call returns them as a pair, and the pane
     *  saves them as a pair. `thread-bind.ts` subscribes to this and mirrors
     *  `state` — never `latent` — into the Thread's lorebook entry. */
    threadLedgerUpdated: (
      state,
      payload: { threadId: string; state: string; latent: string },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId
          ? { ...t, state: payload.state, latent: payload.latent }
          : t,
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

    /** A setter, so a second delivery of the same intent writes the same value
     *  (idempotent). `thread-bind.ts` applies it to the entry's `enabled` flag. */
    threadStatusSet: (
      state,
      payload: { threadId: string; status: ThreadStatus },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId ? { ...t, status: payload.status } : t,
      ),
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
  threadLedgerUpdated,
  threadMemberToggled,
  threadStatusSet,
  threadLorebookEntrySet,
} = worldSlice.actions;
