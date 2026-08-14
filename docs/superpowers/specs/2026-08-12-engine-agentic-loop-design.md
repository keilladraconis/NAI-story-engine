# The Engine — an agentic loop that lives alongside the writer

**Status:** design approved, not yet planned
**Target version:** 0.15.0
**Branch:** `claude/story-engine-agentic-loop-ti2pgk`

## 1. What this is

A minimal agentic loop that fires while the writer works, reads the prose produced
since it last looked, and maintains the World against it. It does four things:

1. Revises lorebook entries the story has made wrong.
2. Opens entries for narrative commitments the model is likely to forget.
3. Retires those entries once the story satisfies them.
4. Condenses entries that revision has let sprawl.

It exists to repair a specific, observed model failure. Xialong (and LLMs
generally) will happily carry a scene to its conclusion, but drop commitments
quickly — a Chekhov's gun introduced two scenes ago, a character's death, an item
spent or destroyed. The fix is to keep those open commitments in context until the
story settles them.

### 1.1 What it deliberately is not

**Not a short-term memory system.** Opus-tier subscribers have Xialong at roughly
28k context, which covers recent prose adequately. Rebuilding short-term memory
would duplicate the native window.

**Not a bullet-list digest injected into Memory.** Extracting character and
location facts to a bulleted list is redundant with the lorebook, and list-shaped
prose sitting in context risks polluting the model's writing style. The lorebook
already solves persistent recall; the gap is _activation_, not storage.

**Not a second author.** The Engine writes change, never invention. It records what
the prose has made true; it does not decide what happens next.

### 1.2 Who it serves

The Engine is for the writer steering an **autonomous story** — generating, then
guiding with small revisions and undos. Its trigger is anchored to generation
(§3.1) precisely because that is the population it should reach.

A writer composing prose by hand is very likely curating their own lorebook
already, and an Engine that woke up and started revising entries alongside them
would be competing with them rather than helping. So the Engine not firing for
hand-written prose is a **positioning decision, not a gap**: no idle fallback tick,
no background sweep. Someone hand-writing who does want a pass can ask for one
(§9.1), and asking is the appropriate amount of friction for a writer who is
already in their own lorebook.

## 2. Division of labour: Forge vs Engine

The Forge and the Engine both write World entities, and the boundary between them
is tense, not territory.

|              | Forge                                           | Engine                                    |
| ------------ | ----------------------------------------------- | ----------------------------------------- |
| when         | before the story starts, or on demand mid-story | continuously while writing                |
| writes       | **setup** — root facts, standing pressure       | **change** — what the prose has made true |
| may assert   | situations, complications, no outcomes          | outcomes, consequences, resolutions       |
| triggered by | the writer, explicitly                          | generation activity, automatically        |

The Forge's existing no-outcomes discipline (`src/config/field-definitions.ts:155`)
is what keeps these from colliding. The Forge establishes what is unsettled; the
Engine records how the story settles it.

## 3. The loop

### 3.1 Trigger

`onGenerationRequested` with `scriptInitiated: false` schedules a **one-shot wakeup**
a configurable delay later. When the wakeup fires, the loop runs a pass if there is
at least a configurable minimum of unobserved prose.

If a wakeup is already pending, a further generation does **not** reschedule it. The
loop therefore fires at most once per delay window, anchored to the first generation
of a burst — no stacking, and no starvation for a writer who generates faster than
the delay.

The `scriptInitiated` filter is load-bearing: without it the Engine's own
generations would re-arm the wakeup and drive themselves in a loop.

The delay and the prose threshold are new `project.yaml` entries, joining the
thread cap (§4.5, default 8) and the condense threshold (§5.1). This is consistent
with the prompt policy in CLAUDE.md: `project.yaml` carries runtime settings only,
never prompts. The triage prompt and every other Engine prompt is an exported
constant in `src/core/utils/prompts.ts`. Per §9.2 these settings are surfaced in the
Setup tab rather than left in NovelAI's script config.

**Why a delay from generation start**, rather than tracking whether one of the
writer's generations is currently in flight. The delay lands the pass in the window
of greatest utility — the writer is watching tokens stream in, or reading what
arrived — which is also the window where FlagB is freshest and buckets are
releasing. More importantly, a tracked in-flight window is a persistent flag that
can fail to close: one missed `onGenerationEnd` and the Engine is gated off
permanently and silently, with nothing in the UI to explain why. A timer has no
such state. Its worst failure is being mistimed, which costs nothing and corrects
itself.

**A wakeup can land mid-stream, and that is fine.** The backend lock is held while
the writer's tokens are streaming, so an early wakeup is refused — but a refusal is
free and the retry backoff in §3.4 simply lands the pass as the generation
completes. The delay can therefore be chosen for where the pass is most useful
rather than defensively sized to clear a worst-case generation.

Implementation note: follow the cancellation-flag pattern in
`src/core/store/effects/autosave.ts` rather than storing timer ids —
`api.v1.timers.setTimeout` returns a `Promise<number>`, which makes the id awkward
to hold and clear.

**There is no idle or fallback tick.** Prose written by hand produces no hook and
therefore no wakeup, and that is deliberate — see §1.2. The manual trigger in §9.1
covers the case where such a writer does want a pass.

`onGenerationRequested` is documented at `external/script-types.d.ts:3989`. The
project currently registers exactly one hook (`onHistoryNavigated`,
`src/core/store/effects/bootstrap-effects.ts:171`), so this surface is otherwise
unused.

### 3.2 Per-firing state machine

```
assess ──▶ triage ──▶ enqueue ──▶ drain ──▶ idle
  │          │                      │
  └─(free)   └─(~150 tok)           └─(up to 1024 each, budget-governed)
```

- **assess** — pure string work, no generation. Is there enough new prose to
  bother? Which entities are plausibly in play (name and key matching against the
  new sections)? Which entries have grown past the condense threshold (§5.1)?
  Produces the manifest for triage, enqueues condense intents directly, and can
  terminate the firing at zero cost.
- **triage** — one small instruct generation over new prose plus a compact
  manifest (entity names, one-line summaries, open threads). Answers only _what
  needs attention_: this entry is now wrong, this is a new commitment, this
  commitment looks satisfied. Most firings on quiet prose return nothing.
- **enqueue** — triage output becomes intents in a persisted queue.
- **drain** — execute intents while budget permits.

The machine is a pure reducer over (state, event) so it can be table-tested
headless.

### 3.3 Pacing

The only genuinely scarce resource is **output tokens: 2048 per 240 seconds**,
released FIFO and gated by FlagB. Input tokens are bucketed far more generously and
benefit from caching.

| step                      | output cost                             |
| ------------------------- | --------------------------------------- |
| assess                    | 0 — no generation                       |
| triage                    | ~150                                    |
| retire a satisfied thread | 0 — `updateEntry(id, {enabled: false})` |
| open a thread             | ~150                                    |
| revise an entity entry    | up to 1024 — a full lorebook rewrite    |
| condense an entry         | up to 1024 — a full lorebook rewrite    |

At a writing cadence of one generation every 40–60s, that is four to six firings
per bucket. Triage at every firing costs 600–900 tokens, leaving roughly 1150–1450
— **one entry rewrite, or several cheap actions, but not both.**

That asymmetry is the whole shape of the pacing. A revision or condense is a full
lorebook entry rewrite and can consume half the bucket on its own, while triage,
opening a thread, and retiring one are cheap or free. So entry rewrites are the
scarce operation and everything else is nearly incidental.

**Therefore: triage runs hot, actions run cold.** This is not merely affordable, it
is the correct asymmetry. A commitment never noticed is lost permanently, whereas a
queued action is safe indefinitely — a thread's condition does not fire until its
subject has gone unmentioned for thousands of characters, so creating the entry
three paragraphs late costs nothing. Prose does not un-happen, so a queued intent
does not go stale.

**Drain rate is budget-governed, not fixed.** Drain while `getAllowedOutput()` stays
above a reserve sufficient for the next triage. This makes the scarce resource its
own regulator: generating hard keeps the loop out of the way, pausing to read lets
it catch up. A fixed rate does neither — it overprocesses when idle and falls behind
when the writer is fast.

The reserve only has to cover actual consumption. Refused requests are free
(§12.0), so a lost race costs latency rather than budget and the figures above are
expected costs only.

**Retiring a satisfied thread never queues**, because it costs zero output
tokens. The action that most protects context health is free.

### 3.4 Colliding with the writer

The backend refuses concurrent requests, but the constraint is **time-gated rather
than an absolute lock** — a short-lived key that expires on its own, not a shared
lock requiring reconciliation. Collisions are therefore self-clearing and
detectable after the fact. They are not, however, _cheap_ — see §12.0.

Avoidance is entirely the timing of the wakeup (§3.1). The loop holds **no state
about whether the writer is busy** — no in-flight flag to open and close, and no
pre-emptive cancellation of the writer's request. Both were considered and both
were rejected for the same reason: they add persistent state or an unreliable abort
in exchange for avoiding a failure that is already transient, and a flag that fails
to close would gate the Engine off permanently and silently.

So the loop simply fires when its wakeup says to, and handles refusal after the
fact: swallow the error, keep the intent queued, carry on.

**A refusal costs nothing** — see §12.0. It was briefly charged its full
`max_tokens`, which would have made retry actively harmful, but that was a defect
and has been fixed upstream. A refused request performs no work and is debited
nothing.

Three rules follow.

**Retry with bounded backoff.** A refused request waits a short, growing interval
and tries again, a small fixed number of times, before the intent is requeued for
the next wakeup. Since a refusal is free, the only cost of retrying is latency, and
the thing being waited on — the writer's generation finishing — typically clears in
seconds. The bound matters more than the interval: a long passage should hand the
work back to the next wakeup rather than let one firing spin against a lock that is
still held.

**This makes the delay in §3.1 forgiving.** A wakeup that fires mid-stream is no
longer a wasted pass; it is refused, backs off, and lands as soon as the writer's
generation completes. The loop effectively rides the end of that generation without
needing the delay tuned precisely, so the delay can be chosen for where it is most
_useful_ rather than where it is safest.

**Classify conservatively anyway.** The refusal is a bare `Error` with
`message: "A generation is already in progress"` and no status code or subclass, so
message matching is the only option available. Failures the classifier does not
recognise are still treated as non-retryable — not because a retry is expensive now,
but because retrying an unrecognised failure is unlikely to help and the attempt
bound is the real guard against spinning.

**`max_tokens` stays tight per step** — not for correctness now, but because it
bounds actual consumption and keeps the pacing arithmetic in §3.3 honest.

**Collisions are normal, not exceptional.** They are never surfaced to the writer —
no error state, no HUD warning (§9.1). Only a persistent inability to make progress
is worth showing.

`createCancellationSignal()` (`external/script-types.d.ts:2495`) is still wanted, but
for the writer explicitly stopping the Engine and for abandoning work when they go
idle — not for collision avoidance.

### 3.5 FlagB as a safety property

Buckets release only when FlagB flips, and FlagB flips on user action — firing a
story generation, clicking a UIPart button or a JSX clickable. The loop's own
generations are script-initiated and do not flip it.

Two consequences, both desirable and both free:

- An Engine centred on story-generation events naturally clears its own buckets.
- If the writer stops, the loop goes quiet on its own. It cannot run away in the
  background burning buckets on a story nobody is touching.

Work still queued when the writer goes idle is **abandoned**, not held. A background
loop has no business demanding a Continue click.

## 4. Threads

### 4.1 The concept

**Threads keep their name; their role grows.** A Thread's purpose was always to keep
a cluster of entities warm in context so the editor's model could reach for them. It
achieved that with blanket always-on, because that was the only instrument
available. The negated-key condition (§4.3) is the same intent with a trigger that
fires _when the cluster has actually gone quiet_ — precisely the moment the old
always-on was paying for. So this is not a new concept displacing Threads; it is
Threads with the blunt trigger removed and a lifecycle added.

`WorldGroup` is deleted and `Thread` replaces it. Because the two never coexist, the
name carries forward without ambiguity, and the continuity is honest — a writer's
existing mental model of Threads still applies, just with more behind it.

The `[THREAD]` verb in the Forge's command grammar
(`src/core/utils/crucible-command-parser.ts`) is unchanged for the same reason.
Renaming it would read worse and risk confusing a model that has been prompted
against that vocabulary throughout.

```ts
interface Thread {
  id: string;
  title: string;
  text: string; // the reminder prose
  horizon: "arc" | "plot" | "point";
  entityIds: string[]; // the cast it drags into context
  lorebookEntryId?: string;
  status: "open" | "satisfied";
}
```

`horizon` carries the scale distinction rather than splitting into three
categories. Arc, plot, and unresolved point differ in scope and lifetime, not in
kind — all three are "something is open and wants closing." Three categories would
mean three prompts, three sidebar sections, and permanent misfiling arguments about
whether a hidden letter is a plot or a point. One category with a horizon attribute
drives the behavioural differences that genuinely exist: condition range, whether it
gets a pacing gate, and how eagerly triage proposes retiring it.

`entityIds` is load-bearing, not inherited baggage. It is what lets a thread build
its condition from its participants' own keys, and what makes the `lore` condition
usable — remind about the unsettled succession only when a member of the Inner
Circle is on stage. A bare unresolved detail is the degenerate case with one member
or none.

### 4.2 Threads are not Narrative Vectors

Narrative Vectors (`FieldID.SituationalDynamics`, labelled "Narrative Vectors")
stay exactly as they are. A Vector is standing pressure with explicitly "no
outcomes, no predictions," authored by the Forge before the story runs. A Thread
is an emergent commitment with a terminus, authored by the Engine while the story
runs. Different tense, different author, different lifetime.

### 4.3 Activation: conditions, not keys

Plain keyword keys are **structurally wrong** for this job. A dropped Chekhov's gun
goes unmentioned; an entry keyed on "pistol" therefore never fires, so the thing
whose symptom is absence can never trigger on presence.

`LorebookEntry.advancedConditions` (`external/script-types.d.ts:308`) supports
composable `and` / `or` / `not`, key-presence searches scoped to `story` within a
character range, another entry being active, and equations over `paragraphCount` /
`characterCount` / `currentStep`. The core construction is:

```
not( key <subject> in ['story'] within range N )
```

A **forgetting detector**: silent while the thread is alive in the prose, injecting
precisely when the model has stopped carrying it. This inverts the cost model —
threads are free while they are being honoured, and only spend context when they
are being neglected.

Supporting constructions:

- `range` scales with `horizon` (a point decays fast, an arc slowly).
- `{type: "lore", entryId}` gates a thread on a participant being on stage.
- `paragraphCount` equations give arc-horizon ends a pacing gate.

None of `advancedConditions` is used anywhere in `src/` today.

### 4.4 Retirement

Satisfaction is a flag flip: `api.v1.lorebook.updateEntry(id, {enabled: false})`.

The model is never told a plot is over. Telling it "this is resolved" spends context
to assert a negative; disabling the entry simply removes the reminder. Deciding
satisfaction rides along in triage's output at no extra generation cost.

### 4.5 Proliferation control

Nothing about the mechanism prevents triage opening an entry for every glance and
half-promise, and each open thread is a permanent context cost until satisfied.
Unbounded growth would slowly poison the context the Engine exists to improve.

Three controls:

- A **cap** on simultaneously-open threads, enforced in the reducer. A
  `project.yaml` setting, **default 8**.
- Triage must **justify** a new thread against the cap, and displace rather than
  add when at the ceiling.
- A **paragraph-count expiry**, so an end the story quietly abandoned ages out
  instead of accumulating forever.

## 5. Entity revision

**Read-then-write, always.** The revision step fetches the entry's live text
immediately before rewriting it, so a hand-edit made thirty seconds earlier is
simply part of the input. No Redux state claims authority over what an entry
currently says.

This extends the existing `DRAFT > LOREBOOK > STATE` hierarchy
(`src/core/utils/lorebook-strategy.ts`) across time as well as across surfaces.

**Consequences are revisions, not threads.** A character dying or an item being
spent is a permanent fact and belongs in the _subject's own_ entry — keyed on their
name, activating naturally when mentioned. A thread wants retiring on resolution;
a consequence wants keeping forever. Filing a consequence as a thread would
switch it off at exactly the moment it became permanent truth.

The two action shapes map onto the Forge's existing command grammar
(`src/core/utils/crucible-command-parser.ts`): a changed fact is `REVISE`, a new
commitment is `CREATE`. The Engine introduces no second action vocabulary.

### 5.1 Condense — the counterweight to revision

Revision only ever adds. Each pass appends what the story has newly made true, and
nothing in the mechanism removes what has become redundant, superseded, or merely
verbose. Left alone, an entry that gets revised twenty times becomes a sprawl — and
because lorebook entries share the context window with story text (§4.3), a bloated
World crowds out the recent prose the writer is relying on. Revision without a
counterweight makes context worse, slowly, in exactly the way the Engine exists to
prevent.

So **condense** is a first-class action alongside revise, open, and retire: rewrite
an entry tighter without losing what it asserts. Not a summary — a compaction. Facts
survive; repetition, superseded detail, and accumulated hedging do not.

**Triggering it needs no model.** An entry's length is measurable in `assess`, which
is free, so an entry crossing a configurable size threshold enqueues a condense
intent directly — triage is never spent noticing that something is long. The
threshold is a `project.yaml` setting.

Condense obeys every rule revision does: read-then-write against the live entry, the
write-once original preserved (§5.2), and the same `lb:<entryId>` record so history
reconciliation treats it identically. It is also the same price as a revision (up to
1024 output tokens, §3.3), so it competes for the same scarce slot — which is
correct, since a condense that never runs and a revision that never runs both leave
the World wrong.

The risk worth naming: **condensing is the one action that can lose information.**
Every other action adds, retires, or flags. A bad condense silently drops a fact the
story established, and nothing downstream would notice. That argues for a
conservative prompt biased toward retention over brevity, and for condensing being
the action most worth reviewing in the Engine tab.

### 5.2 The user's lorebook is never destroyed

Story Engine will edit lorebook entries automatically, and the original content of
any entry it first touches is preserved in storage as a write-once snapshot. That
snapshot is a user-facing restore only; the loop never consults it and never
resolves conflicts from it. The chosen stance (edit in place, keep the original) is
preferred over the alternative (disable the user's entries and manage shadow copies)
because it keeps one authoritative entry per subject, and because backing up a whole
story is already a single copy operation in the editor.

## 6. Persistence

### 6.1 Storage scoping

| storage          | holds                                                                                             | why                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `historyStorage` | World entities, threads, foundation, DULFS lists, watermark, intent queue, lorebook write-records | derived from or about the story; must follow the branch |
| `storyStorage`   | chat sessions (brainstorm, forge, refine), lorebook original snapshots                            | follows the writer, not the branch                      |
| `tempStorage`    | in-flight pass state                                                                              | must not survive a reload half-applied                  |
| —                | `ui`, `runtime` slices                                                                            | ephemeral, not persisted                                |

`historyStorage.get()` searches ancestor nodes until it finds a value — copy-on-write
inheritance along the history DAG. This gives branch-correct state with no journal,
no ancestry computation, and no rollback handler: a value written at node N is
inherited by every descendant, invisible after an undo to N-1, and never seen by a
sibling branch that diverged earlier.

Pre-story Forge output is written at or near the root and is therefore inherited by
every branch forever. Nothing authored before the story starts can vanish, however
far the writer undoes.

**Chat is the deliberate exception.** Brainstorms are conversations with the tool,
not facts about the story. History-scoping them would mean undoing three paragraphs
to try a different continuation also hides the brainstorm about what that
continuation should be — the thinking disappears exactly when it is acted on.

**Foundation is branch-local.** Switching intensity to Noir on a branch, then rolling
back past that point, restores the previous intensity. A branch exploring a different
register genuinely is a different story. The known rough edge is that a _correction_
("I set this wrong at the start") silently applies only to the current branch. This
is documented, not worked around: writing at root would not help, since
nearest-ancestor-wins means any later write on the current path shadows it, and
clearing those overrides would require enumerating descendant nodes.

### 6.2 Key granularity

Copy-on-write is per key per node, so granularity is a correctness-adjacent
performance concern rather than a cosmetic one. Today's single `kse-persist` blob
(`src/core/store/effects/autosave.ts`) is the worst case: every loop pass would
snapshot the entire World onto that node.

The `historyStorage` keyspace (the `storyStorage` side keeps chat and the write-once
lorebook originals from §5.2):

```
index          { entityIds[], threadIds[] }   — authoritative for existence (§6.2.1)
e:<id>         WorldEntity
t:<id>         Thread
lb:<entryId>   what the loop last wrote to that lorebook entry
watermark      last observed sectionId
queue          pending intents
foundation     ATTG, style, shape, intent, contract, intensity
f:<fieldId>    DULFS item lists
```

No namespace prefix — script storage is already sandboxed. The discriminators that
remain (`e:`, `t:`, `lb:`) exist because entity ids and lorebook entry ids are both
UUIDs and would otherwise be indistinguishable.

A typical pass copies two small records onto its node. Going finer — per field
within an entity — would multiply the read path without meaningfully reducing write
cost, since an entity's fields tend to change together.

### 6.2.1 The index is how deletion works

`list()` inherits ancestor keys (§12.1), so the index is not needed merely to
enumerate the keyspace. It earns its place for a different and more important
reason: **`remove()` cannot express a branch-local deletion.**

Because `get()` falls through to the nearest ancestor, removing `e:<id>` at the
current node does not delete the entity — it uncovers whatever the parent branch
holds, resurrecting the record the writer just deleted. The same applies to
retiring a thread.

So deletion is an **index write**: the index at the current node is rewritten
without that id, and the id simply stops being referenced. Existence is whatever
the nearest-ancestor index says, which is branch-correct by construction — a
sibling branch keeps its own index and its own entity. No tombstones are needed,
and the orphaned `e:<id>` record left behind is harmless because nothing reads a
record the index does not name.

This makes the index authoritative for existence, and `list()` diagnostic only.
Load reads the index, then fans out to the named record keys with `Promise.all`.

**Corollary: never call `historyStorage.remove()` on a record key.** It reads as
"delete" and behaves as "revert to the parent branch's version".

### 6.3 Node capture at dispatch time

Ordinary writing creates history nodes continuously, and `onHistoryNavigated`
explicitly does not fire for nodes created during normal editing or generation. A
debounced flush (currently 2000ms) can therefore land after the current node has
moved on, writing conclusions about node N onto node N+2.

`historyStorage.set(key, value, nodeId)` takes an explicit node, and the argument is
honoured (§12.1). **Capture `currentNodeId()` at dispatch time and pass it at flush
time.** This is correctness, not optimisation.

The probe demonstrated the failure mode by accident. Its first version called
`currentNodeId()` and then `set()` with no explicit node, a few statements apart —
and the value landed on a different node than the one just read, far enough apart
that the recorded node turned out to be the _grandparent_ of where the write went.
If two adjacent calls can disagree about "current", a 2000ms debounce certainly can.
**No `historyStorage` write in the Engine omits its node argument.**

### 6.4 The store boundary

`historyStorage` is entirely async; the store is synchronous by construction
(`src/ui/bridge.ts:21` — `getSnapshot: () => selector(store.getState())`, as
`useSyncExternalStore` requires). So `historyStorage` is a load/persist boundary, not
a backing store — the same role `storyStorage` plays today via
`registerAutosaveEffects`.

Autosave splits: branch-scoped slices flush to `historyStorage` at the captured
node, chat continues to `storyStorage`.

`storageKey` bindings accept a `history:` prefix exactly parallel to the `story:`
routing rule CLAUDE.md documents, so the constant/prefix convention in
`src/core/keys.ts` must cover both. As with `story:`, the prefix belongs at the
binding site only, never embedded in the key constant.

## 7. History navigation and lorebook reconciliation

`historyStorage` reverts what the Engine _believes_, but the lorebook is global story
state and is not history-scoped — so it does not revert what the Engine _did_. This
is the entire residue of the branching problem.

`onHistoryNavigated` (`cause: 'undo' | 'redo' | 'retry' | 'jump'`), whose `nodeId`
arrives as a `number` despite the `.d.ts` declaring `string` (§12.1):

1. Reload branch-scoped slices at the new node; dispatch a replace-state. The UI
   re-renders through `useSyncExternalStore` normally.
2. Recompute the watermark. After an undo, the last-observed sectionId may point at
   a section that no longer exists; `nodeState(nodeId).sections` gives the document
   at the target.
3. For each `lb:<entryId>` record, compare the entry's live text against what we
   recorded writing. **Matching** means our edit is still the top layer and can be
   brought in line with the branch. **Differing** means the writer has edited since,
   and we leave it alone.

Step 3 is the only place a stored copy of entry text is consulted, and it is
consulted to answer "what did we do," never "what does it say." Read-then-write is
preserved.

**There is no Engine-specific undo control.** Undo is a native story-editor control,
and it already does the right thing: navigating history reverts the Engine's beliefs
automatically and triggers reconciliation. Adding a second undo surface would
duplicate a native affordance.

## 8. Model selection

Different steps need different models. `glm-4-6` is markedly more reliable at
instruction following; `xialong-v1` is a creative-writing fine-tune of it.

`buildModelParams()` (`src/core/utils/config.ts:56`) is already the single chokepoint
— every strategy in the codebase resolves its model there. It gains a **capability**
parameter:

- `"instruct"` — triage, extraction, classification, command emission.
- `"creative"` — anything writing prose a reader will see.

Defaulting to `"creative"` preserves the exact current behaviour at all existing
callsites with zero churn. `xialong_mode` comes to mean "use Xialong for creative
work," which is closer to what it already means in spirit; it simply had no way to
express the distinction.

A single loop pass is therefore not a single model, and needs no new plumbing:
`params` is already per-strategy and `GenerationStrategy` supports a
`messageFactory`.

**Input side.** Follow the layered-prefix discipline `src/core/utils/context-builder.ts`
already documents — stable manifest first, volatile new prose last, cache boundary
between. Use `createRolloverHelper` (`external/script-types.d.ts:2507`) for the story
window; its `rolloverTokens` is effectively a cache-invalidation dial, since the
window only trims when it exceeds `maxTokens + rolloverTokens` and is byte-stable
between trims.

## 9. UI

### 9.1 The Engine HUD

A `scriptPanel` UI extension. One line, reporting only, plus a single control.

**Visibility is guaranteed.** A `scriptPanel` can be minimized but never dismissed,
so the HUD can never be lost — at worst it is one gesture away. That is what lets it
carry the trust burden: a writer can always see what the Engine is doing without
opening a tab, and the Engine can never be quietly running behind a surface the
writer has closed and forgotten.

Mechanically it is a container wrapping a single `part.jsx()` with a small Preact
root — the same construction `src/ui/mount.ts` uses for the sidebar — so CLAUDE.md's
no-`updateParts` rule holds and this does not become a third UIPart carve-out. It
registers as a third entry in the existing single `api.v1.ui.register()` call, since
NAI requires one call and later calls overwrite earlier ones.

**It is a modeline, not a log.** Fixed slots, always present, always in the same
position, read as a shape rather than parsed as words. It rewards observation over
time; it never narrates individual actions.

```
◉  14¶  ⚑5  ✎23  ▮▮▮▯  ⚡
```

| slot       | reads                                                            | what watching it teaches                        |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| state      | `◉` watching · `◐` reading · `✎` acting · `⏸` held · `⚠` stalled | whether it's alive, and what it's doing         |
| backlog    | unread paragraphs since the watermark                            | climbing = falling behind                       |
| threads    | count of open threads                                            | context pressure — climbing means go close some |
| touched    | entities revised on this branch                                  | activity level                                  |
| budget     | remaining output bucket                                          | why it's quiet when it's quiet                  |
| ⚡ (`zap`) | **the one control** — run a pass now                             | —                                               |

`⚠` means the loop cannot make progress at all. Ordinary concurrency refusals
(§3.4) are routine and stay invisible — surfacing them would train the writer to
ignore the one slot that should mean something.

The compound readings carry the density: backlog climbing _with an empty budget_
means starved; climbing _with a full budget_ means colliding constantly; a persistent
`⏸` means FlagB is not releasing buckets. None of that is legible from a log of
individual actions.

Feather icons come from `nai:icons/feather` and are already idiomatic in the tree
(`Header.tsx:31` imports `Zap` among others), so slots may be icons where that reads
better at small sizes.

**The ⚡ is the only control, and the only reason the HUD is not purely a
readout.** It runs a pass immediately, bypassing the wakeup — which is what a
hand-writing writer needs, since no generation means no wakeup (§1.2). It is
otherwise inert: it does not edit, retire, or revert anything, so it does not
reopen the question of whether the HUD should carry the Engine's controls. Undo
remains the story editor's own (§7), and everything else lives in the Engine tab.

A pass is not idempotent and a wasted one costs real budget, so the ⚡ refuses
re-entry: it is a no-op while the loop is already assessing, triaging, or acting.
That check is the whole guard, and it must live in the handler or the effect
rather than in the button's `disabled` prop — `disabled` is a render-time value,
so a press arriving before the re-render that sets it still gets through.

No tap debounce. The runtime once delivered a single mobile tap as two `click`
events and `useTapGuard()` absorbed it; that bug is fixed upstream and the hook
was removed in 0.14.1. CLAUDE.md now forbids reintroducing a timestamp window —
a deliberate second press is a real press, and the loop's own in-flight state is
what distinguishes "already running" from "run it again".

**It must not read `genx.status`.** CLAUDE.md establishes `derive()` in
`src/ui/header/header-model.ts` as the only place that branches on generation
status, with `tests/ui/countdown.test.ts` enforcing it mechanically. The HUD reads a
_loop_-state model, which is a genuinely different state machine — conflating the
Engine's states with the generation queue's is how the two surfaces drift.

### 9.2 Tabs

`Setup | Engine | Chat`, with **Setup leftmost and first**.

- **Setup** — all of Foundation, plus **bootstrap** (Opening Scene / Continue Scene)
  and the **Import wizard**, plus user-facing configuration as it accumulates:
  `project.yaml` settings surfaced properly rather than left in NovelAI's script
  config, whose UX suits power users only. Includes a small CTA beneath Intensity
  that opens a brainstorm chat about the story.
- **Engine** — World, Threads, the Forge, loop status detail, and the journal.
  The Engine's domain: what exists, and what the Engine has done to it. The Forge
  lives here because under the new division it is the instrument that seeds this
  surface.
- **Chat** — unchanged.

Setup leads because it is where a story begins, and absorbing bootstrap and import
makes it the actual starting point rather than a settings drawer. Both currently
live in the always-visible header (`src/ui/header/Header.tsx`), which shrinks
accordingly — the header keeps generation status and loses the two controls that
only matter at the beginning of a story.

**Default tab follows the story's state.** An empty document opens on Setup, since
there is nothing else to do yet; a story with prose opens on Engine. `mount.ts`
already reads `hasDocumentContent` before `register()` and passes it to `App` so the
bootstrap button's first paint is correct, so the signal exists and needs no new
plumbing.

Named "Setup" rather than "Config" deliberately: everything in it is history-scoped
and branch-local, while NovelAI's own script config is global and account-level.
Labelling a branch-local surface "Config" would mislead on both counts.

## 10. No migrations

Story Engine is alpha. **No migration code is written, anywhere.** Upgrading is at
the user's own risk, and this is stated in the changelog and README for 0.15.0.

This applies to _our_ persisted schema, not to the user's lorebook. Dropping Engine
state orphans bindings, so previously-managed entries become unmanaged entries
sitting in the lorebook — untouched, not destroyed. The Import wizard's Bind is
already the re-adoption path. The read-then-write and never-clobber rules in §5 and
§5.2 apply in full regardless.

Consequently there is no `WorldGroup` → `Thread` mapping, and no root-node
resolution for seeding upgraded stories.

## 11. Failure modes

| condition                                        | behaviour                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| wakeup fires while the writer is still streaming | refused, backs off, lands as the generation completes — costs latency only (§3.1)               |
| request refused for concurrency                  | bounded backoff retry; requeue for the next wakeup if the bound is hit. Never surfaced (§3.4)   |
| budget exhausted                                 | hold; abandon if the writer goes idle                                                           |
| malformed model output                           | the Forge's existing parser already surfaces rejected and unparseable commands as warning chips |
| lorebook entry deleted underneath us             | read-then-write finds nothing; drop the intent, clean the record                                |
| entity renamed by the writer                     | read-then-write reads live `displayName` per `DRAFT > LOREBOOK > STATE`                         |
| reload mid-pass                                  | `tempStorage` in-flight state is gone; pass aborts cleanly, queue survives in `historyStorage`  |
| thread cap reached                               | triage displaces rather than adds (§4.5)                                                        |

## 12. Findings and standing risks

Every question this design opened has been answered — the API unknowns empirically,
via the two probes in `tools/`, and the naming and sizing calls by decision. What
remains under Risks are not unknowns but things that can only be got right by
building and using them.

### 12.0 Resolved: a refused generation is free, and how to recognise one

**Current behaviour: a successful generation is debited what it returned, and a
refused one is debited nothing.** Retry is therefore safe, and §3.4 uses bounded
backoff.

The refusal surfaces as a bare `Error`: `message` is
`"A generation is already in progress"`, `name` is `"Error"`, and there is no status
code, error code, or subclass. Message matching is the only classifier available —
this part is unchanged and still shapes §3.4's default-deny rule.

**History, because it explains the shape of §3.4.** The probe originally measured a
refusal being charged its full `max_tokens`:

```
A  requested=512 returned=8
   budget 2048 -> 2040   delta=8
B  succeeded=1 refused=1 returned=21
   budget 2040 -> 1507   delta=533
   free ~21   charged ~533
   error: message=A generation is already in progress | name=Error
```

`533 = 21 + 512`. That was a defect — the backend performed no work, so there was
nothing to charge for — and NovelAI has since fixed it in response to this probe.
Under the old behaviour retry was actively harmful and the design had no retry at
all; the fix is what restores it.

`tools/budget-probe.naiscript` stays in the repo as the regression check. Re-run it
if refusal costs ever look suspicious again; Test B's `free ~N` / `charged ~N` lines
make the answer immediate.

### 12.1 Resolved: historyStorage inheritance and the node argument

Measured with `tools/history-storage-probe.naiscript`:

Write at a node, generate (creating a child), write again, check, undo, check:

```
wrote marker-1 at node 2148354315150205 (number)
wrote marker-2 at node 889126403141294 (number)

--- check at node 889126403141294 ---
list()      = ["marker-2","shared","marker-1"]
ancestry: [889126403141294,2148354315150205,2000700501153961,2108041959196779]
  marker-1 written@2148354315150205  get=writtenAt 2148354315150205  ancestor=yes(+1)
  shared resolves to node 889126403141294
verdict: list() INHERITS ancestor keys

navigated undo: hook nodeId=2148354315150205 (number)  currentNodeId=2148354315150205 (number)

--- check at node 2148354315150205 ---
list()      = ["marker-1","shared"]
  marker-2 written@889126403141294  get=MISSING  list@node=[]  ancestor=NO
  shared resolves to node 2148354315150205
```

- **`list()` returns inherited ancestor keys**, matching `get()`. A key written at
  the parent is listed at the child.
- **The `nodeId` argument is honoured** by `set`, `get`, and `list`. `list()` and
  `list(currentNodeId())` agree.
- **Nearest-ancestor-wins is confirmed** — `shared` resolves to the child's value at
  the child, and falls back to the parent's after an undo.
- **Undo hides the branch's writes.** `marker-2`, written on the abandoned branch,
  reads `MISSING` after navigating away. This is the behaviour the whole persistence
  model in §6 rests on, now measured rather than inferred.

**`onHistoryNavigated` delivers `nodeId` as a `number`**, matching `currentNodeId()`,
so no normalisation is needed anywhere. The `.d.ts` declares it `string`
(`OnHistoryNavigated`) and is simply wrong.

The correction belongs in `src/type-overrides.d.ts`, which exists for exactly this —
upstream typings are not always right, and the project keeps its own corrections
rather than working around them at each callsite. The defect should also be reported
to NovelAI so the override can eventually be dropped.

Mechanically, neither obvious route works: `OnHistoryNavigated` is a `type` alias so
it cannot be augmented, and while `HookCallbacks` is an `interface`, declaration
merging cannot _change_ a member's type. What does work is the pattern the override
file already uses — `api.v1.hooks` is a namespace, so a merged declaration adds a
`register` **overload** specific to this hook:

```ts
// NAI TYPE DOCUMENTATION OVERRIDE
// onHistoryNavigated's nodeId/previousNodeId are declared `string` upstream but
// arrive as `number`. Measured; see the v15 design §12.1. Reported to NovelAI.
namespace api.v1.hooks {
  function register(
    hookName: "onHistoryNavigated",
    callback: (params: {
      nodeId: number;
      previousNodeId: number;
      direction: "forward" | "backward" | "both";
      distance: number;
      cause: "undo" | "redo" | "retry" | "jump";
    }) => void | Promise<void>,
  ): void;
}
```

The generic `register<K extends keyof HookCallbacks>` is tried first and fails to
accept a `number`-typed callback, so resolution falls through to this overload — no
cast anywhere. Confirm that resolution order actually behaves this way when the
override is written; if it does not, the fallback is a declared corrected params type
plus a single reinterpreting cast in the one handler, which is still better than
propagating a wrong `string` through the reconciliation path.

**Node ids are opaque and unordered.** They are large numbers (~10¹⁵ — inside
`Number.MAX_SAFE_INTEGER` at ~9×10¹⁵, but close enough that they must never be
arithmetic operands or round-tripped through anything lossy). Critically they are
**not monotonic**: above, the child `889126403141294` is smaller than its parent
`2148354315150205`. Never sort them, compare them, or infer recency or ancestry from
their values — ancestry comes only from walking `nodeState().targetNode.parent`.

**Nodes off the current path are not addressable.** After the undo,
`list(889126403141294)` returned `[]` for a node that certainly holds a value. The
Engine only ever reads the current branch, so this costs nothing — but it does mean
records stranded on abandoned branches can never be enumerated or swept. They are
unreachable rather than merely unreferenced, which is acceptable: they consume
storage and nothing else.

The v0.1 run also produced a useful accident: reading `currentNodeId()` and then
calling `set()` without a node landed the value two nodes away from the id just
read. That is the evidence behind §6.3.

### 12.2 Resolved: scriptPanel visibility

A `scriptPanel` can be **minimized but never dismissed**. Engine visibility is
therefore guaranteed rather than opt-in, which is what allows the HUD to carry the
trust burden (§9.1). No API unknowns remain.

### 12.3 Resolved: naming

Threads keep their name and the Forge keeps its `[THREAD]` verb (§4.1). Nothing
about naming is outstanding.

### Risks

1. **Triage prompt quality is the whole ballgame** and cannot be settled on paper.
   It is the first thing to build and the thing to iterate against real stories.
2. **Thread proliferation** (§4.5) is the failure mode that would make the Engine
   actively harmful rather than merely unhelpful. The cap, justification, and expiry
   are not polish.
3. **Condense is the only action that can lose information** (§5.1). Every other
   action adds, retires, or flags; a bad condense silently drops an established fact
   and nothing downstream notices. Bias the prompt toward retention, and treat
   condense as the action most worth surfacing for review.

## 13. Testing

Everything decidable is pure and testable headless, consistent with the existing
`tests/ui` suite:

- manifest builder (state in → manifest text out)
- condense triggering: entry length crosses the threshold → intent enqueued from
  `assess`, with no triage generation involved (§5.1)
- the thread cap reads from config and defaults to 8 (§4.5)
- intent parsing, extending the existing Forge parser tests
- condition construction (thread + horizon → `advancedConditions` tree)
- watermark math across document edits and history navigation
- drain policy (available budget in → actions permitted out)
- failure classification: the refusal message is recognised, and every unrecognised
  failure is treated as non-retryable (§3.4's default-deny)
- retry backoff: a refused request retries up to the bound and then requeues for the
  next wakeup rather than spinning
- the loop state machine as a pure reducer, table-driven
- wakeup arming: a pending wakeup is not rescheduled by a further generation, and a
  `scriptInitiated: true` request never arms one
- manual invocation is refused while a pass is already in flight (§9.1)
- reconciliation decision table (live text vs recorded write → revise / leave alone)
- deletion goes through the index and never calls `historyStorage.remove()` on a
  record key (§6.2.1) — the resurrection bug is silent and branch-dependent, so it
  wants a test rather than a comment

Plus one guard test in the spirit of `tests/ui/countdown.test.ts`, asserting the HUD
has not become a second reader of generation status.

## 14. Implementation sequencing

The design is one coherent system, but it is not one sitting of work. A suggested
spine for the implementation plan, ordered so each phase is independently
verifiable:

Nothing in §12 is still unknown, so the plan starts with real work.

1. **Setup tab.** Split the Foundation fields out, build Setup as the leftmost tab,
   absorb bootstrap and the Import wizard out of the header, add the Intensity CTA,
   and wire the default-tab rule. Ships user-visible value on its own, touches
   nothing the loop depends on, and gives the later phases a home for the
   configuration they add.
2. **Persistence.** Add the `onHistoryNavigated` correction to
   `src/type-overrides.d.ts` (§12.1) first, since the navigation handler depends on
   it. Then move branch-scoped slices to `historyStorage`, shard `kse-persist` into
   the §6.2 keyspace, capture nodeId at dispatch, and route deletion through the
   index (§6.2.1). Verifiable on its own: existing features keep working, undo now
   moves World state.
3. **Model capability.** Add the parameter to `buildModelParams()` with a
   `"creative"` default. Pure addition, no behaviour change.
4. **Loop harness + HUD, triage only.** Trigger, state machine, pacing, collision
   recovery — with triage producing intents that are logged but not executed. The
   HUD makes this observable, which is why it comes early rather than last.
5. **`Thread` replacing `WorldGroup`**, including `advancedConditions`
   construction and the §4.5 controls.
6. **Actions.** Revise, open, retire, condense — plus §7 reconciliation.

## 15. Versioning

**0.15.0** — minor. Under the alpha lock (major pinned at 0), minor covers
architecture, data-model, and persisted-schema changes; this is all three. Bumped
once for the branch, with `CHANGELOG.md` kept in step on every commit that changes
user-visible behaviour.
