// The intent queue's shape and its one rule: never queue the same work twice.
//
// Triage runs hot (§3.3) and will keep naming the same entity on consecutive
// passes until the work is actually done. Deduping on the way in is what keeps a
// single unresolved commitment from growing the queue without bound.
//
// Pure by construction — no api.v1, no promises, no store access. The engine
// effect owns reading and writing the two records below.
//
// Phase 4 only enqueues and logs. Phase 6 drains.

import type { Intent } from "./loop-machine";

/** Singleton records, read directly rather than through the index — see
 *  keyspace.ts. Branch-scoped: a queue built from one continuation's prose is
 *  meaningless on another, and a watermark is a position in a specific branch.
 *  Two keys, not one record: historyStorage is copy-on-write per key per node,
 *  and the watermark moves on every pass while the queue usually does not. */
export const WATERMARK_KEY = "watermark";
export const QUEUE_KEY = "queue";

/** The loop's branch-scoped state, as the effect holds it in memory. Persisted
 *  as the two records above, one key each. */
export type EngineRecord = {
  watermark: number | null;
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
    case "open":
      // The only free-text subject in the union — triage writes it, so the same
      // thread arrives spelled differently across passes.
      return `open:${intent.subject.trim().toLowerCase()}`;
    case "retire":
      return `retire:${intent.groupId}`;
    case "condense":
      return `condense:${intent.entryId}`;
  }
}

/** Append the incoming intents the queue does not already hold, oldest first.
 *  Returns a new array; the queue passed in is never mutated. */
export function dedupe(existing: Intent[], incoming: Intent[]): Intent[] {
  const seen = new Set(existing.map(intentKey));
  const out = [...existing];
  for (const intent of incoming) {
    const key = intentKey(intent);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(intent);
  }
  return out;
}
