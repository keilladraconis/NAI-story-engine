# Engine Actions Implementation Plan — phase 6 of 6

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Engine acts. The four intents it has been logging since phase 4 —
revise, open, retire, condense — execute against the writer's lorebook; threads
become real entries carrying the forgetting detector phase 5 built and left
unattached; and history navigation reconciles what the Engine wrote.

**Architecture:** The pass gains a drain step after triage, spending the output
budget it reserved. Every lorebook write goes through one module that reads the
live entry first, snapshots the original once, writes, and records what it wrote —
so §7 reconciliation has something to compare and §5.2 has something to restore
from. Threads get bound to entries and a paragraph anchor, which is what finally
makes expiry and the arc pacing gate expressible.

**Tech Stack:** TypeScript (strict), Preact/JSX, vitest (`environment: "node"`),
NovelAI script API (`api.v1.*`), GenX generation queue.

## Global Constraints

- **Version stays `0.15.0`.** It was bumped once for this branch and the alpha
  lock pins the major at 0. **Do not touch `project.yaml`** — no prompt fields
  ever go there, and if a build rewrites `updatedAt`, revert **only that line**.
- **Alpha, no migrations.** Never write migration code. Defaulting a missing field
  is fine; converting an old shape is not.
- **Prompts live in `src/core/utils/prompts.ts`** as exported string constants.
  Never inline in a code file, never in `project.yaml`.
- **Engine settings are per-story storyStorage records** (`src/core/engine/settings.ts`),
  because `api.v1.config` is read-only. A new setting needs an entry in
  `ENGINE_DEFAULTS`, bounds with a justification, a `NUMERIC_SETTINGS` entry, and
  a control in `EngineSettings.tsx` — a setting reachable only by hand-editing
  storage is the defect phase 5 shipped for a whole task.
- **No `historyStorage` write omits its node argument** (§6.3). Capture
  `currentNodeId()` at dispatch time, pass it at flush time.
- **Never call `historyStorage.remove()` on a record key** (§6.2.1). It reads as
  "delete" and behaves as "revert to the parent branch's version". Deletion is an
  index write.
- **CLAUDE.md is binding**, in particular: no `updateParts`; never swap a
  component's _type_ at a fixed position; `onInput` not `onChange`; never dispatch
  in an input handler; `disabled` is not a re-entry guard; no tap debounce; no
  singletons.
- vitest collects `tests/**/*.test.ts` only — **`.tsx` is never collected**. Static
  source scans are the established substitute (`tests/ui/countdown.test.ts`,
  `text-input-events.test.ts`, `thread-source.test.ts`).
- `npm run format` runs a `preformat` guard against a pinned prettier. If it
  rewrites files you did not touch, the formatter is wrong — do not commit that diff.
- Verification for every task: `npm test && npx tsc --noEmit && npm run build && npx prettier --check .`
- **CHANGELOG.md is Task 8's.** Do not edit it before then.

## Two decisions already made

**Phase 6 ships execution, not surfaces.** The §5.2 write-once originals are
written from day one so nothing is lost, and the `lb:<entryId>` records are
written so reconciliation works — but there is **no review list and no restore
button** this phase. The HUD's counts become non-zero and the script log carries
the detail. A writer's recourse this phase is the editor's own undo, which now
moves the World with it (phase 2). Building the §5.1 review surface is a later
phase's job; do not start it here.

**The thread anchor is a paragraph index.** Both deferred features are specified
in paragraphs (expiry is 25/100/300 in `THREAD_EXPIRY_PARAGRAPHS`; the pacing gate
is a `paragraphCount` equation), `assess` already counts paragraphs, and a
paragraph index compares against the branch's own count so undo moves it
correctly. No wall clock.

## File structure

**New:**

- `src/core/engine/lorebook-write.ts` — the one door to a lorebook write. Read live,
  snapshot once, write, record. Everything in Tasks 2–4 goes through it.
- `src/core/engine/execute.ts` — the drain: pick the next intent the budget affords,
  run it, report. One place that branches on `intent.kind`.
- `src/core/engine/reconcile.ts` — §7's compare-and-decide, pure.
- `src/core/engine/thread-bind.ts` — thread ⇄ lorebook entry: create, condition,
  rebuild triggers.

**Modified:** `src/core/store/effects/engine-loop.ts` (the pass gains a drain),
`src/core/engine/settings.ts` (condense threshold), `src/core/utils/prompts.ts`
(revise, condense, open), `src/core/engine/assess.ts` (entry-length trigger),
`src/core/store/slices/world.ts` (the anchor), `src/core/utils/lorebook-strategy.ts`
(export `resolveDisplayName`).

---

### Task 1: The write door

**Files:** create `src/core/engine/lorebook-write.ts` + test; modify
`src/core/keys.ts` if a new storyStorage key constant is needed.

Every Engine write to a lorebook entry goes through this module. It owns four
things in a fixed order:

1. **Read the live entry** (`api.v1.lorebook.entry(id)`). §5 is explicit: a
   hand-edit made thirty seconds ago is simply part of the input, and no Redux
   state claims authority over what an entry currently says.
2. **Snapshot the original, write-once** (§5.2). storyStorage, because it is about
   the story as a whole and must not move with a branch. Write-once means the
   _first_ time the Engine touches an entry, ever — a second snapshot would
   overwrite the writer's actual original with the Engine's own earlier output.
   Decide what happens when the snapshot write succeeds but the entry write then
   fails, and justify it.
3. **Write** (`api.v1.lorebook.updateEntry`).
4. **Record what was written** as `lb:<entryId>` in historyStorage at the captured
   node (§6.2). Task 7 compares this against the live entry, so its shape is a
   contract: it must answer "is our edit still the top layer?" and nothing more.
   §7 is explicit that this record is consulted to answer _what did we do_, never
   _what does it say_.

**Interfaces — AS BUILT.** Task 1 has landed; these are the real signatures.

```ts
export async function writeLorebookEntry(
  target: { entryId: string; nodeId: number },
  edit: (live: LorebookEntry) => Partial<LorebookEntry> | null | Promise<...>,
): Promise<{ written: boolean; record: LorebookWriteRecord | null }>;

export async function readLorebookWriteRecord(entryId, nodeId): Promise<LorebookWriteRecord | null>;
export async function listLorebookWriteRecords(nodeId): Promise<LorebookWriteRecord[]>;
export function fingerprintEntryText(text: string | undefined): string;
export const lorebookRecordKey = (entryId: string) => `lb:${entryId}`;
```

**It takes a producer callback, not finished text**, and a `Partial<LorebookEntry>`
patch, not a string. The original brief said "the new text", which was wrong twice:
a caller holding finished text must already have read the entry (defeating §5's
read-then-write), and a text-only door cannot carry the retire flag flip. The door
hands the live entry _to_ the caller and takes its patch back, so there is no way to
write through it without having been given what the entry currently says. Returning
`null` declines the write — which a refused generation needs, or a refusal blanks an
entry. The `lb:` record stores a **fingerprint, not the text**, so nothing can read
the record to answer "what does it say"; §7's question is pure equality.

Read `src/core/store/persistence/history-store.ts` for how this codebase reaches
historyStorage, and `src/core/engine/intents.ts` for the singleton-record pattern
(`watermark`, `queue`) this is a third instance of.

---

### Task 2: Drain, and the free action

**Files:** create `src/core/engine/execute.ts` + test; modify
`src/core/store/effects/engine-loop.ts`, `src/core/engine/loop-machine.ts` if the
machine needs to carry what was executed.

The pass currently logs every intent and clears the queue. Now it **executes,
then clears** — and the comment at the clear site already says so; read it, it
explains why the queue is written before the drain.

**Retire is the whole of this task's action work**, deliberately. §3.3 prices it
at **0 output tokens** — it is the `{enabled: false}` flag flip §4.4 describes — so
the executor's skeleton can be proven end to end without
touching the budget arithmetic that Tasks 3 and 4 depend on. §4.4's reasoning
matters and belongs in a comment: the model is never _told_ a plot is over,
because that spends context asserting a negative; the reminder is simply removed.

**Retire goes through Task 1's door** — `writeLorebookEntry(target, () => ({ enabled:
false }))`, never `api.v1.lorebook.updateEntry` directly. An earlier draft of this
plan described a text-only door, which retire could not pass through; that would
have left a disabled entry with no §5.2 snapshot, so a later revise would snapshot
it with `enabled: false` recorded as the writer's original and a restore would leave
their entry switched off.

**The budget is the hard part.** §3.3: triage costs ~150, an entry rewrite up to
1024, and the bucket is 2048 per 240s. The pass already reserves the triage call
before spending it. The drain must decide what it can afford **before** starting,
and `getAllowedOutput()` is the reading. One intent per pass or several is a real
decision — justify it against §3.3's "one entry rewrite, or several cheap actions,
but not both."

**Also in this task: the `waiting_for_user` gap** (§14.1, deferred from phase 4).
A triage call that GenX blocks on _input_ budget can leave the queue in
`waiting_for_user`, which the header renders as a "Continue" widget — and §3.5 is
explicit that a background loop has no business demanding a Continue click. The
Engine's pre-check is output-only. §14.1 says the fix is a question about how the
Engine's tasks are queued in GenX rather than a patch to the pass. Read
`node_modules/nai-gen-x` before deciding, and remember phase 4 found that GenX
registers `onGenerationRequested` in its constructor and retries refusals itself
(we pass `maxRetries: 0`). If the honest answer is that it cannot be fixed without
an upstream change, say so and make the failure visible instead.

---

### Task 3: Revise

**Task 2 handoff.** `drain(queue, deps)` and `execute(intent, deps)` exist;
`DrainDeps` is `{dispatch, getState, nodeId, log}` and **you must add `genX: GenX`
to it** and thread it from `createEnginePass` — Task 2 left it out rather than ship
a dead field. `INTENT_MAX_TOKENS` already prices revise at 1024 and the per-intent
budget check already enforces it, so your arm inherits the pacing; do not
re-implement it. `execute` returns `"executed" | "skipped"`, and `executed` is what
`LoopState.touched` reads — Task 3 is its first writer, so the "Always 0 until
phase 6" comment in `loop-machine.ts` is yours to correct.

**Files:** modify `src/core/utils/prompts.ts`, `src/core/engine/execute.ts`;
create a strategy module if the shape warrants it; tests.

`{ kind: "revise", entityId }` rewrites that entity's lorebook entry to carry what
the story has newly made true. Up to 1024 output tokens.

Read `src/core/utils/lorebook-strategy.ts` — `buildLorebookContentStrategy` is the
existing full-entry-rewrite path and this should not invent a second idiom for the
same job. Note `LOREBOOK_CONTENT_MAX_CALLS` and the continuation behaviour the
0.14.0 changelog describes ("generated text no longer stops mid-sentence"); a
revision that truncates mid-word is the same defect.

**Read-then-write is not optional** (§5) and Task 1's door owns it — do not read the
entry yourself.

**The existing pipeline cannot be reused as-is, and this is the task's main design
problem.** `createLorebookContentFactory` reads the live entry _itself_, inside the
message factory (`lorebook-strategy.ts:120`), and the completion handler then writes
`updateEntry` **directly** (`effects/handlers/lorebook.ts:98` and again at `:107` for
keys). A revise built on that path bypasses the door entirely — no §5.2 snapshot, no
`lb:` record, so §7 has nothing to reconcile and §5.2's promise is silently broken
for exactly the writes the Engine makes on its own.

You must pick one and justify it: route that handler's write through
`writeLorebookEntry`, or give the Engine a strategy that **returns** text to its
caller instead of self-writing. Routing the shared handler affects the hand-driven
Generate Content button too — decide whether that is a bug fix (those writes get
snapshots as well) or a scope increase, and say which.

§5's other claim to honour: **consequences are revisions, not threads.** A
character dying is a permanent fact belonging in that character's own entry, keyed
on their name. The prompt should make that distinction do work rather than restate
it — a revision that reads like an event log instead of a description of a subject
is the failure mode.

---

### Task 4: Condense, and the threshold that triggers it

**Task 3 handoff.** `DrainDeps` is now `{dispatch, getState, nodeId, newText, genX,
log}` — `newText` as well as `genX`, because an entry rewrite is a function of what
the story newly made true and the drain cannot derive that. Reuse from Task 3:
`buildLorebookPrefillFromEntry`, `composeRevision`'s truncation contract (**trim,
never continue** — the hand path's `LOREBOOK_CONTENT_MAX_CALLS = 4` would spend 4096
out of a 2048/240s bucket), the door, and `"instruct"` (see §8's phase-6 correction —
same reasoning, same answer). **Do not** reuse `buildLorebookContentPayload`; what is
reusable is the entry-text conventions, not the strategy. An earlier draft of this
plan said "do not invent a second idiom" while pointing at a path Task 3 then proved
unusable — that tension is resolved this way.

**A condense counts as touched.** `revisionsIn` currently filters `kind === "revise"`
only, and Task 3 left the question open. §9.1's slot is "activity level" and a
condense is an entry rewrite the writer would want to know happened; count it, and
widen `revisionsIn` rather than adding a second counter.

**Files:** modify `src/core/utils/prompts.ts`, `src/core/engine/settings.ts`,
`src/ui/panels/setup/EngineSettings.tsx`, `src/ui/panels/setup/engine-settings-model.ts`,
`src/core/engine/assess.ts`, `src/core/engine/execute.ts`; tests.

Two halves.

**The setting and the trigger.** §5.1: an entry's length is measurable in `assess`,
which is free, so an entry crossing a size threshold enqueues a condense intent
**directly** — triage is never spent noticing that something is long. The threshold
is an Engine setting (see Global Constraints for everything a new setting needs;
phase 5 shipped one with no control and that must not repeat). Justify the default
and the bounds; §4.3's `THREAD_RANGE_CHARS` and `PARAGRAPH_CHARS` in
`thread-horizon.ts` are the house precedent for reasoning about sizes in characters
against a ~400-character paragraph.

**The action.** Same price as a revision, same read-then-write, same write door,
same `lb:` record — §5.1 says so explicitly, so it must not diverge.

**The prompt carries the phase's one real risk.** §5.1: _condensing is the one
action that can lose information._ Every other action adds, retires, or flags; a
bad condense silently drops a fact the story established and nothing downstream
would notice. The spec's own answer is a prompt **biased toward retention over
brevity** — a compaction, not a summary. Facts survive; repetition, superseded
detail, and accumulated hedging do not. Write it that way and say in your report
what you think its worst failure looks like.

---

### Task 5: Open — binding, condition, anchor

**Files:** create `src/core/engine/thread-bind.ts` + test; modify
`src/core/store/slices/world.ts`, `src/core/store/types.ts`,
`src/core/store/persistence/keyspace.ts`, `src/core/utils/lorebook-strategy.ts`,
`src/core/engine/execute.ts`; tests.

This is the task phase 5 was building toward. Three things land together.

**Binding.** `threadLorebookEntrySet` has never had a caller. `{ kind: "open",
subject }` creates a thread and its lorebook entry. Read the entity `castAllRequested`
path in the effects for how this codebase creates an `SE:` category entry, and
`ensureCategory`. §4.5's cap applies — and note the reducer displaces on
`threadCreated`, which is the programmatic path, so opening at the ceiling is
exactly the case the cap was designed for.

**The condition.** `buildThreadCondition` (phase 5, `thread-condition.ts`) finally
gets wired. It takes `ThreadMember[] = {id, displayName}[]` — deliberately not
`WorldEntity[]`, so passing the world is a compile error. The names must be
**resolved** through `DRAFT > LOREBOOK > STATE`: `resolveDisplayName` in
`lorebook-strategy.ts` is the canonical implementation and is currently
**module-private** — export it rather than reimplementing the order.

The condition depends on `title`, `entityIds` and `horizon`, so it must be rebuilt
on `threadRenamed`, `threadMemberToggled` and `threadHorizonSet`. That is phase
5's explicit handoff. Decide where the rebuild lives — an effect, presumably — and
make sure a rename cannot leave a detector probing the old name.

**The anchor.** `Thread` gains a paragraph index recorded when the Engine opens or
renews a thread. It rides the `t:<id>` history record, so `keyspace.ts` needs no
new key — but `applyRecords` defaults it, the way it now defaults `horizon` and
`status`. Decide what "renews" means and justify it. A thread the writer creates by
hand needs a sensible initial value; think about what it should be and why, given
that expiry is a destructive verdict (`isThreadExpired` declines on a count it
cannot trust — read its comment).

---

### Task 6: Expiry and the arc pacing gate

**Task 5 handoff.** `DrainDeps` now carries the whole `Assessment` (not `newText`),
and `Assessment` gained `paragraphCount` — which counts **every** section, unlike
`backlog`, which filters blank ones; the anchor must be comparable with NovelAI's
own `paragraphCount` condition variable, which will not be skipping blanks.
`paragraphsSinceTouched = assessment.paragraphCount - thread.anchorParagraph`.

**`anchorParagraph` is `number | null`, and null must decline at your callsite.**
`isThreadExpired`'s guard catches non-finite and negative only; a hand-created thread
has no anchor because the World's "+" and the Forge dispatch synchronously with no
paragraph count available, and a defaulted 0 would read as "abandoned since paragraph
0". Branch on the null deliberately.

**Task 5 verified the equation grammar for you**: `terms` accept a literal `value`
and `target` accepts a number, so `paragraphCount - <anchor literal> >= N` _is_
expressible and the anchor does make a per-thread left-hand side possible. But that
bakes the anchor into the stored condition, which makes `threadAnchorSet` a **fourth
rebuild trigger** — extend `registerThreadConditionEffects` in `thread-bind.ts`
rather than writing conditions from a second place.

**Files:** modify `src/core/engine/execute.ts` or the pass, `src/core/engine/thread-condition.ts`; tests.

Both were deferred for the anchor Task 5 adds.

**Expiry** (§4.5): `isThreadExpired` has a policy and no caller. Give it one. It
takes `paragraphsSinceTouched` — derive that from the anchor and the branch's
current paragraph count. Decide what expiry _does_: §4.5 says an abandoned end
"ages out", and §4.4 says retirement is a flag flip. Whether an expired thread is
retired, deleted, or merely offered to triage is a real choice with different
risks — justify it. Note that `isThreadExpired` deliberately declines on a
non-finite or negative count, and that a thread created before the anchor existed
will have a defaulted one.

**The arc pacing gate** (§4.3): `paragraphCount` equations pace arc-horizon
threads. Phase 5 deferred this because a global stripe (`paragraphCount % 20 < 3`)
fires every arc thread in the same paragraphs and cannot say "since this thread
last fired" — the anchor is what makes a per-thread left-hand side possible.
Verify that claim against `LorebookAdvancedConditionEquation` in
`external/script-types.d.ts` before building: if the equation grammar cannot
express what the anchor makes conceptually possible, **say so and stop** rather
than shipping the global stripe phase 5 rejected.

---

### Task 7: Reconciliation

**Files:** create `src/core/engine/reconcile.ts` + test; modify the history
navigation handler (`src/core/store/effects/history-sync.ts`), tests.

§7, and phase 5's review promoted it from a nicety to a requirement: a displacement
is free only while there is no entry behind the thread, and Task 5 puts one there.

`historyStorage` reverts what the Engine _believes_; the lorebook is global story
state and does not revert what the Engine _did_. On `onHistoryNavigated` (whose
`nodeId` arrives as a `number` despite the `.d.ts` declaring `string` — see
`src/type-overrides.d.ts` and §12.1):

1. Reload branch-scoped slices at the new node — **already built** in phase 2.
2. Recompute the watermark — **already built**.
3. **New:** for each `lb:<entryId>` record, compare the entry's live text against
   what we recorded writing. **Matching** means our edit is still the top layer and
   can be brought in line with the branch. **Differing** means the writer has
   edited since, and we leave it alone.

Keep `reconcile.ts` pure — the decision, not the I/O. §7 is explicit that the
stored copy answers "what did we do", never "what does it say", so read-then-write
survives.

**Task 5 handoff: a thread entry never gets an `lb:` record.** Creation bypasses the
door deliberately (a create has no live text to read and no original to snapshot),
and the condition rebuild writes no text. So §7 sees thread entries only through the
retire flag flip — which is exactly the nullable-`enabled` question below, and it is
now the _only_ way reconciliation can see a thread entry at all. The displaced-thread
orphan is real as of Task 5 and is logged by id.

**Recompute `touched` from the `lb:` records.** §9.1 calls it "entities revised on
this branch"; as built it is a session count that survives a branch switch, dies on
reload, and does not move with undo. You are already walking
`listLorebookWriteRecords(nodeId)` at every navigation, so the branch-truthful number
is free here. In scope.

**Key off the `lb:` record, never the snapshot.** Task 1 takes the §5.2 snapshot
_before_ the edit runs, deliberately — so a revise whose generation was refused or
unusable leaves a storyStorage original for an entry that was never modified.
Harmless for restore (it restores to itself), but it means "has a snapshot" is not a
proxy for "the Engine has touched this entry". The record is.

**Decide, consciously, whether the retire flag flip is reconcilable.** A retire
writes no text, so Task 1 records no fingerprint and §7 has nothing to compare —
undo past a pass that retired a thread and the `t:` record reverts (the thread is
open again) while its lorebook entry stays disabled. That is precisely the "the
lorebook does not revert what the Engine _did_" problem §7 exists to solve, and §7's
text does not notice it. Task 1 deliberately left the record text-only rather than
setting this policy for you; widening it to carry a nullable `enabled` is a
five-line change if you want the flip reconciled.

**Also handle the displaced-thread orphan** (§4.5): a thread the cap displaced
leaves an entry that is unmanaged and still enabled. §5.2 forbids deleting it.
Decide what reconciliation does about it and justify — the spec says only that
this is where the answer lives.

---

### Task 8: Changelog and spec

**Files:** `CHANGELOG.md`, the design spec.

The writer-facing story: **the Engine now acts.** It is still off by default; when
switched on it will rewrite lorebook entries, open and retire Threads, and condense
entries that have sprawled.

Say plainly, because each is a way a writer could be surprised:

- **It edits your lorebook.** The original text of any entry the Engine touches is
  snapshotted first and kept, but **there is no restore button this release** — the
  recourse is the editor's own undo, which now moves the World with it.
- **Condensing can lose information.** It is the one action that removes rather
  than adds, and it is the one to watch.
- Threads now get real lorebook entries, and those entries stay quiet while the
  story is still mentioning them.

Then **§14.3, "Phase 6 as built"**, in the shape §14.1 and §14.2 use: what the
phase does, what it deliberately does not (the review and restore surfaces), and
where the build corrected the document. Read §14.1 and §14.2 first — several
corrections are already recorded and must not be re-recorded.

Do **not** bump `project.yaml`.

---

## Verification

```bash
npm ci && npm test && npx tsc --noEmit && npm run build && npx prettier --check .
```

Then in a **scratch story**, with the Engine switched on at Setup → Engine:

1. Write past the minimum, let a pass run. The HUD's `∆` leaves 0 for the first
   time.
2. An entity the prose changed has its lorebook entry rewritten, and the entry's
   original is recoverable from storage (inspect it; there is no UI this phase).
3. A commitment the prose raises opens a Thread **with** a lorebook entry, and that
   entry carries an advanced condition.
4. Keep mentioning its subject: the entry does not fire. Stop mentioning it for
   long enough: it fires.
5. Resolve it in the prose — the Thread is marked satisfied and its entry disabled.
6. Undo past a pass. The entry the Engine rewrote is brought back in line; an entry
   you hand-edited after the Engine wrote it is left alone.

## Out of scope

- **The §5.1 review list and the §5.2 restore control.** Snapshots and records are
  written this phase; reading them back through a UI is a later phase.
- **Migrating anything.** Alpha.
