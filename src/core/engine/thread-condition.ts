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
// Pure. The caller hands over the thread and the entities to resolve its cast
// against; nothing here reads `api.v1` or the store, and nothing here writes the
// result onto a lorebook entry — that is phase 6's.
//
// Nothing in `src/` used `advancedConditions` before this file, so there is no
// house style: every shape below is read off `external/script-types.d.ts`.

import { nameKey } from "../store/effects/handlers/lorebook";
import type { Thread, ThreadHorizon, WorldEntity } from "../store/types";

/** How far back a horizon looks for its subject, in **characters** (the unit
 *  `LorebookAdvancedConditionKey.range` is documented in, and only meaningful
 *  for `'story'`).
 *
 *  Read against an ordinary prose paragraph of ~400 characters (~65 words),
 *  which is what NovelAI's own editor produces at a comfortable line:
 *
 *    point — 1000 chars ≈ 2–3 paragraphs. An unresolved detail is expected to
 *      be picked up inside the same beat; if the prose has walked away from it
 *      for a couple of paragraphs it is already being dropped.
 *    plot  — 4000 chars ≈ 10 paragraphs, about one scene. A subplot survives a
 *      scene that is not about it, and is forgotten once a whole scene has gone
 *      by without it.
 *    arc   — 12000 chars ≈ 30 paragraphs, several scenes. An arc is allowed to
 *      go quiet for a chapter; nagging about it every scene is the blanket
 *      always-on this construction exists to replace.
 *
 *  The ratios matter more than the absolutes: a point decays ~12x faster than
 *  an arc, so the three horizons produce visibly different behaviour rather
 *  than three spellings of the same one. */
export const THREAD_RANGE_CHARS: Record<ThreadHorizon, number> = {
  point: 1000,
  plot: 4000,
  arc: 12000,
};

/** The strings whose presence in recent prose means "this thread is still
 *  alive". Exported for the tests and for phase 6, which will want to show a
 *  writer what their thread is actually watching for.
 *
 *  **Decision 1 — the subject is the cast's names, plus the title.**
 *
 *  Entity names are the only strings we can expect to appear in prose verbatim:
 *  they are proper nouns, and the writer's own entries are keyed on exactly
 *  this string already (`nameKey` — trim + lowercase, shared with the entry so
 *  the detector and the entry can never disagree about what counts as a
 *  mention; that is why it is imported rather than re-spelled).
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
 *  the thread's own member order, so a caller may pass the whole world just as
 *  well as the participants. An id with no entity is skipped rather than
 *  guessed at.
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
  entities: WorldEntity[],
): string[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const names = thread.entityIds
    .map((id) => byId.get(id))
    .filter((e): e is WorldEntity => e !== undefined)
    .map((e) => e.name);

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
  entities: WorldEntity[],
): LorebookCondition[] {
  const range = THREAD_RANGE_CHARS[thread.horizon];
  const subjects = threadSubjects(thread, entities);

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
