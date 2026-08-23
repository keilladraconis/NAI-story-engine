// The one door through which every Engine write to a lorebook entry passes.
//
// Four things in a fixed order, and the order is the whole of the module:
//
//   1. READ the live entry. §5: a hand-edit made thirty seconds ago is simply
//      part of the input, and no Redux state claims authority over what an
//      entry currently says. This extends CLAUDE.md's DRAFT > LOREBOOK > STATE
//      across time as well as across surfaces. The door is the only reader, so
//      a caller cannot hand in a copy it fetched earlier — it is given the live
//      entry and produces its patch from that.
//   2. SNAPSHOT the original, write-once (§5.2). storyStorage, because it is
//      about the story as a whole and must not move with a branch.
//   3. WRITE the patch.
//   4. RECORD what was written, at the node the caller captured (§6.3).
//
// A third instance of the singleton-record pattern `intents.ts` describes —
// branch-scoped state the engine effect reads and writes directly through
// history-store, appearing in neither `toRecords` nor `applyRecords`, because
// it is not a store slice. Unlike `watermark` and `queue` there is one record
// per entry rather than one for the loop, since entries are touched
// independently and copy-on-write is per key per node (§6.2).

import { lorebookOriginalKey } from "../keys";
import { saveRecords } from "../store/persistence/history-store";

/** `lb:<entryId>` — §6.2. The prefix is what keeps it apart from `e:` and `t:`
 *  in the flat branch keyspace: entity ids, thread ids and lorebook entry ids
 *  are all UUIDs from one generator. */
export const lorebookRecordKey = (entryId: string): string => `lb:${entryId}`;

/** What the Engine last wrote to one lorebook entry.
 *
 *  **This record answers "what did we do", never "what does it say"** (§7). It
 *  is consulted in exactly one place — reconciliation, comparing the entry's
 *  live text against what we recorded writing, to decide whether our edit is
 *  still the top layer — and that question needs equality and nothing else.
 *
 *  So it carries a fingerprint rather than the text. Two reasons, and the first
 *  is the one that matters: a stored copy of the text COULD answer the second
 *  question, and anything that can be misused eventually is — read-then-write
 *  survives only while there is no cached copy of an entry to read instead. The
 *  second is that this record is copied onto every history node the Engine
 *  writes at (§6.2), and a fingerprint is forty bytes where an entry is
 *  thousands. */
export type LorebookWriteRecord = {
  /** Self-identifying, so an enumerated record needs no key parsing and a
   *  record found under the wrong key is detectable rather than trusted. */
  entryId: string;
  /** `fingerprintEntryText` of the text as the Engine wrote it. Named for what
   *  it is: nobody reaches for `textFingerprint` expecting content. */
  textFingerprint: string;
};

/** Which entry, and the node the caller captured when the work was dispatched.
 *
 *  `nodeId` is required, not optional. §6.3: two adjacent calls have been
 *  measured disagreeing about "current", and a generation-length gap is far
 *  worse — so no Engine historyStorage write omits its node, and the only way
 *  to make that structural is to refuse to default it. */
export type LorebookWriteTarget = {
  entryId: string;
  nodeId: number;
};

/** What the door did.
 *
 *  `written` and `record` are not the same question. A retire (§4.4) is
 *  `{ enabled: false }` — a real write with no text, so it is `written` with a
 *  null `record`: there is nothing for §7 to compare, and a record built from
 *  the text we did NOT write would tell reconciliation we own the writer's
 *  prose. */
export type LorebookWriteOutcome = {
  written: boolean;
  record: LorebookWriteRecord | null;
};

/** Produces the patch to apply, from the live entry it is handed. Returning
 *  null declines the write — a refused generation must not blank an entry. */
export type LorebookEdit = (
  live: LorebookEntry,
) => Partial<LorebookEntry> | null | Promise<Partial<LorebookEntry> | null>;

// ─────────────────────────────── the fingerprint ───────────────────────────────

/** Two FNV-1a lanes with independent bases and multipliers, plus the length.
 *
 *  QuickJS has no crypto, and none is needed: this answers "did this text
 *  change", not "is this text authentic". The length is carried separately
 *  because no hash collision can also fake a length, which turns the practical
 *  collision space from 2^64 into something no story reaches.
 *
 *  The failure direction is worth naming: a collision would make reconciliation
 *  believe the writer's edit is the Engine's own and bring it "in line with the
 *  branch" — overwriting their text. That is why this is two lanes and a length
 *  rather than one cheap hash. */
function fnv1a(text: string, basis: number, prime: number): number {
  let hash = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, prime) >>> 0;
  }
  return hash >>> 0;
}

/** The equality token for an entry's text.
 *
 *  `undefined` and `""` fingerprint the same: `LorebookEntry.text` is optional
 *  and an entry with no text says exactly what an entry with empty text says.
 *  Reading that difference as a hand-edit would leave reconciliation refusing
 *  to touch entries nobody has touched. */
export function fingerprintEntryText(text: string | undefined): string {
  const value = text ?? "";
  const a = fnv1a(value, 0x811c9dc5, 0x01000193);
  const b = fnv1a(value, 0x01000193, 0x85ebca6b);
  return `${value.length.toString(36)}:${a.toString(36)}:${b.toString(36)}`;
}

// ─────────────────────────────────── the door ───────────────────────────────────

/** Read live, snapshot once, write, record.
 *
 *  Everything the Engine writes to a lorebook entry goes through here — revise,
 *  condense, and the retire flag flip alike. A path that skipped it would skip
 *  the §5.2 snapshot, which is the one promise made to a writer whose lorebook
 *  is being edited by a machine.
 *
 *  **The snapshot is taken before the edit runs, not after.** The edit may be a
 *  multi-second generation, and taking the snapshot early means it exists even
 *  for a write that never lands. That is the safe direction: an early snapshot
 *  is never wrong — the entry still holds exactly the text it captured — while
 *  a late one is exactly the failure §5.2 exists to prevent.
 *
 *  **A failed write does not un-write the snapshot.** Write-once means once.
 *  Rolling it back would let a retry re-snapshot after the writer has edited,
 *  or — worse — after a write that threw but had already applied, capturing the
 *  Engine's own output as the writer's original. The cost of keeping it is a
 *  snapshot for an entry that was never changed, which restores to itself.
 *
 *  The error is rethrown rather than swallowed: the pass classifies failures
 *  (retryable or not) and the HUD reports them, and a door that reported
 *  success for a write that did not happen would also record one. */
export async function writeLorebookEntry(
  target: LorebookWriteTarget,
  edit: LorebookEdit,
): Promise<LorebookWriteOutcome> {
  const declined: LorebookWriteOutcome = { written: false, record: null };

  const live = await api.v1.lorebook.entry(target.entryId);
  // The writer deleted it. Recreating it here would resurrect exactly what they
  // removed, which is the same wrong as §6.2.1's uncovered ancestor record.
  if (!live) return declined;

  // Write-once as an API call, not as a read-then-write: `setIfAbsent` cannot
  // be raced, and a caller cannot get the check-then-set order wrong because
  // there is no order to get wrong.
  await api.v1.storyStorage.setIfAbsent(
    lorebookOriginalKey(target.entryId),
    live,
  );

  const patch = await edit(live);
  if (!patch) return declined;

  await api.v1.lorebook.updateEntry(target.entryId, patch);

  // A patch that set no text wrote nothing §7 can compare. See
  // `LorebookWriteOutcome`.
  if (patch.text === undefined) return { written: true, record: null };

  const record: LorebookWriteRecord = {
    entryId: target.entryId,
    textFingerprint: fingerprintEntryText(patch.text),
  };
  // Through `saveRecords`, whose node argument is required — the same reason
  // `LorebookWriteTarget.nodeId` is.
  await saveRecords(
    { [lorebookRecordKey(target.entryId)]: record },
    target.nodeId,
  );
  return { written: true, record };
}

// ────────────────────────────────── the readers ──────────────────────────────────

/** Persisted JSON is trusted no further than its shape — the same stance
 *  `readWatermark` and `readQueue` take in engine-loop.ts. A record that is not
 *  one reads as "the Engine has not written this entry", which costs a
 *  reconciliation and never a writer's text. */
function asRecord(value: unknown): LorebookWriteRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const { entryId, textFingerprint } = value as Partial<LorebookWriteRecord>;
  return typeof entryId === "string" && typeof textFingerprint === "string"
    ? { entryId, textFingerprint }
    : null;
}

/** What the Engine last wrote to one entry on this branch, or null. */
export async function readLorebookWriteRecord(
  entryId: string,
  nodeId: number,
): Promise<LorebookWriteRecord | null> {
  return asRecord(
    await api.v1.historyStorage.get(lorebookRecordKey(entryId), nodeId),
  );
}

/** Every entry the Engine has written on this branch (§7 walks all of them).
 *
 *  `list()` rather than the index, and deliberately: §6.2.1 makes the index
 *  authoritative for EXISTENCE because `remove()` cannot express a branch-local
 *  deletion. Nothing deletes an `lb:` record, so there is nothing for an index
 *  to be authoritative about — and `list()`'s ancestor inheritance is exactly
 *  the semantics wanted here, since a write made two nodes ago is still ours on
 *  this branch. Adding these ids to the index would put a lorebook concern in
 *  the record that governs the World's existence. */
export async function listLorebookWriteRecords(
  nodeId: number,
): Promise<LorebookWriteRecord[]> {
  const keys = (await api.v1.historyStorage.list(nodeId)).filter((key) =>
    key.startsWith("lb:"),
  );
  const values = await Promise.all(
    keys.map((key) => api.v1.historyStorage.get(key, nodeId)),
  );
  return values
    .map(asRecord)
    .filter((record): record is LorebookWriteRecord => record !== null);
}
