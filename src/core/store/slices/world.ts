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

/** A thread nobody anchored (§4.5). `null`, never 0: expiry reads the anchor as
 *  "the paragraph the story last touched this", so a zero would say a thread
 *  created in chapter nine has been abandoned since chapter one — and expiry is
 *  a destructive verdict. Only the Engine anchors, because only the Engine
 *  knows the paragraph count it is acting at; the World's "+ New Thread" and
 *  the Forge's [THREAD] both dispatch synchronously, where that count is not
 *  available and guessing it would be worse than admitting it. */
export const DEFAULT_THREAD_ANCHOR: number | null = null;

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
          anchorParagraph:
            payload.thread.anchorParagraph ?? DEFAULT_THREAD_ANCHOR,
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

    // `threadRenamed`, `threadMemberToggled`, `threadHorizonSet` and
    // `threadAnchorSet` are the four actions a thread's condition is built
    // from: `buildThreadCondition` (src/core/engine/thread-condition.ts) reads
    // `title` for its fallback probe, the members' names for the real one,
    // `horizon` for the range, and `anchorParagraph` for §4.3's pacing gate.
    // `registerThreadConditionEffects` (src/core/engine/thread-bind.ts)
    // subscribes to exactly these four and rewrites the entry's condition,
    // because a renamed thread whose detector was not rebuilt goes on probing
    // for a name the prose no longer uses and fires forever. A fifth action
    // that changed any of the four would have to be added there too.
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

    /** The horizon is a *set*, never a cycle: the pane sends the horizon its
     *  button means, so a second press of the same button is the same value
     *  rather than a step on to the next one. That is what "design intents to
     *  be idempotent" buys where a debounce is forbidden. */
    threadHorizonSet: (
      state,
      payload: { threadId: string; horizon: ThreadHorizon },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId ? { ...t, horizon: payload.horizon } : t,
      ),
    }),

    /** Satisfaction is a flag, and flipping it is all this does. §4.4's
     *  retirement — disabling the thread's lorebook entry — is the drain's
     *  (`execute.ts`), which flips this flag second so a failure between the
     *  two leaves the thread open and the work re-proposed rather than settled
     *  with its reminder still in context. The flag is also what the writer
     *  sets by hand, what the World list reads, and what the cap spends first
     *  (`displacementOrder`). A setter for the same reason as the horizon
     *  above: a toggle would make two presses mean nothing. */
    threadStatusSet: (
      state,
      payload: { threadId: string; status: ThreadStatus },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId ? { ...t, status: payload.status } : t,
      ),
    }),

    /** The renewal half of §4.5's anchor: the paragraph the Engine last opened
     *  or renewed this thread at.
     *
     *  A setter for the same reason the horizon and the status are — the
     *  payload carries the paragraph, so a second delivery of the same intent
     *  writes the same number rather than advancing it (CLAUDE.md: design
     *  intents to be idempotent). Nothing clears an anchor: a thread that was
     *  once anchored has been touched, and unlearning that would only ever make
     *  expiry more eager. */
    threadAnchorSet: (
      state,
      payload: { threadId: string; paragraph: number },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId
          ? { ...t, anchorParagraph: payload.paragraph }
          : t,
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
  threadTextUpdated,
  threadMemberToggled,
  threadHorizonSet,
  threadStatusSet,
  threadAnchorSet,
  threadLorebookEntrySet,
} = worldSlice.actions;
