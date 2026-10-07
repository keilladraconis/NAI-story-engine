# Threads as standing state — and an Engine that reads at two speeds

**Status:** design approved in conversation 2026-10-05; awaiting written-spec review
**Target version:** 0.16.0
**Supersedes:** §4 (Threads), and the triage vocabulary in §3.2, of `2026-08-12-engine-agentic-loop-design.md`

## 1. Why

### 1.1 The observed failure

With the Engine on, the World floods with Threads about paragraph-level trivia: a glass left on a table, a hanging nail, a couple who passed and looked at the protagonist once. Each becomes a lorebook entry.

### 1.2 Why it happens

These causes are read from the code. No transcript of a failing pass was examined.

1. **Triage judges at paragraph grain.** It fires 8 seconds after a generation with `minProse: 1`, so it usually reads one to three paragraphs. At that scale every unsettled detail looks like a commitment.
2. **Triage cannot see what the story is about.** Its input is entity summaries, the Thread list and the new prose. It is asked whether something "matters more to the story" with no Foundation and no earlier prose to judge by.
3. **`OPEN` is a pattern with instances.** "A threat named, an item hidden, a promise given" invites the model to fire on the pattern.
4. **Nothing pushes back below the cap.** Under 8 Threads an `OPEN` is free, and each one lives about 100 paragraphs.
5. **The design chose recall over precision.** The August spec holds that "a commitment never noticed is lost permanently". That premise is wrong: the prose is still there, and a later, wider read can notice what mattered.

### 1.3 The reframing

NovelAI is an open-ended scenario explorer, not a plotted novel. A Thread defined as "a commitment that wants closing" is a plotted-novel idea. This design redefines it:

> **A Thread is the standing state of an arc or relationship between known World entities, kept current as the story moves it.**

Threads are few and long-lived. They change far more often than they end.

### 1.4 The constraint that shapes everything

GLM and Xialong tend to fulfil an implication once it is stated in context. A note saying "Ada has not told Marek about the letter" produces a confession within a few paragraphs. So what the Engine _knows_ about an arc and what the story model is _shown_ must be separate.

## 2. Decisions

| Question                          | Decision                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| What is a Thread?                 | Standing state of an arc or relationship, revised as it moves                                           |
| What does the story model see?    | Only a present-tense statement of how things stand (`state`)                                            |
| Where does pending material live? | In a private field (`latent`) that never reaches the story model                                        |
| Where do Threads come from?       | Seeded at setup by the Forge or the writer; admitted mid-story only by a slow review pass               |
| When is a Thread in context?      | When its cast is on stage                                                                               |
| When does a Thread end?           | When its state has become a permanent fact, which is then written into its cast's own entries           |
| How does the slow pass work?      | One call decides; code checks; each surviving decision is a queued intent with its own small write call |

## 3. Data model

```ts
export type ThreadStatus = "open" | "concluded";

export interface Thread {
  id: string;
  title: string;
  /** What is true now. This is the lorebook entry's text. */
  state: string;
  /** Private. Never leaves Story Engine. */
  latent: string;
  entityIds: string[];
  lorebookEntryId?: string;
  status: ThreadStatus;
}
```

- `text` splits into `state` and `latent`.
- `horizon`, `anchorParagraph`, and the `satisfied` / `abandoned` statuses are removed.
- `ThreadDraft` defaults `status` to `"open"` and `latent` to `""`.

### 3.1 Where `latent` may be read

Exactly three places:

1. The review pass manifest (§5.2).
2. The Thread write call (§6.3) and the conclude revise (§5.5).
3. `ThreadEditPane`.

It is never passed to `buildStoryEnginePrefix`, `formatEntityThreads`, or any `api.v1.lorebook` write. A source-scan test enforces this (§9.1).

The conclude revise is the one deliberate route by which `latent` reaches the lorebook, and it does so only after the arc has settled.

### 3.2 Existing data

No migration. Persisted Threads that lack a `state` field are dropped on load. Their lorebook entries are disabled, not deleted, consistent with the Engine never deleting an entry.

## 4. Activation

A Thread's entry keeps `keys: []` and `forceActivation: false`. It activates through a single advanced condition, as it does today, but the condition becomes positive: the cast is present in recent story text.

| Cast size | Condition                                     |
| --------- | --------------------------------------------- |
| 0         | No lorebook entry. The Thread is ledger-only. |
| 1         | `key(A)`                                      |
| 2         | `and(key(A), key(B))`                         |
| 3 or more | `or` over every pair `and(key(X), key(Y))`    |

- In the table, `key(A)` stands for "A is on stage": an `or` over A's **aliases**, each a `key` probe `in: ["story"]` with `range: 4000` characters, roughly one scene. This is a single constant, replacing the three horizon ranges.
- A member's aliases are its lorebook entry's own `keys` plus its resolved display name (`nameKey`'d). Prose says "Oriel" far more often than "Oriel Vant", and the entry's keys are the writer's own statement of what counts as a mention. A draft entity has only its name.
- Keys are edited outside the store, so a condition can go stale. Every review pass re-syncs each open Thread's entry before it reads.
- A concluded Thread's entry is set `enabled: false`.
- A Thread that loses its last cast member has its entry disabled. Gaining a cast member creates or re-enables it. `ensureThreadEntry` already owns this path.

A cast-less Thread is reachable only by hand, since the Engine cannot admit one.

### 4.1 The cap

- `threadCap` stays, default 8, and counts **open** Threads only.
- At the cap, an `ADMIT` is refused. Nothing is displaced.
- Hand-made and Forge-made Threads are not refused at the cap. The cap restrains the Engine, not the writer.

## 5. The two passes

### 5.1 Fast pass

Unchanged in trigger, delay, assess, queue, drain, budget and refusal handling.

- Triage's vocabulary is `REVISE <entity>` or nothing.
- The triage manifest drops the Threads block and all cap text.
- The fast pass cannot create or conclude a Thread.

### 5.2 Review pass

**Trigger.** The Engine record gains `reviewWatermark`, a `Watermark` of the same shape `assess` already uses. When the paragraphs past it reach `reviewEvery` (new setting, default 25, bounds 5–200), the next pass runs a review after its triage step. A manual control also requests one (§8.2).

**Window.** The prose from the review watermark forward, up to `NEW_PROSE_LIMIT` characters, cut at a paragraph boundary. When more has accumulated than fits, the watermark advances to the end of what was read and the remainder is reviewed on a later pass. The middle is never cut out.

**Input, in order.**

1. `REVIEW_SYSTEM`
2. The Foundation: shape, intent, and story contract, as `buildStoryEnginePrefix` already formats them
3. `=== KNOWN ENTITIES ===`, names with category and summary
4. `=== THREADS ===`, each open Thread with its cast, `state` and `latent`. Threads whose cast appears in the window are tagged `[in this prose]`. Code computes the tag with `mentionsName`.
5. `=== PROSE ===`, the window
6. `REVIEW_INSTRUCTION`

**Output.** Reasoning lines and commands. The parser reads only command lines:

```
UPDATE <thread title>
ADMIT <title> | <cast name>, <cast name>
CONCLUDE <thread title>
```

The verb must be capitals, names resolve against the manifest shown, and unresolvable lines are dropped silently, as in `parseTriage`.

**Params.** Instruct model, temperature 0.3, `max_tokens` 400.

### 5.3 What code checks before queueing

1. `UPDATE` and `CONCLUDE` titles resolve to an open Thread in the manifest.
2. Every `ADMIT` cast name resolves to a known entity. At least one is required. Unresolved names drop the whole line.
3. **Sustained floor.** Every admitted cast member is named in at least 3 separate paragraphs of the window. "Named" means `mentionsName` matches the entity's name or any plain (non-regex) key of its lorebook entry, the same aliases §4 uses.
4. **No duplicates.** An `ADMIT` whose cast set equals an open Thread's cast set becomes an `UPDATE` of that Thread.
5. At most one `ADMIT` per review. Later ones are dropped.
6. No `ADMIT` when open Threads are at the cap.

Floors 2 and 3 are what make "the glass left on the table" unfilable: it is not a known entity, and an aside does not recur across three paragraphs.

### 5.4 Intents

```ts
export type Intent =
  | { kind: "revise"; entityId: string; prose: string; established?: string }
  | { kind: "condense"; entryId: string }
  | { kind: "threadWrite"; threadId: string; prose: string }
  | { kind: "admit"; title: string; entityIds: string[]; prose: string }
  | { kind: "conclude"; threadId: string; prose: string };
```

- `open` and `retire` are removed.
- `threadWrite` and `admit` both run the Thread write call (§6.3). `admit` creates the Thread and its entry only if the call returns a `state` that passes the lint, so a declined admission leaves the World untouched.
- Both are priced at 300 output tokens in `INTENT_MAX_TOKENS`.

### 5.5 Conclude

`conclude` costs no generation itself. It:

1. Sets the Thread's status to `concluded` and disables its entry.
2. Queues one `revise` per cast member that has a lorebook entry, with `established` set to the Thread's title, `state` and `latent`.

The revise prompt receives `established` as an extra block, `=== NOW SETTLED ===`, between the entry and the prose. `ENGINE_REVISE_SYSTEM` gains one rule: what that block states is established and may enter the entry as the condition it left behind.

These rewrites take the existing `ENTRY_REWRITES_PER_PASS` limit, so a two-person conclusion completes over two passes.

When a queued `revise` for the same entity already exists, the incoming one replaces it if it carries `established`. Otherwise the settled fact would be lost to deduplication.

### 5.6 Budget

| Step               | Output tokens                              |
| ------------------ | ------------------------------------------ |
| Review decisions   | up to 400                                  |
| Thread write, each | up to 300                                  |
| Lint retry, each   | up to 300                                  |
| Conclude           | 0, plus one entity rewrite per cast member |

A review that updates two Threads costs up to about 1000 tokens, once per 25 paragraphs, against 2048 per 240 seconds. The drain defers what the bucket cannot cover, as it does now.

## 6. Prompts

All are named exports in `src/core/utils/prompts.ts`. The texts below are drafted to the principles in `external/Prompt Engineering Principles.md` and are **unmeasured** until the harness in §9.2 has been run against the real model.

Example nouns are taken from a harbour-pilot setting chosen to be unlike typical story inputs.

### 6.1 `TRIAGE_SYSTEM` (replaces the current text)

```
You are the triage pass of a story engine. You read the prose a writer has just produced and answer one question: which recorded entities does that prose make wrong?

You never write prose and never invent. You record what the story has made true; you do not decide what happens next.

For each entity under KNOWN ENTITIES that the NEW PROSE names, answer in order:
1. What does the new prose show about this entity? Write it in one short line. If the prose only mentions the entity and shows nothing about it, stop: no command.
2. Does the entity's record say otherwise, or leave out a lasting condition the prose has now set? YES: REVISE. NO: no command.

Example:
Oriel Vant: the prose shows her pilot's licence is revoked, and her record calls her the harbour's senior pilot: REVISE
Tam Beck: the prose has him pour two cups and sit down, which leaves no lasting condition: no command
REVISE Oriel Vant

OUTPUT:
- One reasoning line per entity the prose names, then the commands, one per line.
- A command is the word REVISE in capitals, then the entity's name spelled exactly as KNOWN ENTITIES spells it.
- Most passes need no command. Writing none is a correct and common answer.
```

`TRIAGE_INSTRUCTION` becomes: `Which entities does the new prose above make wrong? Walk each one the prose names, then write the commands, or none.`

### 6.2 `REVIEW_SYSTEM` (new)

```
You are the review pass of a story engine. You read a scene's worth of prose and keep a short list of Threads true. A Thread records how things stand between known entities: an alliance, a rivalry, a debt, a claim one holds over another.

You never write prose and never invent. You record what the story has made true; you do not decide what happens next.

PART ONE. For each Thread tagged [in this prose], answer in order:
1. What does the prose show passing between this Thread's cast? Write it in one line. If the prose shows nothing passing between them, stop: no command.
2. Can a later scene still change how things stand between them? If it cannot, because one of them is dead, the tie is severed, or what was hidden is now known to everyone it was hidden from: CONCLUDE.
3. Otherwise, does the Thread's recorded state or its private notes now say something the prose has made untrue or incomplete? YES: UPDATE. NO: no command.

PART TWO. Admission. Answer in order:
1. Name two or more entities from KNOWN ENTITIES whose standing toward each other this prose establishes or changes, and who share no Thread already. If there are none, stop: no command.
2. Write, in one line, what stands between them at the end of this prose.
3. Does more than one moment in this prose turn on it? Name the moments. If only one does, stop: no command.
4. ADMIT, with a title of two to five words and the cast.

Example:
The Tidewater Debt: the prose shows Oriel Vant pay Tam Beck the last instalment and Beck burn the note; a later scene could still change how they stand; the record says she owes him: UPDATE
Pilots and Customs: the prose shows nothing passing between Hale and the customs house: no command
Admission: Oriel Vant and Maren Sole. Sole now holds Vant's revoked licence and decides who sees it. The hearing turns on it, and so does Vant refusing the night berth: ADMIT
Admission, a case that stops: Tam Beck and a dockhand trade insults at the gate. The dockhand is not under KNOWN ENTITIES: no command
UPDATE The Tidewater Debt
ADMIT The Revoked Licence | Oriel Vant, Maren Sole

OUTPUT:
- Reasoning lines first, each stating what the prose shows and then its answer. Then the commands, one per line.
- UPDATE and CONCLUDE take a Thread title spelled exactly as THREADS spells it.
- ADMIT takes a title, a bar, then cast names spelled exactly as KNOWN ENTITIES spells them, separated by commas.
- At most one ADMIT.
- Most reviews change little. Writing no command is a correct and common answer.
```

`REVIEW_INSTRUCTION`: `Walk each Thread tagged [in this prose], then admission, then write the commands, or none.`

### 6.3 `THREAD_WRITE_SYSTEM` (new, replaces `ENGINE_OPEN_SYSTEM`)

```
You are the archivist of a story engine. You keep one Thread at a time: a record of how things stand between the entities in its cast.

A Thread has two parts with different readers. STATE is shown to the model writing the story whenever the cast is on the page together. LATENT is private and that model never sees it.

That difference decides what goes where. The story model acts on whatever it is shown: if it reads that something has not happened, it writes it happening. So anything that points forward goes in LATENT, and STATE says only what is already so.

Write three fields, in this order:
MOVED: what the prose shows changed between the cast. One or two sentences.
LATENT: what is unspoken, unpaid, concealed, or unknown to one of them. Write "none" when the prose shows nothing of the kind.
STATE: how things stand between them. One or two sentences, present tense, each person and thing named, no pronoun without a name beside it.

The same facts, sorted:
LATENT: Maren Sole has not shown the revoked licence to the harbour board, and Oriel Vant does not know whether she will.
STATE: Maren Sole keeps Oriel Vant's revoked pilot's licence in the customs strongbox. Oriel Vant takes no night berths and works the day tide under another pilot's name.

Two lines that look alike and belong in different fields:
"Tam Beck holds the note on Oriel Vant's boat." This is so now: STATE.
"Tam Beck has yet to call in the note on Oriel Vant's boat." This points at a thing to come: LATENT.

RULES:
- Only the prose and the Thread as it stands may supply facts. Do not add a motive or a consequence the prose does not show.
- When a Thread is given as it currently stands, carry across what is still true. What you leave out is deleted.
- STATE never mentions the story, a scene, the reader, or this record.
- Return the three fields and nothing else.
```

`THREAD_WRITE_INSTRUCTION`: `Write MOVED, then LATENT, then STATE for the Thread above, from the prose above.`

**Input order:** system, the cast's entity summaries, the Thread as it stands (title, cast, `state`, `latent`; for an admission, title and cast only, marked `new`), the prose window, the instruction.

**Params:** instruct model, temperature 0.4, `max_tokens` 300.

**Parser.** Matches a line beginning with the label and a colon, tolerating bold markers and leading bullets. `MOVED` is logged and discarded. A missing `STATE` declines the intent.

### 6.4 The `STATE` lint

Code rejects a `STATE` containing any of these as whole words or phrases, case-insensitive:

`yet`, `hasn't`, `has not`, `haven't`, `have not`, `soon`, `will`, `about to`, `until`, `must`, `waiting`, `sooner or later`, `one day`, `eventually`

- On rejection the call is retried **once**, in the same conversation, with a user message: `STATE contains "<phrase>", which points forward. Move that to LATENT. STATE says only what is already so. Write all three fields again.`
- On a second rejection, a `threadWrite` keeps the Thread's previous `state` and `latent`, and an `admit` is declined.
- Each rejection is logged with the phrase.

This is a lint over surface form, not a reading of meaning. It will sometimes reject an innocent word. The cost is one retry. It deliberately omits `still`, which is too common in innocent use ("stands still", "the still water").

### 6.5 `ENGINE_REVISE_SYSTEM`

One rule is added under RULES:

`- When a NOW SETTLED block is given, what it states is established. It may enter the entry, as the condition it left behind.`

And the existing rule "Only the new prose may add facts" becomes "Only the new prose, and a NOW SETTLED block when one is given, may add facts."

### 6.6 Forge and the attended Thread generator

- The Forge command becomes `[THREAD "<Title>" | "<A>", "<B>" | <state> | <latent>]`. The three-segment form remains valid and yields an empty `latent`.
- The Forge prompt's description of `[THREAD]` gains the state-versus-latent pair from §6.3, in its own example nouns.
- `THREAD_SUMMARY_PROMPT`, the generator behind the edit pane's button, writes `state` and takes the same rule that `state` says only what is already so. It does not write `latent`.
- `formatEntityThreads` in `lorebook-strategy.ts` emits `state` only.

## 7. What is deleted

- `src/core/engine/thread-horizon.ts`. `PARAGRAPH_CHARS` moves to `settings.ts`.
- From `thread-cap.ts`: `displacementOrder`, `displacedByNextThread`, `EXPIRY_WINDOWS`, `THREAD_EXPIRY_PARAGRAPHS`, `isThreadExpired`, `expiredThreads`, `renewedThreads`. `enforceThreadCap` reduces to a count check used by admission.
- From `thread-condition.ts`: the negated detector, `paceGate`, and the title probe. `buildThreadCondition` is rewritten per §4.
- `src/core/engine/open-strategy.ts`, `ENGINE_OPEN_SYSTEM`, `ENGINE_OPEN_INSTRUCTION`.
- From `thread-bind.ts`: `castFromSubject`, `findThreadBySubject`, `rebuildThreadCondition`'s anchor handling.
- `OPEN` and `RETIRE` in `parseTriage`; `TriageThread` and `threadCap` in `TriageManifest`.
- The horizon picker in `ThreadEditPane`; the three-way branch in `ThreadStatusIcon` and `thread-display.ts`.
- The tests for all of the above.

## 8. UI

### 8.1 World tab

- A Thread row shows title, cast, and `state`.
- `ThreadStatusIcon` renders both states at fixed positions and toggles `display`, per the project's rule against swapping component types.
- Concluded Threads sit under a collapsed fold at the bottom of the section.
- `ThreadEditPane` has two text areas:
  - **State**, with the help text "What the story model sees when this cast is on the page."
  - **Private notes**, with the help text "Never shown to the story model."
- Both bind with `onInput` and flush on Save. One render path serves every Thread.
- A cast-less Thread shows "Not in the lorebook: add a cast" where the entry link would be.

### 8.2 Engine tab and HUD

- New setting **Review every (paragraphs)**, default 25.
- **Thread limit** help text: "The Engine admits no new Thread past this many open ones."
- The HUD shows paragraphs remaining until the next review.
- A review control sits beside ⚡. Its enabled state comes from `deriveHud()` in `hud-model.ts`, which already owns the ⚡ and is the only place under `src/ui/` that reads the loop's phase.
- The Engine log records each admitted, updated, concluded, refused and declined Thread with its reason (which floor refused it, or which phrase the lint caught).

## 9. Testing

### 9.1 Unit tests (vitest)

- `parseReview`: verbs, name resolution, dropped lines, CRLF, decoration.
- Each floor in §5.3, including the refused cases.
- The `STATE` lint: each phrase, whole-word matching, the retry message, and both fallbacks.
- The Thread write parser against several differently decorated outputs.
- `buildThreadCondition` for cast sizes 0, 1, 2, 3 and 5.
- Conclude: status, entry disabled, revises queued with `established`, and the dedupe replacement rule.
- Review windowing: watermark advance, and a backlog larger than one window.
- **Source scan:** no file other than `review-strategy.ts`, `thread-write-strategy.ts`, `execute.ts`, the world slice, persistence, and `ThreadEditPane.tsx` reads `.latent`.
- The loop reducer with the review step, table-tested as it is today.

### 9.2 Prompt harness (live, not in CI)

`tools/review-probe.naiscript`, in the style of the existing probes. It runs each fixture 20 times against the real instruct model at the shipped sampling and logs denominated counts.

| Fixture                                                            | Contract                                     |
| ------------------------------------------------------------------ | -------------------------------------------- |
| A window of incidental detail among known entities                 | No `ADMIT` in any run                        |
| Two known entities whose standing shifts across several paragraphs | Exactly one `ADMIT`, naming both             |
| An open Thread whose cast appears but nothing passes between them  | No `UPDATE`                                  |
| An open Thread whose state the prose reverses                      | `UPDATE` in every run                        |
| A Thread write whose prose is dense with pending material          | `STATE` passes the lint on the first attempt |

Fixture nouns come from a domain that neither the prompts' examples nor real stories use. The harness is run by the writer inside NovelAI. Prompt text is revised by the fixing procedure in the principles document, measured by distribution, not by a single run.

## 10. Release

- `project.yaml` version to 0.16.0: a data-model and pipeline change, which is a minor bump under the alpha rule.
- A `CHANGELOG.md` section written as a release note.
- `CLAUDE.md` gains a short Threads paragraph stating the state/latent split and the rule that `latent` never reaches the story model.
- The August Engine spec's §4 gets a "superseded by" pointer to this document.

## 11. Out of scope

- **Mid-story entity creation.** The Engine admits Threads only about entities the World knows, and nothing mid-story creates entities. A major character the story invents stays invisible to the Engine until the writer or a Forge pass adds them.
- **The setup funnel**: brainstorm chat to Foundation to Bootstrap.
- Any change to revise or condense beyond the `established` block.
