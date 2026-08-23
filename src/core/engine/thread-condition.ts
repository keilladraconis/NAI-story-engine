// The forgetting detector: a Thread's `advancedConditions`.
//
//   not( key <subject> in ['story'] within range N )
//
// Plain keyword keys are structurally wrong for a commitment (§4.3). A dropped
// Chekhov's gun goes unmentioned, so an entry keyed on "pistol" never fires —
// the thing whose symptom is *absence* cannot trigger on *presence*. Negating
// the probe inverts the cost model: a thread is silent while it is alive in the
// prose and injects precisely when the model has stopped carrying it.
//
// Pure. The caller hands over the thread and its cast WITH THE NAMES ALREADY
// RESOLVED (see `ThreadMember`); nothing here reads `api.v1` or the store, and
// nothing here writes the result onto a lorebook entry — that is
// `thread-bind.ts`'s.
//
// Nothing in `src/` used `advancedConditions` before this file, so there is no
// house style: every shape below is read off `external/script-types.d.ts`.

import { nameKey } from "../store/effects/handlers/lorebook";
import { THREAD_RANGE_CHARS } from "./thread-horizon";
import type { Thread } from "../store/types";

/** One member of a thread's cast, as the CALLER must hand it over: an id, and
 *  the name that member's lorebook entry is actually keyed on.
 *
 *  **Not a `WorldEntity`, and the difference is the whole point.** The detector
 *  probes for a mention, and what the entry is keyed on is written from
 *  `lorebookEntry.displayName` (`handlers/lorebook.ts`) — which a writer may
 *  have renamed in their own lorebook, a move Story Engine deliberately does
 *  not chase (CLAUDE.md). `entity.name` is the LAST of CLAUDE.md's three
 *  layers, DRAFT > LOREBOOK > STATE, so resolving from it is resolving from the
 *  one that is allowed to be stale. `resolveDisplayName` in
 *  `utils/lorebook-strategy.ts` is the canonical resolution and it is async,
 *  which is exactly why it cannot happen in here: this module is pure, and
 *  making it async to fetch names would put an `api.v1` call under the
 *  condition builder.
 *
 *  So the resolution is the caller's, and the type is what makes that
 *  unavoidable. `WorldEntity` has `name`, not `displayName`, so phase 6 cannot
 *  pass the world straight in and end up with a detector watching for a string
 *  the entry no longer carries — it gets a type error instead of a thread that
 *  reminds forever. */
export type ThreadMember = {
  id: string;
  /** The resolved name — `resolveDisplayName`'s answer for this member's entry,
   *  not `WorldEntity.name`. */
  displayName: string;
};

/** The strings whose presence in recent prose means "this thread is still
 *  alive". Exported for the tests and for phase 6, which will want to show a
 *  writer what their thread is actually watching for.
 *
 *  **Decision 1 — the subject is the cast's names, plus the title.**
 *
 *  Member names are the only strings we can expect to appear in prose verbatim:
 *  they are proper nouns, and the writer's own entries are keyed on exactly
 *  this string already. `nameKey` is imported rather than re-spelled so that
 *  the detector and the entry normalise a name the same way — trim and
 *  lowercase. That is all it buys. It does NOT make the two agree about WHICH
 *  string: the entry's key is written from `lorebookEntry.displayName`, and a
 *  `WorldEntity.name` can have drifted from it. Which string this probes for is
 *  settled by the caller, per `ThreadMember` above.
 *
 *  The title is included but not relied on. A title is prose — "The hidden
 *  letter" will rarely appear as written — and a thread whose only subject never
 *  appears fires constantly. Inside an `or` a title that never matches costs
 *  nothing, and a title that *does* match is the strongest evidence available
 *  that the thread is alive on the page. So it rides along; the cast carries the
 *  detector.
 *
 *  This is what §4.1 means by `entityIds` being load-bearing rather than
 *  inherited baggage — the cast is the subject.
 *
 *  Members are resolved through `thread.entityIds` against the supplied list, in
 *  the thread's own member order, so a caller may pass every resolved member of
 *  the world just as well as this thread's. An id no member answers to is
 *  skipped rather than guessed at.
 *
 *  **What phase 6 did with this.** `thread-bind.ts` builds the
 *  `ThreadMember[]` from the lorebook through `resolveDisplayName`'s order —
 *  entry `displayName` ahead of `entity.name` — and rebuilds the condition on
 *  the three actions `slices/world.ts` names (`threadRenamed`,
 *  `threadMemberToggled`, `threadHorizonSet`). A condition built from a stale
 *  name probes for a string the prose no longer uses, never matches, and so
 *  fires forever: the always-on entry this detector exists to replace, arriving
 *  by the door it opened.
 *
 *  Blank subjects are dropped: an empty key would be a lie in whichever
 *  direction NovelAI resolves it (matching everywhere, or nowhere). Draft
 *  entities can be nameless, so this is a real case, not a defensive one.
 *
 *  Everything else in a name is passed through **verbatim**. Unlike
 *  `assess.ts`, which compiles a name into a `RegExp` and must escape it, this
 *  string is data handed to NovelAI's own matcher; escaping it here would make
 *  the detector search for backslashes that the entity's activation key does not
 *  contain. "C++", "(redacted)" and "/Ada/" therefore reach the condition as the
 *  same key the entry itself carries, whatever NovelAI makes of them. */
export function threadSubjects(
  thread: Thread,
  members: ThreadMember[],
): string[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const names = thread.entityIds
    .map((id) => byId.get(id))
    .filter((m): m is ThreadMember => m !== undefined)
    .map((m) => m.displayName);

  const seen = new Set<string>();
  const subjects: string[] = [];
  for (const raw of [thread.title, ...names]) {
    const key = nameKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    subjects.push(key);
  }
  return subjects;
}

/** The thread's `advancedConditions`, ready for `api.v1.lorebook.updateEntry`.
 *
 *  Always **one** condition. `LorebookEntry.advancedConditions` is an array and
 *  the `.d.ts` does not say how its members combine, so the composition is
 *  written out explicitly with `and`/`or`/`not` instead of leaning on a rule
 *  nobody has verified.
 *
 *  **Decision 3 — no `lore` gate on the participants.** §4.3 offers
 *  `{type: "lore", entryId}` for "remind about the succession only when a
 *  member of the Inner Circle is on stage", and with the cast as the subject
 *  that gate is self-defeating: a participant's entry is active *because* its
 *  name — the same `nameKey` string this detector probes for — appeared in
 *  context. `and( lore(X), not(key X) )` is then a contradiction whenever the
 *  entry's search range covers our `range`, and the entry's search range is not
 *  something a script can read (`LorebookEntry` in the `.d.ts` exposes no such
 *  field), so we cannot even tell which way it resolves. A gate we cannot
 *  reason about, guarding a detector it may silently zero out, is worse than no
 *  gate. The cast stays load-bearing through the subject keys instead — the
 *  same information, with the polarity the forgetting detector needs.
 *
 *  A thread with **no participants** is §4.1's degenerate case and still gets a
 *  usable condition: the title alone. When that title is prose the probe never
 *  matches, the negation is always true, and the thread degrades to always-on —
 *  which is exactly what threads did before this phase. The degradation is to
 *  the old blunt instrument, never to silence. A thread with neither cast nor
 *  title says so honestly with `{type: "true"}` rather than emitting a probe for
 *  the empty string.
 *
 *  **Decision 4 — the arc pacing gate waits for phase 6.** §4.3 wants
 *  `paragraphCount` equations to pace arc-horizon threads, and this is the wrong
 *  phase for it. `Thread` carries no anchor — no timestamp, no mention position
 *  (Task 1's handoff) — so the only gate expressible here is a global stripe
 *  like `paragraphCount % 20 < 3`, which fires *every* arc thread in the same
 *  paragraphs and cannot say "since this thread last fired". It would also flip
 *  the reminder on and off between consecutive continuations inside one scene,
 *  which is context churn rather than pacing. Phase 6 owns the Engine acting: it
 *  can record a per-thread anchor when it opens or renews a thread, and only
 *  then does the equation have a meaningful left-hand side. Nothing consumes
 *  this value yet, so deferring costs nothing and guessing would bake the guess
 *  into a writer's lorebook.
 *
 *  `status` is not read here on purpose. Satisfaction is a flag flip on the
 *  entry (§4.4, `enabled: false`), not a condition — telling the model "this is
 *  resolved" would spend context asserting a negative. */
export function buildThreadCondition(
  thread: Thread,
  members: ThreadMember[],
): LorebookCondition[] {
  const range = THREAD_RANGE_CHARS[thread.horizon];
  const subjects = threadSubjects(thread, members);

  if (subjects.length === 0) return [{ type: "true" }];

  const probes: LorebookCondition[] = subjects.map((key) => ({
    type: "key",
    key,
    in: ["story"],
    range,
  }));

  // "Any subject is on the page." One probe stays one probe — a one-member `or`
  // is noise in a structure a writer can open in NovelAI's condition editor.
  const alive: LorebookCondition =
    probes.length === 1 ? probes[0] : { type: "or", conditions: probes };

  return [{ type: "not", condition: alive }];
}
