# The Scenario chat — Brainstorm and Forge become one, and the Engine stops naming destinations

**Status:** design approved in conversation 2026-10-07; awaiting written-spec review
**Target version:** 0.15.0 (the in-progress version; no new bump)
**Supersedes:** the Brainstorm chat, the Forge chat and its phase loop, and the Foundation's Shape and Intent fields

## 1. Why

### 1.1 The strategic change

Story Engine becomes a Scenario Engine. A model that continues prose has nowhere to keep "not yet": shown a destination, it writes the arrival, or writes as though the arrival already happened. Structural arcs and plots are therefore a poor fit for NovelAI, and the Engine stops authoring them.

What it authors instead is the set of preconditions for the blank page: pressures with direction, a setting that pulls, and entities placed so that they collide. The writer may ask for an arc. The Engine returns the conditions from which that arc could emerge.

### 1.2 What the repo already knows

`2026-10-05-threads-as-standing-state-design.md` §1.4 states the constraint for Threads: what the Engine knows and what the story model is shown must be separate. This spec applies the same rule to everything written before page one.

### 1.3 What contradicts it today

Read from `src/core/utils/prompts.ts` and `context-builder.ts`:

1. `BRAINSTORM_FRAME` "thinks in story structure" and looks for "the fork — the decision".
2. Each `BRAINSTORM_REGISTERS` text defines the story's engine as a choice (Gritty: "a single choice that crosses a line").
3. `CRUCIBLE_SHAPE_PROMPT` asks for "the kind of moment the story is building toward" and the logic "that governs its endpoint".
4. `FOUNDATION_INTENT_PROMPT` asks for a logline with "what's at stake".
5. `formatFoundationBlock` renders `Shape:` and `Intent:` into the shared generation prefix, so both reach every generation that uses it.

### 1.4 The series this spec starts

| Spec         | Covers                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **This one** | The Scenario chat, the Foundation's Situation line, chat paging                                  |
| Next         | Just-in-time fleshing of stubs in the live engine; removal of SEGA                               |
| After        | Keep-alive: review and Threads re-pointed at pressures, and the review reading the writer's wish |

SEGA and the live engine are untouched here. Sketch items are ordinary drafts, so the existing fleshing path keeps working until the next spec replaces it.

## 2. Decisions

| Question                                           | Decision                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What happens to a destination the writer asks for? | Translated into present conditions; the wish itself is kept, writer-only                   |
| How is the Scenario built?                         | Sketch, then steer: the first reply is a sketch, each later turn edits it                  |
| What is a force?                                   | No new kind: a Thread (between entities, or on one) or a Situational Dynamic (on everyone) |
| May a Thread have one member?                      | Yes, when the chat or the writer makes it. The review still admits only two or more        |
| Shape and Intent?                                  | Shape removed. Intent replaced by a Situation line                                         |
| Brainstorm and Forge?                              | One Scenario chat, on the Forge's command mechanism                                        |
| Critic mode?                                       | Removed. The per-turn critique line does that job                                          |
| Intensity?                                         | Kept, explicit. It sets how many pressures and of what kind                                |
| Long chats?                                        | A 25-message window with "load more"; view state only                                      |
| Migration?                                         | None. Existing Brainstorm and Forge chats and stored Shape are dropped                     |

## 3. Data model

### 3.1 What the sketch holds

| Item                                 | Stored as                                                                     | Change                            |
| ------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------- |
| Stub                                 | A draft `WorldEntity`: name, category, summary                                | None                              |
| World pressure                       | A draft entity in Situational Dynamics, summary in "setup; complication" form | Prompt wording only               |
| Pressure between entities, or on one | A `Thread` with `state` and `latent`                                          | Cast of one allowed from the chat |
| The writer's wish                    | `Thread.wish?: string`                                                        | New field                         |

A world pressure follows the craft doc's rule for situations: it creates pressure and stops. It never says what anyone chooses or how it ends.

### 3.2 `wish`

A wish is something the writer wants to come about that has not happened when the story opens ("she eventually betrays him").

It is not stored in `latent`. `latent` holds what is true now and hidden, and `conclude()` folds it into each cast member's entry as `established`. A wish folded that way would be written into an entry as having happened.

Rules:

- `wish` is set by the Scenario chat's `THREAD` command and by the writer in the Thread edit pane.
- `wish` is never read by any generation strategy in this spec. That includes the review pass; the keep-alive spec decides whether the review reads it.
- `conclude()` does not fold it into anything.
- `syncThreadEntry` never writes it.
- `THREAD_WRITE` neither reads nor rewrites it; a Thread update carries it across unchanged.

### 3.3 Where `wish` may be named

`tests/core/engine/latent-privacy.test.ts` gains a second scan for `wish` with its own allow-list: the store type and slice, the persistence shard, the Scenario command parser and its apply step, and the Thread edit pane. `private-notes-sinks.test.ts` gains a `wish` sentinel checked against the same sinks as `latent`.

### 3.4 Single-member Threads

`buildThreadCondition` and `buildReviewManifest` already handle a cast of one. The two-member minimum lives only in the Forge's `THREAD` wording ("2–4 elements") and the review's admission step. The first goes with the Forge prompts. The second stays: a lasting condition on one entity is already triage's `REVISE` of that entity's entry, and two passes should not compete for one fact.

## 4. The Scenario chat

### 4.1 Mechanism

A new chat type, `scenario`, replaces `brainstorm` and `forge`. It keeps the Forge's mechanism:

- Commands in a reply are parsed and applied to the draft pool when the turn completes.
- Applied commands render as chips in the transcript, with each draft's card inline.
- Discarding a draft tombstones its name and queues the existing reference-cleanup turn.
- A second send while a turn is queued or running is refused.

Casting drafts does not end the session. The sessions control stays, so a writer can start a fresh chat.

### 4.2 Turns

One system prompt serves all three.

| Turn   | Trigger                              | Behaviour                                           |
| ------ | ------------------------------------ | --------------------------------------------------- |
| Sketch | The first message: the writer's seed | Builds the first sketch                             |
| Steer  | Any later non-empty message          | Converses; emits commands for what was asked        |
| Grow   | An empty send                        | One autonomous pass acting on its own last critique |

The sketch/expand/weave cycle, its three prompts, and the phase indicator are removed.

### 4.3 Commands

```
[CREATE <TYPE> "<Name>" | summary]
[REVISE "<Name>" | summary]
[RENAME "<Old>" → "<New>"]
[DELETE "<Name>"]
[THREAD "<Title>" | "<A>"[, "<B>"…] | state | latent | wish]
[CRITIQUE | text]
```

`<TYPE>` is one of CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION, TOPIC. `THREAD` takes one to four members. Its `latent` and `wish` segments may be empty; a `THREAD` with fewer than five segments is rejected with the repair "write all five segments; leave latent or wish empty between bars when there is none".

### 4.4 The order of a sketch

Prompt order is causal order, so the chain asks for pressures before the cast, and the commands come out in the same order:

1. Quote what the writer is drawn to in the seed.
2. What must be true of the world for that to be so? One `CREATE SITUATION` per pressure. Intensity sets the count (§4.6).
3. Who stands where in those pressures, on different sides of them? `CREATE CHARACTER` and `CREATE FACTION`.
4. Where do the pressures become visible? `CREATE LOCATION`. Systems and topics only where a pressure needs one.
5. What stands between particular entities, or bears on one? `THREAD`.
6. `CRITIQUE`: which entity has nothing pressing on it, and which pressure has nobody under it.

The reply also carries two or three sentences of prose and one question.

### 4.5 Translating a destination

A decision chain, asked of each thing the writer says they want:

1. Is it already so when the story opens? YES: write it as standing fact, in a summary or a Thread's `state`. NO: continue.
2. It is something to come. Write what is true now that makes it possible, as `state`, a summary, or a `SITUATION`. Write the thing itself in the `wish` segment of the Thread whose cast it concerns, and nowhere else.

The prose of the reply says what was done with the wish, so the writer sees the translation.

The worked example in the prompt is a minimal pair: one request that is already so at the opening, and one that is to come, each walked through both steps in its own words.

### 4.6 Intensity

The five register texts are rewritten. Each says what kind of pressure that intensity carries and how many, following the craft doc, and no longer names a decision as the story's engine.

| Register  | Pressures | Kind                                                                          |
| --------- | --------- | ----------------------------------------------------------------------------- |
| Cozy      | 2         | Friction of preference and circumstance; none is required, and none threatens |
| Grounded  | 2–3       | Real obstacles at the scale of a life; recovery expected                      |
| Gritty    | 3         | Stakes that last; walking away is possible but not free                       |
| Noir      | 3         | Pressures that trap; every position on the board costs                        |
| Nightmare | 3–4       | A hostile system pressing from several directions                             |

An unset register still asks the one question that settles it before sketching.

### 4.7 Context

Each turn is given the Foundation block, the live World, the current drafts, the tombstones, and the full transcript. The transcript enters no other generation's prefix: `formatBrainstormBlock` and the redaction it needed are deleted, and the sketch's items are the record.

## 5. Foundation

- **Shape is removed:** the field, `CRUCIBLE_SHAPE_PROMPT`, its handler, its line in `formatFoundationBlock`, the style tags derived from it, and its Import wizard step.
- **Intent becomes Situation:** one or two present-tense sentences saying what is happening and which goods are opposed. It names no outcome. `FOUNDATION_INTENT_PROMPT` is replaced, examples included; the current examples are loglines.
- **Its source changes:** generating the Situation reads the World's Situational Dynamics and Threads' `state`.
- **Unchanged:** Contract, ATTG, Style, intensity, World State.

## 6. Chat paging

- `Chat.tsx` renders a window of 25 messages over the active chat's list. The window's position is component state and never enters the store.
- A "load more" bubble appears at the top when older messages are hidden, and at the bottom when the writer has paged back.
- Sending a message resets the window to the newest 25.
- Prompt construction keeps reading the full list from the store. Nothing in `contextSlice` or any strategy sees the window.

`Chat.tsx` also builds a key from every message's id and content length on each store update. That cost grows with chat length whatever is shown. It is measured on a chat of several hundred messages before the window lands; if it is a real share of the lockup, it is fixed in the same unit.

## 7. What is deleted

- `chat-types/brainstorm.ts`, `chat-types/forge.ts`, and the brainstorm variant of `chat-types/summary.ts` (the story-text variant stays).
- `BRAINSTORM_FRAME`, `BRAINSTORM_CRITIC_FRAME`, `BRAINSTORM_SUMMARIZE_PROMPT`, `FORGE_PROMPT`, `FORGE_SKETCH_PROMPT`, `FORGE_EXPAND_PROMPT`, `FORGE_WEAVE_PROMPT`, `FORGE_DISCUSS_PROMPT`, `CRUCIBLE_SHAPE_PROMPT`.
- The phase selector and phase state in the forge slice.
- `formatBrainstormBlock` and `redactThreadPrivateNotes`.
- The sub-mode toggle and summarise button in the chat header.

Callers found by search and not yet read, to be updated in the plan: `bootstrap-effects.ts`, `setup/BrainstormCta.tsx`, `setup/setup-model.ts`, `import/ImportFoundation.tsx`, `import/ImportWizard.tsx`.

## 8. Testing

### 8.1 Unit tests (vitest)

- The five-segment `THREAD` parse, including empty `latent` and `wish`, and the rejection text for a short one.
- A `THREAD` with one member creates a Thread whose entry condition is that member on stage.
- `wish` survives a `threadWrite` update and is absent from `conclude()`'s `established`.
- The `wish` identifier scan and the `wish` sentinel over every sink.
- The paging window: default position, both "load more" directions, and reset on send.
- No strategy output changes with the window position.

### 8.2 Prompt probe (live, not in CI)

`tools/scenario-probe.naiscript`, on the pattern of `review-probe`: twenty runs per fixture at the shipped sampling, every count reported as failing runs of twenty.

Contract: a seed that asks for something to come produces a sketch whose `wish` segment holds it, and whose summaries and `state` do not assert it.

Fixtures use nouns from domains the real inputs do not touch. Each destination carries a distinctive invented noun; the probe asserts that noun appears in a `wish` segment and in no summary or `state`. A second fixture asks for something already so at the opening and asserts the noun appears in a summary or `state` and in no `wish`, so the absence assertion is not vacuous.

The sentinel catches a leaked noun. It does not catch a paraphrase that avoids the noun, so the first suites are also read by hand.

## 9. Release

No version bump. This work ships in 0.15.0, the version in progress since 0.14, and its user-visible changes are folded into that version's `CHANGELOG.md` section.

## 10. Out of scope

- Just-in-time fleshing, the two fleshing tiers, and the removal of SEGA.
- The review pass reading `wish`, and any re-pointing of review or triage at pressures.
- Changes to the lorebook entry templates.
