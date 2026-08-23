// The forgetting detector: a Thread's `advancedConditions`.
//
//   and(
//     not( key <subject> in ['story'] within range N ),
//     paragraphCount past the thread's own anchor            // §4.3's gate
//   )
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
import { THREAD_GRACE_PARAGRAPHS, THREAD_RANGE_CHARS } from "./thread-horizon";
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
 *  the four actions `slices/world.ts` names (`threadRenamed`,
 *  `threadMemberToggled`, `threadHorizonSet`, `threadAnchorSet`). A condition built from a stale
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
 *  **Decision 4 — the pacing gate is a grace period, and it is not arc-only.**
 *  See `paceGate` below for both halves of that.
 *
 *  `status` is not read here on purpose. Satisfaction is a flag flip on the
 *  entry (§4.4, `enabled: false`), not a condition — telling the model "this is
 *  resolved" would spend context asserting a negative. */
export function buildThreadCondition(
  thread: Thread,
  members: ThreadMember[],
): LorebookCondition[] {
  const detector = buildDetector(thread, members);
  const gate = paceGate(thread);

  if (!detector) return gate ? [gate] : [{ type: "true" }];
  if (!gate) return [detector];
  return [{ type: "and", conditions: [detector, gate] }];
}

/** "The story has stopped mentioning this" — the negated probe, or null when
 *  the thread offers nothing to probe for. */
function buildDetector(
  thread: Thread,
  members: ThreadMember[],
): LorebookCondition | null {
  const range = THREAD_RANGE_CHARS[thread.horizon];
  const subjects = threadSubjects(thread, members);

  if (subjects.length === 0) return null;

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

  return { type: "not", condition: alive };
}

/** §4.3's pacing gate: "not before the thread has had a fair chance."
 *
 *  **What the anchor makes expressible, and what it does not.** §4.3 asks for
 *  "since this thread last fired", and nothing reports an activation back to a
 *  script — so that is not obtainable at any price. What phase 6's anchor gives
 *  is "since the Engine last touched this thread", and the honest gate over it
 *  is a grace period rather than the duty cycle §4.3 sketched. The
 *  `paragraphCount % 20 < 3` stripe that section rejected is not built here
 *  either, and would not be: a per-thread phase shift needs `(p - anchor) % 20`,
 *  which is three terms of arithmetic in a grammar that never says how a term's
 *  operator binds.
 *
 *  **Single-term equations, both of them.** `terms` is an array of
 *  `{value, operator?}` and the `.d.ts` documents one example — "characterCount
 *  > 1000" — with no statement of associativity, precedence, or whether an
 *  operator applies before or after its own value. The anchor is a literal at
 *  build time, so `paragraphCount - anchor >= grace` can be written as
 *  `paragraphCount >= anchor + grace` with the arithmetic already done: the same
 *  predicate, in the one shape the `.d.ts` actually documents. `target` accepts
 *  a number, which is what makes that possible.
 *
 *  **Why the second disjunct.** `paragraphCount < anchor` cannot happen while
 *  the branch only grows, and that is the point — it is the escape hatch for
 *  when it happens anyway. Undo does not revert a lorebook entry (§7 exists
 *  because of that), so navigating back past the pass that anchored a thread
 *  leaves its entry gating on a paragraph the branch will not reach again for a
 *  chapter, and nothing rebuilds it until the Engine next touches the thread.
 *  Without this disjunct that thread is silent until then. §4.3 accepts a
 *  degradation to the always-on the detector replaces; it never accepts a
 *  degradation to silence. It also covers the writer deleting prose, and the
 *  case where NovelAI's `paragraphCount` turns out not to be counting what
 *  `api.v1.document.scan()` counts — the same failure, the same escape.
 *
 *  **Not arc-only, though §4.3 frames it that way.** The artefact the grace
 *  suppresses is proportional to the horizon's range and exists at all three,
 *  and the grace is derived from that range, so the rule is one rule. Arc-only
 *  would also be inert as built: the Engine's `open` passes no horizon, so every
 *  thread it anchors is a `plot`, and every arc is one the writer made by hand
 *  with no anchor to gate on.
 *
 *  Null for an unanchored thread — the writer's own "+ New Thread" — which is
 *  the phase-5 condition unchanged. */
function paceGate(thread: Thread): LorebookCondition | null {
  const anchor = thread.anchorParagraph;
  if (anchor === null) return null;

  return {
    type: "or",
    conditions: [
      {
        type: "equation",
        terms: [{ value: "paragraphCount" }],
        comparison: ">=",
        target: anchor + THREAD_GRACE_PARAGRAPHS[thread.horizon],
      },
      {
        type: "equation",
        terms: [{ value: "paragraphCount" }],
        comparison: "<",
        target: anchor,
      },
    ],
  };
}
