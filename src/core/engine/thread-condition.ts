// A Thread's `advancedConditions`: "its cast is on stage".
//
//   one member     key(A)
//   two members    and( key(A), key(B) )
//   three or more  or( and(A,B), and(A,C), and(B,C), ... )
//
// where key(X) is itself an `or` over X's aliases. A Thread records how things
// stand between entities, so it belongs in context exactly when those entities
// are in the scene together — and nowhere else. It never arrives when the story
// has moved on, because text arriving then reads to the story model as a cue to
// go back.
//
// Pure. The caller resolves each member's aliases (`thread-bind.ts`); nothing
// here reads `api.v1` or the store.
//
// **The entry carrying this condition must not be `forceActivation: true`.**
// Always On overrides `advancedConditions` outright — measured with
// `tools/paragraph-count-probe.naiscript` — so the condition activates the
// entry on its own: `keys: []`, `forceActivation: false`.

import type { Thread } from "../store/types";

/** How far back a member may have been named and still count as on stage, in
 *  characters — the unit `LorebookAdvancedConditionKey.range` is documented in.
 *  About ten 400-character paragraphs: one scene. */
export const THREAD_PRESENCE_RANGE_CHARS = 4000;

/** One cast member as the caller must hand it over: an id, and every string
 *  whose presence in the prose means this member is in the scene.
 *
 *  Aliases, not a name. Prose says "Oriel" far more often than "Oriel Vant",
 *  and the member's own lorebook keys are the writer's statement of what counts
 *  as a mention. Resolving them is async (a lorebook read), which is why it is
 *  the caller's job and this module stays pure. */
export type ThreadMember = {
  id: string;
  aliases: string[];
};

/** "This member is on stage", or null when nothing can name them. Aliases are
 *  passed to NovelAI's matcher verbatim; blank ones and case-duplicates are
 *  dropped. A one-alias `or` is noise in a structure a writer can open in
 *  NovelAI's condition editor, so one probe stays one probe. */
function onStage(member: ThreadMember): LorebookCondition | null {
  const seen = new Set<string>();
  const probes: LorebookCondition[] = [];
  for (const raw of member.aliases) {
    const alias = raw.trim();
    const folded = alias.toLowerCase();
    if (!alias || seen.has(folded)) continue;
    seen.add(folded);
    probes.push({
      type: "key",
      key: alias,
      in: ["story"],
      range: THREAD_PRESENCE_RANGE_CHARS,
    });
  }
  if (probes.length === 0) return null;
  return probes.length === 1 ? probes[0] : { type: "or", conditions: probes };
}

/** The Thread's `advancedConditions`, or null for a Thread with no nameable
 *  cast — which gets no lorebook entry at all.
 *
 *  Always ONE condition when there is one. `advancedConditions` is an array and
 *  the `.d.ts` does not say how its members combine, so the composition is
 *  written out with `and`/`or` rather than left to a rule nobody has verified.
 *
 *  A two-person Thread needs both: firing whenever either appears alone would
 *  put a relationship in a scene only one of them is in. A larger cast needs
 *  any two, because a feud between houses is in play when two of them meet. */
export function buildThreadCondition(
  thread: Pick<Thread, "entityIds">,
  members: ThreadMember[],
): LorebookCondition[] | null {
  const byId = new Map(members.map((m) => [m.id, m]));
  const cast = thread.entityIds
    .map((id) => byId.get(id))
    .filter((m): m is ThreadMember => m !== undefined)
    .map(onStage)
    .filter((c): c is LorebookCondition => c !== null);

  if (cast.length === 0) return null;
  if (cast.length === 1) return [cast[0]];
  if (cast.length === 2) return [{ type: "and", conditions: cast }];

  const pairs: LorebookCondition[] = [];
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      pairs.push({ type: "and", conditions: [cast[i], cast[j]] });
    }
  }
  return [{ type: "or", conditions: pairs }];
}
