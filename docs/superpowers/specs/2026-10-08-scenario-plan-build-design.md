# Scenario chat: Plan and Build

**Date:** 2026-10-08
**Target version:** 0.15.0 (no bump; 0.15 is unreleased)
**Amends:** `2026-10-07-scenario-chat-design.md`. Where the two disagree, this document wins. Everything in the earlier spec that this one does not mention still holds.

## Why

The first Scenario chat put conversation and construction in one turn on GLM. On first contact the writer's opening message produced eight to twelve entities with no talk-through, and GLM's voice bent towards tropes and repeated characters. The old Brainstorm was the better conversation, and it ran on Xialong.

The fix is the split an agentic coding harness makes: a mode for talking and a mode for acting.

## What stays from the earlier spec

- One chat type, `scenario`. Brainstorm, Forge, Critic and Summarize stay removed.
- The Engine authors conditions, never plots. Anything "to come" is recorded as what is true now, plus a private wish.
- `THREAD` has exactly five segments; `private` in the prompt is `latent` in code; rejection reasons are written as repairs and fed to the next building turn.
- `latent` and `wish` privacy, their allow-lists and sentinel tests.
- The chat transcript enters no other generation's prefix.
- Chat paging, Cast drafts / Discard drafts, `keepKnownChats`, `draftsReleasedFromChat`.

## Modes

The Scenario chat has two modes, `plan` and `build`, held in the chat's existing `subMode` field. A new chat starts in `plan`. A chat with no `subMode` (one saved before this change) is treated as `plan`.

The header shows a `Plan | Build` toggle. Switching modes generates nothing. The mode in force when the writer sends decides the turn. Each assistant message records the mode that wrote it (`mode: "plan" | "build"` on the message); a message without one is rendered as it is today.

### Plan turn

- **Model:** the Creative model setting (`"creative"` capability). Xialong gets a chat-style prefix; GLM gets the same collaborator prompt without it.
- **Prompt:** `SCENARIO_PLAN_PROMPT` plus a per-Intensity note (`SCENARIO_PLAN_REGISTERS`). The voice is the old cowriter: enthusiastic about what works, honest about what does not. It discusses any arc or ending the writer raises. What it offers back is pressures, people and standing situations, typically by asking what must be true when the story opens for that to be possible. It does not volunteer plots, and it writes no commands.
- **Context:** Foundation and Setting; what is built so far (`[POOL]`, `[LIVE]`, `[THREADS]` as title, cast and state); the conversation, with Build replies shown as their commands only (see below).
- **Output:** prose. A Plan reply is never parsed for commands; anything bracketed in it is text.
- **Empty send:** refused. Plan needs a message.
- **Unset Intensity:** a neutral register note. Plan no longer opens with a question about pressure.

### Build turn

- **Model:** always GLM (`"instruct"` capability).
- **Prompt:** `SCENARIO_BUILD_PROMPT` plus a per-Intensity note (`SCENARIO_BUILD_REGISTERS`). It tells the model to think out loud first, then write commands, one per line. The thinking covers: what the conversation agreed, what is already built, and for each thing the writer wants, whether it is already so or to come.
- **Scope rule:** build what the conversation supports and no more. Add what was discussed and is missing; revise what later talk changed; invent nothing the conversation did not raise. The Intensity note is a ceiling on pressures across the whole scenario, not a quota.
- **Context:** Foundation and Setting; `[POOL]`, `[LIVE]`, `[THREADS]`, `[TOMBSTONES]`, `[REJECTED LAST TURN]`; the conversation, with earlier Build replies as commands only.
- **Empty send:** allowed once the chat has any message. It stands for a fixed instruction (`SCENARIO_BUILD_INSTRUCTION`: build what has been discussed). A typed message narrows or directs the build.
- **Output:** thinking, then commands. No summary line, no critique, no closing question.
- **`enable_thinking` is not used.** It is reported to lose and truncate output in NovelAI. Existing `</think>` handling is unchanged.

### Thinking is positional

In a Build reply, every run of text that is not a recognised command line is thinking: before, between or after commands, with or without markers. Commands are parsed from command lines only, as today, so a command named inside a sentence is not applied.

### What later turns see of a Build reply

When a Build reply is placed in a later turn's context (Plan or Build), it is reduced to its command lines, joined by newlines. The thinking is dropped. A Build reply with no commands is omitted from context entirely. `THREAD` lines keep all five segments; this is the chat's own transcript, which no other generation reads.

## Commands

The set is `CREATE`, `REVISE`, `RENAME`, `DELETE`, `THREAD`. `CRITIQUE` is removed from the prompt, the parser, the executor and the context (`[PREVIOUS CRITIQUE]`, `extractLastCritique`). A `[CRITIQUE | …]` line in an old saved reply is plain text.

## Removed

- `scenarioTurn` and the sketch / steer / grow turn kinds, `SCENARIO_GROW_INSTRUCTION`, the `TURN:` line in the context block.
- `SCENARIO_PROMPT`, `SCENARIO_REGISTERS`, `buildScenarioPrompt`, including the uncommitted small-sketch edit of 2026-10-07.
- The unset-register YES/NO chain.

Internal names keep "forge" for the command mechanism. A Build turn is the existing `forgeChat` request. A Plan turn has its own message factory (its context is not the story prefix) but targets the ordinary `chat` request, so the ordinary chat handler commits it and nothing reads it for commands.

## Pills

Rendering applies to Build replies. Plan replies and user messages are ordinary bubbles.

### Collapsed

A Build reply renders as a wrapping row of small pills, in the order the reply wrote them:

`[thinking]` `[create | "Hesper Vane"]` `[thread | "Half the House"]` `[revise | "Corin Vane"]` `[rename | "Corin" → "Corin Vane"]` `[delete | "The Mill"]`

- Verb in lower case; the label is the name or title. Entity type is not shown collapsed.
- A rejected or unrecognised command is visibly distinct (warning colour).
- Adjacent thinking with nothing between it is one pill. An empty or whitespace-only run makes no pill.
- While streaming: the thinking pill reads "thinking…" until the first command line completes; pills appear as command lines complete.

### Expanded

Clicking a pill toggles its body, shown under the pill row. Several may be open.

| Pill                    | Body                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| thinking                | the text                                                                                            |
| create, revise          | type (create only) and summary                                                                      |
| thread                  | cast; state; private; wish, each labelled. Private and wish carry "Never shown to the story model." |
| rename, delete          | none; the pill does not expand                                                                      |
| rejected / unrecognised | the reason, then whatever the command carried                                                       |

- Open or closed is view state, not stored. A reopened chat is all collapsed.
- A pill shows what the command said. It does not follow later edits to the entity.
- Each pill's body is mounted once and its `display` toggled. No component-type swap at a fixed position.
- The label function is pure and lives beside the segment types so it can be unit-tested.

The stored projection (`forgeSegments`: prose runs and action records) already carries what the pills need. Prose segments of a Build reply are the thinking.

## Send behaviour

| Mode  | Message                  | Result                                |
| ----- | ------------------------ | ------------------------------------- |
| plan  | text                     | user message, Plan turn               |
| plan  | empty                    | nothing                               |
| build | text                     | user message, Build turn              |
| build | empty, chat has messages | Build turn with the fixed instruction |
| build | empty, chat is empty     | nothing                               |

A send is refused while a turn or reference scrub for this chat is queued or running, as today. Retry of a reply re-runs it in the mode that wrote it.

Placeholder text follows the mode: Plan, "Talk the scenario through…"; Build, "Say what to build, or send empty to build what you've discussed…".

## Changelog

Still one `[0.15.0]` section. The Scenario chat entry is rewritten to describe Plan and Build as the design. No entry describes sketch/steer/grow, the critique, or the opening Intensity question, since no release had them.

## Testing

Unit tests:

- A new chat is in `plan`; a chat without `subMode` reads as `plan`; the toggle changes it and generates nothing.
- A Plan turn asks for the creative capability, a Build turn for instruct.
- A Plan reply containing a command line applies nothing and creates no segments.
- The send table above, row by row.
- Build context: an earlier Build reply appears as command lines only; a command-less Build reply is absent; thinking text appears nowhere in it.
- Plan context contains no `[TOMBSTONES]` or `[REJECTED LAST TURN]`, and no thinking.
- The thinking/command split: text before, between and after commands; no pill for whitespace.
- Pill labels for every command kind, including rename and a rejected command.
- `CRITIQUE` is not parsed.
- `latent-privacy.test.ts` and `private-notes-sinks.test.ts` still pass without extending an allow-list.

Probe (`tools/scenario-probe.naiscript`), rebuilt around Build:

- Each fixture is a short Plan conversation (user and assistant turns, written by hand) followed by an empty Build send.
- Keeps ToCome, AlreadySo and TwoWishes with event-matched checks.
- Adds an over-building count per run: entities created whose names the conversation never mentions, reported as a number, not as pass/fail.
- Keeps the per-run pass line, the "not measured" count, the budget wait and the Continue button.
- `tests/tools/scenario-probe.test.ts` keeps the probe's prompt copy and parser in step with the shipped ones.

Not measured by any test: Plan's voice, and whether Xialong avoids the tropes GLM fell into. That is judged by the writer in the chat.

## Known limits

- The scope rule and "think first" are prompt instructions. They hold as well as the probe shows.
- Thinking shares Build's output allowance with the commands. Build asks for 1024 tokens per call and continues up to four times, since a generation is refused until the bucket holds `max_tokens`; a long think costs a continuation, not the commands.
- A new story plans on GLM until the writer sets the Creative model to Xialong.
- Carried over, unchanged: retry of a Build turn does not undo what the first attempt applied; Scenario Threads get live lorebook entries before drafts are cast; the long-chat lockup is unmeasured; `npm run build` must be run outside the sandbox.
