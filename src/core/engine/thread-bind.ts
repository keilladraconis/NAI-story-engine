// Thread ⇄ lorebook entry: what a thread's entry is, who its detector watches
// for, and when that has to be rebuilt.
//
// Phase 5 built the forgetting detector (`thread-condition.ts`) and wired it to
// nothing: `threadLorebookEntrySet` had no caller and no thread had ever had an
// entry. This is the wiring, and it is the reason the binding and §7's
// reconciliation had to land in the same phase — a displacement is free only
// while there is no entry behind the thread (§4.5).
//
// Three things live here, and they are together because they are one contract:
// what a thread's entry must carry, where that carriage is built from, and the
// four edits that invalidate it. Splitting the trigger list away from the
// builder is how the two drift into disagreeing, and a stale condition is not a
// visible bug — it is a thread that quietly reminds forever.
//
// **This module creates entries; it never rewrites one.** Creation is not a
// write in §5.2's sense: there is no live text to read first and no original to
// preserve, and the writer's lorebook gained an entry rather than losing one.
// Every rewrite below — the condition rebuild included — goes through
// `lorebook-write.ts`, so it takes the §5.2 snapshot like any other Engine
// edit. `execute.test.ts`'s source scan holds the line.

import { matchesAction, type Store } from "nai-store";
import type { RootState, Thread, WorldEntity } from "../store/types";
import { buildThreadCondition, type ThreadMember } from "./thread-condition";
import { writeLorebookEntry } from "./lorebook-write";
import { mentionsName } from "./assess";
import { nameKey } from "../store/effects/handlers/lorebook";
import { applyEratoPrefix } from "../utils/config";
import { resolveDisplayName, UNNAMED_ENTRY } from "../utils/lorebook-strategy";
import {
  ensureNamedCategory,
  SE_THREAD_CATEGORY,
} from "../store/effects/lorebook-sync";
import {
  threadAnchorSet,
  threadStatusSet,
  threadHorizonSet,
  threadMemberToggled,
  threadRenamed,
} from "../store/slices/world";
import { captureNode } from "../store/persistence/history-store";

export { SE_THREAD_CATEGORY };

/** The thread's cast, with every name resolved the way the entry it probes for
 *  is actually keyed (CLAUDE.md's DRAFT > LOREBOOK > STATE).
 *
 *  `buildThreadCondition` refuses to do this itself and says so in its
 *  signature: it is pure, and `resolveDisplayName` is async because the LOREBOOK
 *  layer is an API read and the DRAFT layer a storyStorage one. So the
 *  resolution is the caller's, and this is the caller.
 *
 *  **`resolveDisplayName` is called, never reimplemented.** The order is the
 *  point: a writer renames an entry in their own lorebook, Story Engine does not
 *  chase the move, and `entity.name` is therefore the layer allowed to be stale.
 *  A detector built from the stale layer watches for a string the prose no
 *  longer uses, never matches, and fires forever — the always-on entry the
 *  detector exists to replace.
 *
 *  Two members are dropped rather than guessed at. One the World no longer
 *  holds has no name to resolve; one nothing can name resolves to
 *  `UNNAMED_ENTRY`, which is a placeholder sentence rather than a name — probed
 *  for, it never matches, and it fires the thread forever for the same reason.
 *  A draft entity has no entry, so STATE is the only layer it has: its name is
 *  read straight off the World, which is not a shortcut past the hierarchy but
 *  the whole of the hierarchy that exists for it. */
export async function resolveThreadMembers(
  state: RootState,
  thread: Thread,
): Promise<ThreadMember[]> {
  const members = await Promise.all(
    thread.entityIds.map(async (id): Promise<ThreadMember | null> => {
      const entity = state.world.entitiesById[id];
      if (!entity) return null;

      const entryId = entity.lorebookEntryId;
      if (!entryId) {
        const name = entity.name.trim();
        return name ? { id, displayName: name } : null;
      }

      const entry = await api.v1.lorebook.entry(entryId);
      const displayName = await resolveDisplayName(
        state,
        entryId,
        entry?.displayName,
      );
      return displayName === UNNAMED_ENTRY ? null : { id, displayName };
    }),
  );

  return members.filter((m): m is ThreadMember => m !== null);
}

/** The thread's `advancedConditions`, from the World as it stands.
 *
 *  The one place the resolution and the builder meet, so the entry's creation
 *  and every later rebuild cannot produce different conditions from the same
 *  thread. */
export async function resolveThreadCondition(
  state: RootState,
  thread: Thread,
): Promise<LorebookCondition[]> {
  return buildThreadCondition(
    thread,
    await resolveThreadMembers(state, thread),
  );
}

/** The entities a triage subject names — the cast a thread opens with.
 *
 *  Triage's `OPEN` carries a free-text subject and nothing else: the manifest
 *  has no syntax for a cast, and asking the model for one would be asking it to
 *  resolve names against a list it can only misremember. The subject is the
 *  phrase the model wrote to name a commitment, so the entities whose names
 *  appear in it are that commitment's participants — cheaply, and without a
 *  second generation.
 *
 *  **This is what keeps an opened thread from being always-on.** §4.1 calls
 *  `entityIds` load-bearing and §4.3 makes the cast the detector's subject; a
 *  thread with no cast probes only for its title, which is prose and will rarely
 *  appear as written, so the negation is always true. §4.3 accepts that
 *  degradation — to the blunt instrument threads used to be, never to silence —
 *  but accepting it for EVERY thread the Engine opens would be shipping the
 *  always-on entry the phase exists to replace.
 *
 *  Matched with `assess`'s own matcher, not a second one: "is Ada in this
 *  string" must have one answer in this codebase. */
export function castFromSubject(
  subject: string,
  entities: WorldEntity[],
): string[] {
  return entities
    .filter((entity) => mentionsName(subject, entity.name))
    .map((entity) => entity.id);
}

/** The thread a triage subject already names, if there is one.
 *
 *  **This is what "renew" means, and it is the only evidence the Engine gets.**
 *  Triage runs hot (§3.3) and keeps naming a commitment while it is unsettled,
 *  so the same subject arrives on pass after pass. `dedupe` collapses repeats
 *  inside one queue; nothing collapses them across passes, and without this an
 *  `open` for a commitment already on the list would mint a second thread and a
 *  second always-on lorebook entry for one thing.
 *
 *  So a repeat is read as what it is: the story has raised this again, which is
 *  the story demonstrably still carrying it. That renews the anchor (§4.5's
 *  "how long since the story last touched it") and costs no generation.
 *
 *  Matched on `nameKey` — trim and lowercase — because that is exactly the
 *  identity `intentKey` gives an `open` intent, so a subject the queue would
 *  call the same work names the same thread here.
 *
 *  **Satisfied threads match too**, and are renewed rather than reopened. A
 *  second thread under a settled title would leave the writer two entries with
 *  one name, one disabled and one not; reopening instead would re-enable a
 *  reminder the Engine deliberately switched off (§4.4) on the strength of a
 *  model ignoring the "satisfied" tag the manifest showed it. Renewing is the
 *  answer that adds nothing and destroys nothing — and a satisfied thread never
 *  expires anyway, so the moved anchor changes nothing about it. */
export function findThreadBySubject(
  threads: Thread[],
  subject: string,
): Thread | undefined {
  const key = nameKey(subject);
  return threads.find((thread) => nameKey(thread.title) === key);
}

/** Create the thread's lorebook entry, condition and all. Returns its id.
 *
 *  Four decisions are baked into the shape below.
 *
 *  **Always on, with the condition as the gate.** A key-activated entry has to
 *  have one of its keys present to be considered at all — and this entry's
 *  condition negates exactly the strings it would be keyed on, so it could then
 *  never fire. That is §4.3's contradiction arriving through the keys instead of
 *  through the `lore` gate that section rejects. `forceActivation` plus an
 *  `advancedConditions` gate is the only composition that expresses "inject when
 *  the story has stopped mentioning this", so the entry carries no keys of its
 *  own.
 *
 *  **Its own `SE: Threads` category**, not a DULFS one: a thread is not an
 *  entity, and a writer opening their lorebook should find the Engine's
 *  commitments as a group rather than filed among their characters.
 *
 *  **One call, not a create followed by an update.** `createEntry` takes the
 *  whole entry, so the condition is present from the first moment the entry
 *  exists — there is no window in which an always-on entry sits in the writer's
 *  lorebook with no gate on it.
 *
 *  **The erato divider is applied here too**, because this is a lorebook entry
 *  like any other and a writer with the setting on would otherwise find one
 *  entry in their book missing its separator. */
export async function createThreadEntry(
  state: RootState,
  thread: Thread,
): Promise<string> {
  const [category, advancedConditions, erato] = await Promise.all([
    ensureNamedCategory(SE_THREAD_CATEGORY),
    resolveThreadCondition(state, thread),
    api.v1.config.get("erato_compatibility"),
  ]);

  return api.v1.lorebook.createEntry({
    id: api.v1.uuid(),
    displayName: thread.title,
    text: applyEratoPrefix(thread.text, Boolean(erato)),
    keys: [],
    enabled: true,
    forceActivation: true,
    advancedConditions,
    category,
  });
}

/** Rebuild a thread's condition against the World as it now stands.
 *
 *  Through the write door, like every other Engine rewrite: a rebuild that
 *  called `updateEntry` itself would leave the writer's original unsnapshotted
 *  for an entry the Engine had edited, and §5.2's promise is made per entry
 *  rather than per kind of edit.
 *
 *  Only `advancedConditions` is written. The entry's `displayName` and `text`
 *  are left exactly as they are even when the thread's title changed, for the
 *  same reason `entityCategoryChanged` does not rewrite `entry.category`: the
 *  entry is the writer's, and the Engine touches the least of it that the job
 *  requires. It also means this rewrite is one §7 has nothing to reconcile —
 *  no text was written, so no `lb:` record is either.
 *
 *  Returns whether anything was written, which is what the tests read. */
export async function rebuildThreadCondition(
  getState: () => RootState,
  threadId: string,
  nodeId: number,
): Promise<boolean> {
  const state = getState();
  const thread = state.world.threads.find((t) => t.id === threadId);
  // No thread, or a thread with nothing behind it: the writer's own "+ New
  // Thread" makes one of those, and it has no detector to keep current.
  if (!thread?.lorebookEntryId) return false;

  const advancedConditions = await resolveThreadCondition(state, thread);
  const { written } = await writeLorebookEntry(
    { entryId: thread.lorebookEntryId, nodeId },
    () => ({ advancedConditions }),
  );
  return written;
}

/** Apply a thread's `status` to its entry's `enabled` flag.
 *
 *  §7's rule, for one thread: **a thread entry is enabled exactly when a thread
 *  on this branch names it and that thread is open.** `reconcileThreadEntries`
 *  applies the same rule across the whole World at navigation time; this applies
 *  it at the moment the status changes, so the two cannot disagree.
 *
 *  Without it a writer's own press does nothing they can see. `threadStatusSet`
 *  is dispatched from `ThreadEditPane`'s status control as well as from the
 *  drain's retire, and only the drain wrote the flag — so marking a thread
 *  satisfied by hand left its reminder injecting, and reopening one by hand left
 *  it silent, until the next undo happened to reconcile it. The Engine's own
 *  retire already writes the flag before dispatching, which makes this a no-op
 *  for that path rather than a second writer of the same value.
 *
 *  Through the door, like every other Engine rewrite, and writing only
 *  `enabled` — the entry is the writer's and the Engine touches the least of it
 *  the job requires. No text, so no `lb:` record: §7 answers this flag from the
 *  branch's World rather than from a record, which is exactly why it can. */
export async function applyThreadStatus(
  getState: () => RootState,
  threadId: string,
  nodeId: number,
): Promise<boolean> {
  const thread = getState().world.threads.find((t) => t.id === threadId);
  if (!thread?.lorebookEntryId) return false;

  const enabled = thread.status === "open";
  const { written } = await writeLorebookEntry(
    { entryId: thread.lorebookEntryId, nodeId },
    (live) => (live.enabled === enabled ? null : { enabled }),
  );
  return written;
}

/** The four edits a thread's condition is built from (§4.3, phase 5's handoff
 *  plus phase 6's gate).
 *
 *  `threadRenamed` changes the title probe, `threadMemberToggled` changes the
 *  cast the real probes come from, `threadHorizonSet` changes their range, and
 *  `threadAnchorSet` moves the pacing gate the anchor is baked into. Nothing
 *  else does: `threadTextUpdated` rewords the reminder, which the condition
 *  never reads, and `threadStatusSet` is answered by the entry's `enabled` flag
 *  rather than by a condition (§4.4) — `applyThreadStatus` above, subscribed
 *  alongside these four.
 *
 *  **The anchor is the fourth because the gate stores it, not because the gate
 *  reads it.** `paceGate` resolves `anchorParagraph` into a literal `target`, so
 *  a renewal that did not rebuild would leave the entry gating on the paragraph
 *  the thread was OPENED at — the grace the renewal exists to restart. Baking
 *  the anchor in is what makes a per-thread left-hand side expressible at all
 *  (the grammar has no variable for it), and this subscription is its price.
 *
 *  **An effect rather than a call at each dispatch site.** Three of the four are
 *  dispatched from the World's edit pane today and from the Forge's [THREAD]
 *  command tomorrow, and the fourth from the drain, and a rebuild the caller has to remember is a rebuild that
 *  will be forgotten — leaving a detector probing a name the prose no longer
 *  uses, which fires forever and looks like the Engine having opinions about a
 *  thread nobody mentioned. Subscribing to the actions puts the rule where the
 *  invariant is, the same argument that puts the thread cap in the reducer.
 *
 *  The node is captured before the first `await`, which is as close to dispatch
 *  time as an effect can get (§6.3). The rebuild writes no history record — it
 *  writes no text — so this is belt and braces rather than load-bearing, but the
 *  door refuses to default a node and that refusal is the point of it.
 *
 *  Errors are logged rather than thrown: an effect is fire-and-forget, so a
 *  rejection here has nowhere to land, and a failed rebuild leaves the previous
 *  condition standing rather than a broken one. */
export function registerThreadConditionEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
): void {
  const rebuild = (threadId: string): void => {
    void (async () => {
      try {
        await rebuildThreadCondition(getState, threadId, await captureNode());
      } catch (error) {
        api.v1.log("[engine] thread condition rebuild failed:", error);
      }
    })();
  };

  subscribeEffect(matchesAction(threadRenamed), (action) =>
    rebuild(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadMemberToggled), (action) =>
    rebuild(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadHorizonSet), (action) =>
    rebuild(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadAnchorSet), (action) =>
    rebuild(action.payload.threadId),
  );

  subscribeEffect(matchesAction(threadStatusSet), (action) => {
    const { threadId } = action.payload;
    void (async () => {
      try {
        await applyThreadStatus(getState, threadId, await captureNode());
      } catch (error) {
        api.v1.log("[engine] thread status flip failed:", error);
      }
    })();
  });
}
