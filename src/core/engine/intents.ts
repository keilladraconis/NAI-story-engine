// The intent queue's shape and its one rule: never queue the same work twice.
//
// Triage runs hot (§3.3) and will keep naming the same entity on consecutive
// passes until the work is actually done. Deduping on the way in is what keeps a
// single unresolved commitment from growing the queue without bound.
//
// Pure by construction — no api.v1, no promises, no store access. The engine
// effect owns reading and writing the record below.
//
// Phase 4 only enqueues and logs. Phase 6 drains.

import type { Watermark } from "./assess";
import type { Intent } from "./loop-machine";

/** The loop's own memory: how far it has read, and what it still owes.
 *
 *  ONE record holding both, rather than a key each. They are written by the same
 *  code at the same two points in a pass and read together at its start, so a
 *  split would only be a second thing to keep in step — a write that advanced
 *  the watermark without carrying the queue it was triaged from.
 *
 *  Story-scoped, like everything else Story Engine records. The watermark needs
 *  no help to survive an undo: `assess` treats a watermark naming a section the
 *  document no longer holds as no watermark at all, so undoing past it means the
 *  next pass re-reads rather than skips. */
export const ENGINE_LOOP_KEY = "kse-engine-loop";

/** The loop's persisted state, as the effect holds it in memory.
 *
 *  Two watermarks, because there are two readers. `watermark` is how far the
 *  fast pass has triaged; `reviewWatermark` is how far the review pass has
 *  read. The review trails the fast pass by up to `reviewEvery` paragraphs and
 *  never leads it. */
export type EngineRecord = {
  watermark: Watermark | null;
  reviewWatermark: Watermark | null;
  queue: Intent[];
};

/** Identity of the work, not of the request. Two triage passes naming the same
 *  entity are the same intent.
 *
 *  The switch is exhaustive with no `default`, so a new intent kind is a compile
 *  error here rather than a key that silently collides with an existing one. */
export function intentKey(intent: Intent): string {
  switch (intent.kind) {
    case "revise":
      return `revise:${intent.entityId}`;
    case "condense":
      return `condense:${intent.entryId}`;
    case "threadWrite":
      return `thread:${intent.threadId}`;
    case "admit":
      // By cast, not title: the model titles the same arc differently on
      // different reviews, and its cast is what makes it the same Thread.
      return `admit:${[...intent.entityIds].sort().join(",")}`;
    case "conclude":
      return `conclude:${intent.threadId}`;
  }
}

/** Append the incoming intents the queue does not already hold, oldest first.
 *  One exception to "first one wins": a `revise` carrying a settled fact
 *  replaces, in place, a queued `revise` of the same entity that carries none.
 *  Returns a new array; the queue passed in is never mutated. */
export function dedupe(existing: Intent[], incoming: Intent[]): Intent[] {
  const out = [...existing];
  const at = new Map(out.map((intent, index) => [intentKey(intent), index]));
  for (const intent of incoming) {
    const key = intentKey(intent);
    const index = at.get(key);
    if (index === undefined) {
      at.set(key, out.length);
      out.push(intent);
      continue;
    }
    const held = out[index];
    if (
      intent.kind === "revise" &&
      held.kind === "revise" &&
      intent.established &&
      !held.established
    ) {
      out[index] = intent;
    }
  }
  return out;
}
