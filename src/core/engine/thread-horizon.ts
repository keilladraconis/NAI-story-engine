// The horizon scale: how long each kind of commitment is given, and the
// paragraph the numbers are reasoned in.
//
// Its own module because both halves of phase 5 read it and neither should have
// to import the other. `thread-condition.ts` turns a range into a lorebook
// probe and pulls `nameKey` in from the lorebook generation handler; if
// `thread-cap.ts` reached through it for these numbers, the whole
// generation-handler subtree would ride along into `rootReducer` — where the
// cap is enforced — and close an import cycle back onto the store. A table of
// constants has no dependencies of its own, so it can sit under both.
//
// One home also means a range and the expiry derived from it cannot drift into
// disagreeing about what a horizon is.

import type { ThreadHorizon } from "../store/types";

/** The prose paragraph these numbers are reasoned in: ~400 characters, ~65
 *  words, which is what NovelAI's own editor produces at a comfortable line.
 *
 *  Exported because `range` is in characters while every horizon below is
 *  argued in paragraphs, and the expiry in `thread-cap.ts` is argued in
 *  paragraphs too — one place to change the assumption, rather than a 400
 *  written out wherever somebody needed to convert. */
export const PARAGRAPH_CHARS = 400;

/** How far back a horizon looks for its subject, in **characters** (the unit
 *  `LorebookAdvancedConditionKey.range` is documented in, and only meaningful
 *  for `'story'`).
 *
 *  Read against `PARAGRAPH_CHARS`:
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
