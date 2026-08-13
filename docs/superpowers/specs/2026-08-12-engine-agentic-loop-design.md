# The Engine — an agentic loop that lives alongside the writer

**Status:** design approved, not yet planned
**Target version:** 0.15.0
**Branch:** `claude/story-engine-agentic-loop-ti2pgk`

## 1. What this is

A minimal agentic loop that fires while the writer works, reads the prose produced
since it last looked, and maintains the World against it. It does three things:

1. Revises lorebook entries the story has made wrong.
2. Opens entries for narrative commitments the model is likely to forget.
3. Retires those entries once the story satisfies them.

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
already solves persistent recall; the gap is *activation*, not storage.

**Not a second author.** The Engine writes change, never invention. It records what
the prose has made true; it does not decide what happens next.

## 2. Division of labour: Forge vs Engine

The Forge and the Engine both write World entities, and the boundary between them
is tense, not territory.

| | Forge | Engine |
|---|---|---|
| when | before the story starts, or on demand mid-story | continuously while writing |
| writes | **setup** — root facts, standing pressure | **change** — what the prose has made true |
| may assert | situations, complications, no outcomes | outcomes, consequences, resolutions |
| triggered by | the writer, explicitly | generation activity, automatically |

The Forge's existing no-outcomes discipline (`src/config/field-definitions.ts:155`)
is what keeps these from colliding. The Forge establishes what is unsettled; the
Engine records how the story settles it.

## 3. The loop

### 3.1 Trigger

Both `onGenerationRequested` and `onGenerationEnd` feed a single last-activity
watermark. The loop fires when the story has been quiet for a configurable interval
**and** there is at least a configurable minimum of unobserved prose.

Both thresholds are new `project.yaml` entries. This is consistent with the prompt
policy in CLAUDE.md: `project.yaml` carries runtime settings only, never prompts.
The triage prompt and every other Engine prompt is an exported constant in
`src/core/utils/prompts.ts`.

Keying on quiet rather than on either hook directly has two advantages: it covers
hand-written prose, which no generation hook observes at all, and it avoids firing
at the moment the writer's attention returns to the editor and they are most likely
to generate again.

`onGenerationEnd` is documented at `external/script-types.d.ts:4092`;
`onGenerationRequested` at `:3989`. The project currently registers exactly one hook
(`onHistoryNavigated`, `src/core/store/effects/bootstrap-effects.ts:171`), so this
surface is otherwise unused.

### 3.2 Per-firing state machine

```
assess ──▶ triage ──▶ enqueue ──▶ drain ──▶ idle
  │          │                      │
  └─(free)   └─(~150 tok)           └─(150–300 tok each, budget-governed)
```

- **assess** — pure string work, no generation. Is there enough new prose to
  bother? Which entities are plausibly in play (name and key matching against the
  new sections)? Produces the manifest for triage and can terminate the firing at
  zero cost.
- **triage** — one small instruct generation over new prose plus a compact
  manifest (entity names, one-line summaries, open loose ends). Answers only *what
  needs attention*: this entry is now wrong, this is a new commitment, this
  commitment looks satisfied. Most firings on quiet prose return nothing.
- **enqueue** — triage output becomes intents in a persisted queue.
- **drain** — execute intents while budget permits.

The machine is a pure reducer over (state, event) so it can be table-tested
headless.

### 3.3 Pacing

The only genuinely scarce resource is **output tokens: 2048 per 240 seconds**,
released FIFO and gated by FlagB. Input tokens are bucketed far more generously and
benefit from caching.

| step | output cost |
|---|---|
| assess | 0 — no generation |
| triage | ~150 |
| retire a satisfied loose end | 0 — `updateEntry(id, {enabled: false})` |
| open a loose end | ~150 |
| revise an entity entry | ~300 |

At a writing cadence of one generation every 40–60s, that is four to six firings
per bucket. Triage at every firing costs 600–900 tokens, leaving 1100–1400 for two
to four actions.

**Therefore: triage runs hot, actions run cold.** This is not merely affordable, it
is the correct asymmetry. A commitment never noticed is lost permanently, whereas a
queued action is safe indefinitely — a loose end's condition does not fire until its
subject has gone unmentioned for thousands of characters, so creating the entry
three paragraphs late costs nothing. Prose does not un-happen, so a queued intent
does not go stale.

**Drain rate is budget-governed, not fixed.** Drain while `getAllowedOutput()` stays
above a reserve sufficient for the next triage. This makes the scarce resource its
own regulator: generating hard keeps the loop out of the way, pausing to read lets
it catch up. A fixed rate does neither — it overprocesses when idle and falls behind
when the writer is fast.

**Retiring a satisfied loose end never queues**, because it costs zero output
tokens. The action that most protects context health is free.

### 3.4 Yielding to the writer

The backend rejects concurrent API requests, and a rejection in the story editor is
a far worse outcome than a lost Engine pass. The loop always loses.

On `onGenerationRequested` with `scriptInitiated: false`, cancel the in-flight
request via its `CancellationSignal`
(`api.v1.generate`'s third parameter; `createCancellationSignal()` at
`external/script-types.d.ts:2495`) and leave the queue intact. The next firing
resumes where it stopped.

The typings note cancellation "may not cancel immediately." If hooks are awaited by
the harness — `OnGenerationRequested` returns
`... | Promise<...>`, which suggests they may be — the hook can hold the writer's
request until ours is confirmed dead, giving a real mutex rather than a hopeful
abort. See §12.

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

## 4. Loose Ends

### 4.1 The concept

`WorldGroup` ("Threads") and the new open-commitment concept are the same mechanism
with different triggers, and collapse into one entity.

A Thread's purpose was to keep a cluster of entities warm in context so the editor's
model could reach for them. It achieved that with blanket always-on, because that
was the only instrument available. The negated-key condition (§4.3) is the same
intent with a trigger that fires *when the cluster has actually gone quiet* — which
is precisely the moment the old always-on was paying for.

`WorldGroup` is deleted. `LooseEnd` replaces it.

```ts
interface LooseEnd {
  id: string;
  title: string;
  text: string;                       // the reminder prose
  horizon: "arc" | "plot" | "point";
  entityIds: string[];                // the cast it drags into context
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

`entityIds` is load-bearing, not inherited baggage. It is what lets a loose end build
its condition from its participants' own keys, and what makes the `lore` condition
usable — remind about the unsettled succession only when a member of the Inner
Circle is on stage. A bare unresolved detail is the degenerate case with one member
or none.

### 4.2 Loose Ends are not Narrative Vectors

Narrative Vectors (`FieldID.SituationalDynamics`, labelled "Narrative Vectors")
stay exactly as they are. A Vector is standing pressure with explicitly "no
outcomes, no predictions," authored by the Forge before the story runs. A Loose End
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
loose ends are free while they are being honoured, and only spend context when they
are being neglected.

Supporting constructions:

- `range` scales with `horizon` (a point decays fast, an arc slowly).
- `{type: "lore", entryId}` gates a loose end on a participant being on stage.
- `paragraphCount` equations give arc-horizon ends a pacing gate.

None of `advancedConditions` is used anywhere in `src/` today.

### 4.4 Retirement

Satisfaction is a flag flip: `api.v1.lorebook.updateEntry(id, {enabled: false})`.

The model is never told a plot is over. Telling it "this is resolved" spends context
to assert a negative; disabling the entry simply removes the reminder. Deciding
satisfaction rides along in triage's output at no extra generation cost.

### 4.5 Proliferation control

Nothing about the mechanism prevents triage opening an entry for every glance and
half-promise, and each open loose end is a permanent context cost until satisfied.
Unbounded growth would slowly poison the context the Engine exists to improve.

Three controls:

- A **cap** on simultaneously-open loose ends (8–12), enforced in the reducer.
- Triage must **justify** a new loose end against the cap, and displace rather than
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

**Consequences are revisions, not loose ends.** A character dying or an item being
spent is a permanent fact and belongs in the *subject's own* entry — keyed on their
name, activating naturally when mentioned. A loose end wants retiring on resolution;
a consequence wants keeping forever. Filing a consequence as a loose end would
switch it off at exactly the moment it became permanent truth.

The two action shapes map onto the Forge's existing command grammar
(`src/core/utils/crucible-command-parser.ts`): a changed fact is `REVISE`, a new
commitment is `CREATE`. The Engine introduces no second action vocabulary.

### 5.1 The user's lorebook is never destroyed

Story Engine will edit lorebook entries automatically, and the original content of
any entry it first touches is preserved in storage as a write-once snapshot. That
snapshot is a user-facing restore only; the loop never consults it and never
resolves conflicts from it. The chosen stance (edit in place, keep the original) is
preferred over the alternative (disable the user's entries and manage shadow copies)
because it keeps one authoritative entry per subject, and because backing up a whole
story is already a single copy operation in the editor.

## 6. Persistence

### 6.1 Storage scoping

| storage | holds | why |
|---|---|---|
| `historyStorage` | World entities, loose ends, foundation, DULFS lists, watermark, intent queue, lorebook write-records | derived from or about the story; must follow the branch |
| `storyStorage` | chat sessions (brainstorm, forge, refine), lorebook original snapshots | follows the writer, not the branch |
| `tempStorage` | in-flight pass state | must not survive a reload half-applied |
| — | `ui`, `runtime` slices | ephemeral, not persisted |

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
register genuinely is a different story. The known rough edge is that a *correction*
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
lorebook originals from §5.1):

```
index          { entityIds[], looseEndIds[] }   — changes only on create/delete
e:<id>         WorldEntity
t:<id>         LooseEnd
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

`index` makes the load path independent of `historyStorage.list()`'s inheritance
semantics (§12): load reads the index, then fans out to record keys with
`Promise.all`.

### 6.3 Node capture at dispatch time

Ordinary writing creates history nodes continuously, and `onHistoryNavigated`
explicitly does not fire for nodes created during normal editing or generation. A
debounced flush (currently 2000ms) can therefore land after the current node has
moved on, writing conclusions about node N onto node N+2.

`historyStorage.set(key, value, nodeId)` takes an explicit node. **Capture
`currentNodeId()` at dispatch time and pass it at flush time.** This is correctness,
not optimisation.

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

`historyStorage` reverts what the Engine *believes*, but the lorebook is global story
state and is not history-scoped — so it does not revert what the Engine *did*. This
is the entire residue of the branching problem.

`onHistoryNavigated` (`cause: 'undo' | 'redo' | 'retry' | 'jump'`):

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

A `scriptPanel` UI extension, read-only, one line.

Mechanically it is a container wrapping a single `part.jsx()` with a small Preact
root — the same construction `src/ui/mount.ts` uses for the sidebar — so CLAUDE.md's
no-`updateParts` rule holds and this does not become a third UIPart carve-out. It
registers as a third entry in the existing single `api.v1.ui.register()` call, since
NAI requires one call and later calls overwrite earlier ones.

**It is a modeline, not a log.** Fixed slots, always present, always in the same
position, read as a shape rather than parsed as words. It rewards observation over
time; it never narrates individual actions.

```
◉  14¶  ⚑5  ✎23  ▮▮▮▯
```

| slot | reads | what watching it teaches |
|---|---|---|
| state | `◉` watching · `◐` reading · `✎` acting · `⏸` held · `⚠` stalled | whether it's alive, and what it's doing |
| backlog | unread paragraphs since the watermark | climbing = falling behind |
| loose ends | open loose ends | context pressure — climbing means go close some |
| touched | entities revised on this branch | activity level |
| budget | remaining output bucket | why it's quiet when it's quiet |

The compound readings carry the density: backlog climbing *with an empty budget*
means starved; climbing *with a full budget* means constantly yielding; a persistent
`⏸` means FlagB is not releasing buckets. None of that is legible from a log of
individual actions.

Lucide-style icon components are already idiomatic in the tree
(`src/ui/panels/world/EntityEditPane.tsx:72-75`), so slots may be icons where that
reads better at small sizes.

**It must not read `genx.status`.** CLAUDE.md establishes `derive()` in
`src/ui/header/header-model.ts` as the only place that branches on generation
status, with `tests/ui/countdown.test.ts` enforcing it mechanically. The HUD reads a
*loop*-state model, which is a genuinely different state machine — conflating the
Engine's states with the generation queue's is how the two surfaces drift.

### 9.2 Tabs

`Chat | Setup | Engine`.

- **Setup** — all of Foundation, plus the `project.yaml` settings surfaced properly
  rather than left in NovelAI's script config, whose UX suits power users only.
  Includes a small CTA beneath Intensity that opens a brainstorm chat about the
  story.
- **Engine** — Forge, World, Loose Ends, loop status detail, and the journal. The
  Engine's domain: what exists, and what the Engine has done to it. The Forge lives
  here because under the new division it is the instrument that seeds this surface.
- **Chat** — unchanged.

Named "Setup" rather than "Config" deliberately: everything in it is history-scoped
and branch-local, while NovelAI's own script config is global and account-level.
Labelling a branch-local surface "Config" would mislead on both counts.

## 10. No migrations

Story Engine is alpha. **No migration code is written, anywhere.** Upgrading is at
the user's own risk, and this is stated in the changelog and README for 0.15.0.

This applies to *our* persisted schema, not to the user's lorebook. Dropping Engine
state orphans bindings, so previously-managed entries become unmanaged entries
sitting in the lorebook — untouched, not destroyed. The Import wizard's Bind is
already the re-adoption path. The read-then-write and never-clobber rules in §5 and
§5.1 apply in full regardless.

Consequently there is no `WorldGroup` → `LooseEnd` mapping, and no root-node
resolution for seeding upgraded stories.

## 11. Failure modes

| condition | behaviour |
|---|---|
| writer starts a generation mid-pass | cancel in place, queue intact, resume next firing |
| budget exhausted | hold; abandon if the writer goes idle |
| malformed model output | the Forge's existing parser already surfaces rejected and unparseable commands as warning chips |
| lorebook entry deleted underneath us | read-then-write finds nothing; drop the intent, clean the record |
| entity renamed by the writer | read-then-write reads live `displayName` per `DRAFT > LOREBOOK > STATE` |
| reload mid-pass | `tempStorage` in-flight state is gone; pass aborts cleanly, queue survives in `historyStorage` |
| loose-end cap reached | triage displaces rather than adds (§4.5) |

## 12. Open items

### Verify before writing code

1. **`onHistoryNavigated`'s `nodeId` type.** Typed `string` in the hook params,
   while `currentNodeId()` returns `number`. One of them is wrong in the `.d.ts`, and
   journal/record keys depend on which.
2. **`historyStorage.list(nodeId)` inheritance.** The docs do not say whether it
   returns inherited ancestor keys or only keys written at that exact node. The
   `index` key (§6.2) makes the load path immune either way, but the answer affects
   diagnostics and cleanup.
3. **Are hooks awaited?** Decides whether §3.4 gets a real mutex or a hopeful abort.
4. **`scriptPanel` placement and visibility.** The typings describe it as appearing
   below the editor and being user-collapsible. If it can be closed, Engine
   visibility is opt-in and the sidebar Engine tab must remain the authoritative
   view.

### Naming calls

5. The Forge's `[THREAD]` command now creates loose ends; the verb should match the
   concept.
6. Confirm "Loose Ends" as the user-facing category label.

### Risks

7. **Triage prompt quality is the whole ballgame** and cannot be settled on paper.
   It is the first thing to build and the thing to iterate against real stories.
8. **Loose-end proliferation** (§4.5) is the failure mode that would make the Engine
   actively harmful rather than merely unhelpful. The cap, justification, and expiry
   are not polish.

## 13. Testing

Everything decidable is pure and testable headless, consistent with the existing
`tests/ui` suite:

- manifest builder (state in → manifest text out)
- intent parsing, extending the existing Forge parser tests
- condition construction (loose end + horizon → `advancedConditions` tree)
- watermark math across document edits and history navigation
- drain policy (available budget in → actions permitted out)
- the loop state machine as a pure reducer, table-driven
- reconciliation decision table (live text vs recorded write → revise / leave alone)

Plus one guard test in the spirit of `tests/ui/countdown.test.ts`, asserting the HUD
has not become a second reader of generation status.

## 14. Implementation sequencing

The design is one coherent system, but it is not one sitting of work. A suggested
spine for the implementation plan, ordered so each phase is independently
verifiable:

0. **Spike the four unknowns in §12.** Cheap, and several later decisions hinge on
   them.
1. **Persistence.** Move branch-scoped slices to `historyStorage`, shard
   `kse-persist` into the §6.2 keyspace, capture nodeId at dispatch. Verifiable on
   its own: existing features keep working, undo now moves World state.
2. **Model capability.** Add the parameter to `buildModelParams()` with a
   `"creative"` default. Pure addition, no behaviour change.
3. **Loop harness + HUD, triage only.** Trigger, state machine, pacing, yielding —
   with triage producing intents that are logged but not executed. The HUD makes
   this observable, which is why it comes early rather than last.
4. **`LooseEnd` replacing `WorldGroup`**, including `advancedConditions`
   construction and the §4.5 controls.
5. **Actions.** Revise, open, retire — plus §7 reconciliation.
6. **Tabs.** `Chat | Setup | Engine`, and the Intensity CTA.

## 15. Versioning

**0.15.0** — minor. Under the alpha lock (major pinned at 0), minor covers
architecture, data-model, and persisted-schema changes; this is all three. Bumped
once for the branch, with `CHANGELOG.md` kept in step on every commit that changes
user-visible behaviour.
