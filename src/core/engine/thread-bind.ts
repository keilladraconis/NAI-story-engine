// Thread ⇄ lorebook entry: what a Thread's entry carries, who it watches for,
// and the one function that keeps it so.
//
// A Thread's entry carries `state` as its text and a cast-presence condition
// (`thread-condition.ts`), and is enabled exactly when the Thread is open and
// has a nameable cast. `syncThreadEntry` is the single function that brings an
// entry into step with its Thread, and every edit that can put the two out of
// step ends in it. A sync per kind of edit is how two of them come to disagree,
// and a stale entry is not a visible bug — it is a Thread that quietly speaks
// for a state that is no longer true.
//
// **This module creates entries; it never rewrites one by hand.** A create is
// the one lorebook call the door cannot stand in front of: it invents an entry,
// so there is no live text to read first. Every rewrite below goes through
// `lorebook-write.ts` like any other Engine edit. `execute.test.ts`'s source
// scan holds the line.

import { matchesAction, type Store } from "nai-store";
import type { RootState, Thread } from "../store/types";
import { buildThreadCondition, type ThreadMember } from "./thread-condition";
import { writeLorebookEntry } from "./lorebook-write";
import { nameKey } from "../store/effects/handlers/lorebook";
import { applyEratoPrefix } from "../utils/config";
import { resolveDisplayName, UNNAMED_ENTRY } from "../utils/lorebook-strategy";
import {
  ensureNamedCategory,
  SE_THREAD_CATEGORY,
} from "../store/effects/lorebook-sync";
import {
  entityDeleted,
  entityEdited,
  entityRestored,
  threadCreated,
  threadDeleted,
  threadLedgerUpdated,
  threadLorebookEntrySet,
  threadMemberToggled,
  threadRenamed,
  threadStatusSet,
} from "../store/slices/world";

export { SE_THREAD_CATEGORY };

/** The Thread's cast, each with the strings that mean "this member is in the
 *  scene": the member's own lorebook keys, then its resolved display name.
 *
 *  `resolveDisplayName` is called, never reimplemented, and with `"unattended"`
 *  — the edit pane's half-typed title must not become a probe. A member the
 *  World no longer holds is dropped; so is one nothing can name. A draft has no
 *  entry, so its name is the only alias it has. */
export async function resolveThreadMembers(
  state: RootState,
  thread: Pick<Thread, "entityIds">,
): Promise<ThreadMember[]> {
  const members = await Promise.all(
    thread.entityIds.map(async (id): Promise<ThreadMember | null> => {
      const entity = state.world.entitiesById[id];
      if (!entity) return null;

      const entryId = entity.lorebookEntryId;
      if (!entryId) {
        const name = nameKey(entity.name);
        return name ? { id, aliases: [name] } : null;
      }

      const entry = await api.v1.lorebook.entry(entryId);
      const displayName = await resolveDisplayName(
        state,
        entryId,
        entry?.displayName,
        "unattended",
      );
      const aliases = [
        ...(entry?.keys ?? []),
        ...(displayName === UNNAMED_ENTRY ? [] : [nameKey(displayName)]),
      ].filter((alias) => alias.trim().length > 0);
      return aliases.length > 0 ? { id, aliases } : null;
    }),
  );
  return members.filter((m): m is ThreadMember => m !== null);
}

/** Entity id → the plain strings that name it in prose.
 *
 *  For code that has to answer "is this entity named in this paragraph" with
 *  `mentionsName` — the review pass's tags and its admission floor. Regex keys
 *  (`/…/`) are left out: `mentionsName` matches literals, and a pattern read as
 *  a literal matches nothing. The World's own name leads, so an entity with no
 *  entry still has one alias. */
export type Aliases = Record<string, string[]>;

export async function entityAliases(
  state: RootState,
  entityIds: readonly string[],
): Promise<Aliases> {
  const pairs = await Promise.all(
    entityIds.map(async (id): Promise<[string, string[]]> => {
      const entity = state.world.entitiesById[id];
      if (!entity) return [id, []];
      const entry = entity.lorebookEntryId
        ? await api.v1.lorebook.entry(entity.lorebookEntryId)
        : null;
      const keys = (entry?.keys ?? []).filter(
        (key) => key.trim().length > 0 && !key.trim().startsWith("/"),
      );
      return [id, [entity.name, ...keys].filter((a) => a.trim().length > 0)];
    }),
  );
  return Object.fromEntries(pairs);
}

/** The Thread's condition from the World as it stands, or null when it has no
 *  nameable cast. The one place resolution and builder meet, so creation and
 *  every later sync build the same condition from the same Thread. */
export async function resolveThreadCondition(
  state: RootState,
  thread: Pick<Thread, "entityIds">,
): Promise<LorebookCondition[] | null> {
  return buildThreadCondition(
    thread,
    await resolveThreadMembers(state, thread),
  );
}

/** What the Thread's entry should say: `state`, with the erato divider when the
 *  writer has that setting on. Never the private notes. */
async function entryTextOf(thread: Thread): Promise<string> {
  const erato = Boolean(await api.v1.config.get("erato_compatibility"));
  return applyEratoPrefix(thread.state, erato);
}

/** Create the Thread's lorebook entry. Returns its id.
 *
 *  `keys: []` and `forceActivation: false`: the condition activates the entry
 *  on its own, and Always On would override it (measured — see
 *  `thread-condition.ts`). Its own `SE: Threads` category, so a writer opening
 *  their lorebook finds Threads as a group. One call, so the condition is
 *  present from the first moment the entry exists. */
async function createThreadEntry(
  thread: Thread,
  advancedConditions: LorebookCondition[],
): Promise<string> {
  const [category, text] = await Promise.all([
    ensureNamedCategory(SE_THREAD_CATEGORY),
    entryTextOf(thread),
  ]);
  return api.v1.lorebook.createEntry({
    id: api.v1.uuid(),
    displayName: thread.title,
    text,
    keys: [],
    enabled: thread.status === "open",
    forceActivation: false,
    advancedConditions,
    category,
  });
}

/** Switch off the entry of a Thread that has just been deleted.
 *
 *  **The entry id comes from the action, not from the World.** Effects run
 *  after the reducer, so the Thread is already gone by the time this is called —
 *  CLAUDE.md's rule that an intent carries what it needs in its payload, for
 *  once because there is no alternative rather than as a defence against a
 *  second press.
 *
 *  Disabled, never deleted, through the door like every other Engine write, so
 *  the entry stays in the writer's own lorebook and one switch brings it back.
 *  Miss the orphan here and it injects forever: nothing names it any more. */
export async function disableDeletedThreadEntry(
  entryId: string | undefined,
): Promise<boolean> {
  if (!entryId) return false;
  return writeLorebookEntry(entryId, (live) =>
    live.enabled === false ? null : { enabled: false },
  );
}

/** Clean up after Threads dropped on load (`loadWorldRecord` hands back the
 *  ids of the entries they owned): switch each entry off, then save.
 *
 *  **Never throws.** It is awaited on the way to mounting the panel, from a
 *  bare `void start()`; a lorebook error let through here means no sidebar and
 *  no HUD, on every load. So each entry is tried on its own, and one that fails
 *  is logged and left — an entry still injecting is a nuisance the writer can
 *  see and switch off; a script that will not mount is not.
 *
 *  **The save is what makes this happen once.** Loading drops the Threads from
 *  the store but not from the record, and nothing else writes the record until
 *  the World next changes. Without it every load would find the same Threads
 *  and switch the same entries off again, including any the writer had since
 *  switched back on. `save` is injected: this module does not own the record.
 */
export async function disableDroppedThreadEntries(
  entryIds: readonly string[],
  getState: () => RootState,
  save: (state: RootState) => Promise<void>,
): Promise<void> {
  if (entryIds.length === 0) return;
  for (const entryId of entryIds) {
    try {
      await disableDeletedThreadEntry(entryId);
    } catch (error) {
      api.v1.log(
        `[engine] could not switch off entry ${entryId} of a dropped Thread:`,
        error,
      );
    }
  }
  try {
    await save(getState());
  } catch (error) {
    api.v1.log("[engine] could not save after dropping old Threads:", error);
  }
}

/** Give a Thread its lorebook entry, once.
 *
 *  Two things must be true first. A title: the World's "+" makes an untitled
 *  draft, and a draft gets nothing until Save names it. A nameable cast: with
 *  nobody to be on stage there is no condition, and an entry with no condition
 *  could only ever be always-on or never-on. */
export async function ensureThreadEntry(
  getState: () => RootState,
  dispatch: Store<RootState>["dispatch"],
  threadId: string,
): Promise<boolean> {
  const state = getState();
  const thread = state.world.threads.find((t) => t.id === threadId);
  if (!thread || thread.lorebookEntryId) return false;
  if (!thread.title.trim()) return false;

  const condition = await resolveThreadCondition(state, thread);
  if (!condition) return false;

  const entryId = await createThreadEntry(thread, condition);
  dispatch(threadLorebookEntrySet({ threadId, entryId }));
  return true;
}

/** Bring a Thread's entry into step with the Thread: text, condition, enabled.
 *
 *  **One function for every edit.** A Thread's entry is `state` as its text,
 *  the cast-presence condition, and enabled exactly when the Thread is open and
 *  has a nameable cast. Rename, cast change, ledger update and status change
 *  all invalidate one of those, and a sync per kind of edit is how two of them
 *  end up disagreeing.
 *
 *  **`state` is the authority for the entry's text**, unlike an entity's entry,
 *  where the lorebook outranks the store. A Thread's text is the Engine's
 *  ledger; a hand edit made in the lorebook is overwritten on the next sync,
 *  and the place to edit a Thread is its pane.
 *
 *  Through the door, and only the fields that differ: returning null when the
 *  entry already agrees keeps a review pass's blanket re-sync from writing
 *  eight entries to change none. The entry's `displayName` is left alone.
 *
 *  Returns whether anything was written. */
export async function syncThreadEntry(
  getState: () => RootState,
  threadId: string,
): Promise<boolean> {
  const state = getState();
  const thread = state.world.threads.find((t) => t.id === threadId);
  if (!thread?.lorebookEntryId) return false;

  const [condition, text] = await Promise.all([
    resolveThreadCondition(state, thread),
    entryTextOf(thread),
  ]);
  const enabled = thread.status === "open" && condition !== null;

  return writeLorebookEntry(thread.lorebookEntryId, (live) => {
    const patch: Partial<LorebookEntry> = {};
    if ((live.text ?? "") !== text) patch.text = text;
    if ((live.enabled ?? true) !== enabled) patch.enabled = enabled;
    if (
      condition &&
      JSON.stringify(live.advancedConditions ?? null) !==
        JSON.stringify(condition)
    ) {
      patch.advancedConditions = condition;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  });
}

/** Re-sync every open Thread's entry.
 *
 *  A member's lorebook keys are edited outside the store — in NovelAI's own
 *  lorebook, or by a keys generation — so no action announces the change and a
 *  condition built from the old keys goes on probing for them. The review pass
 *  calls this before it reads, which bounds the staleness to one review. */
export async function syncOpenThreadEntries(
  getState: () => RootState,
): Promise<void> {
  for (const thread of getState().world.threads) {
    if (thread.status === "open") await syncThreadEntry(getState, thread.id);
  }
}

/** Every edit that can put a Thread and its entry out of step.
 *
 *  An effect rather than a call at each dispatch site: the World's pane, the
 *  Forge and the drain all dispatch these, and a sync the caller has to
 *  remember is a sync that will be forgotten.
 *
 *  Errors are logged rather than thrown: an effect is fire-and-forget, and a
 *  failed sync leaves the previous entry standing rather than a broken one. */
export function registerThreadConditionEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
  dispatch: Store<RootState>["dispatch"],
): void {
  // One settle at a time per Thread. Two actions on a Thread with no entry yet
  // would each read `lorebookEntryId` as unset across the awaits and each
  // create one, orphaning the loser. Chaining the second onto the first lets
  // it find the entry and sync it (CLAUDE.md: refuse re-entry across an
  // `await`). The map lives in this closure, not the module.
  const running = new Map<string, Promise<void>>();
  const settle = (threadId: string): void => {
    const previous = running.get(threadId) ?? Promise.resolve();
    const next: Promise<void> = previous.then(async () => {
      try {
        if (!(await ensureThreadEntry(getState, dispatch, threadId))) {
          await syncThreadEntry(getState, threadId);
        }
      } catch (error) {
        api.v1.log("[engine] thread entry sync failed:", error);
      }
      if (running.get(threadId) === next) running.delete(threadId);
    });
    running.set(threadId, next);
  };

  subscribeEffect(matchesAction(threadCreated), (action) =>
    settle(action.payload.thread.id),
  );
  subscribeEffect(matchesAction(threadRenamed), (action) =>
    settle(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadMemberToggled), (action) =>
    settle(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadLedgerUpdated), (action) =>
    settle(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadStatusSet), (action) =>
    settle(action.payload.threadId),
  );

  // Deleting an entity removes it from every cast in the reducer, with no
  // thread action to announce it.
  subscribeEffect(matchesAction(entityDeleted), () => {
    for (const thread of getState().world.threads) settle(thread.id);
  });

  // A restored entity rejoins its casts in the reducer, with no thread action
  // to announce it.
  subscribeEffect(matchesAction(entityRestored), () => {
    for (const thread of getState().world.threads) settle(thread.id);
  });

  // A renamed entity changes the aliases its Threads watch for, with no
  // thread action to announce it. Only the Threads it is in are settled. The
  // aliases are read from the member's entry first, so this picks the new
  // name up when the entry was renamed before the entity (a Scenario Build
  // RENAME and its undo both do it in that order).
  subscribeEffect(matchesAction(entityEdited), (action) => {
    for (const thread of getState().world.threads) {
      if (thread.entityIds.includes(action.payload.entityId)) settle(thread.id);
    }
  });

  subscribeEffect(matchesAction(threadDeleted), (action) => {
    const { lorebookEntryId } = action.payload;
    void (async () => {
      try {
        await disableDeletedThreadEntry(lorebookEntryId);
      } catch (error) {
        api.v1.log("[engine] deleted thread's entry not switched off:", error);
      }
    })();
  });
}
