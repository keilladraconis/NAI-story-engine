# Threads as Standing State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Engine flooding the World with trivial Threads by redefining a Thread as the standing state of an arc between known entities, admitted only by a slow review pass, with a private `latent` field the story model never sees.

**Architecture:** The per-generation fast pass keeps only `REVISE`. A new review pass, triggered by prose volume, reads a scene-sized window with the Foundation in view and emits `UPDATE` / `ADMIT` / `CONCLUDE` decisions; code floors filter them, and each survivor is a queued intent drained by the existing budget-governed drain. A Thread stores `state` (mirrored into its lorebook entry, active when its cast is on stage) and `latent` (never leaves Story Engine).

**Tech Stack:** TypeScript (strict), nai-store, nai-gen-x, Preact JSX, vitest, NovelAI script API (`external/script-types.d.ts`).

**Spec:** `docs/superpowers/specs/2026-10-05-threads-as-standing-state-design.md`. Read it before starting any task. Section numbers below (§) refer to it.

## Global Constraints

- All prompts are named exports in `src/core/utils/prompts.ts`. Never put prompt text in strategy files or `project.yaml`.
- Every Engine write to an existing lorebook entry goes through `writeLorebookEntry` in `src/core/engine/lorebook-write.ts`. Only `createEntry` is called directly.
- `latent` is named only in the ten files Task 8's scan allows: `store/types.ts`, `slices/world.ts`, `persistence/story-store.ts`, `handlers/forge-chat.ts`, `crucible-command-parser.ts`, `loop-machine.ts`, `review-strategy.ts`, `thread-write-strategy.ts`, `execute.ts` and `ThreadEditPane.tsx`. Anywhere else, including comments, write "the private notes".
- No `setTimeout`, no `console.log`: use `api.v1.timers` and `api.v1.log`. No `any` casts on API calls.
- Text inputs bind with `onInput`. Never swap a component type at a fixed position; mount every variant and toggle `display`.
- No migration code beyond what Task 2 specifies for dropping old Threads.
- Engine generations pass `maxRetries: 0` and `fastRejection: true`, and run on the instruct model via `buildModelParams(..., "instruct")`.
- Match the surrounding files' comment density: each exported function gets a doc comment saying why, as its neighbours do.
- Prettier is pinned. Run `npm run format` before each commit. If it rewrites a file you did not touch, stop: the formatter is wrong, not the repo.
- Version goes to `0.16.0` once, in Task 8. Do not bump it earlier.
- Example nouns in prompts come from the harbour-pilot setting in spec §6. Test fixture nouns must come from a different domain (this plan uses a beekeeping cooperative).

## Review Focus

1. **A cast member the prose calls by a short form.** The World says "Oriel Vant", the prose says "Oriel". A reasonable person expects the Thread to activate and the admission floor to count those paragraphs. Pinned in Task 2 (aliases in the condition) and Task 5 (aliases in the floor).
2. **A member's lorebook keys edited after the Thread's entry was built.** The writer expects the Thread to follow the new keys. Pinned in Task 7 (every review re-syncs open Thread entries).
3. **A queue persisted by 0.15 holding `open` or `retire` intents.** The writer expects the Engine to start cleanly, not throw inside the drain. Pinned in Task 1.
4. **A review response that names an unknown cast member, or decorates the title.** The writer expects no Thread about a non-entity. Pinned in Task 5.
5. **A Thread deleted or concluded by hand while its write is queued.** The writer expects it to stay gone. Pinned in Task 6.

---

## File Structure

| File                                                                                                       | Responsibility                          | Change                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/core/utils/prompts.ts`                                                                                | All prompt text                         | Replace triage; add review and thread-write; delete open; edit revise, Forge, thread summary |
| `src/core/engine/triage-strategy.ts`                                                                       | Fast pass prompt and parser             | REVISE only; export name helpers                                                             |
| `src/core/engine/loop-machine.ts`                                                                          | Intent union, pass lifecycle            | New intents; `reviewDue` on `assessed`                                                       |
| `src/core/engine/intents.ts`                                                                               | Queue identity and record               | New keys; `reviewWatermark`; dedupe replacement                                              |
| `src/core/engine/open-strategy.ts`                                                                         |                                         | Delete                                                                                       |
| `src/core/engine/thread-horizon.ts`                                                                        |                                         | Delete                                                                                       |
| `src/core/engine/thread-cap.ts`                                                                            | Cap arithmetic                          | Reduce to count checks                                                                       |
| `src/core/engine/thread-condition.ts`                                                                      | A Thread's activation condition         | Rewrite: positive, alias-based                                                               |
| `src/core/engine/thread-bind.ts`                                                                           | Thread ⇄ lorebook entry                 | Alias resolution, one sync function                                                          |
| `src/core/engine/thread-write-strategy.ts`                                                                 | Thread write prompt, parser, lint       | Create                                                                                       |
| `src/core/engine/review-strategy.ts`                                                                       | Review window, manifest, parser, floors | Create                                                                                       |
| `src/core/engine/execute.ts`                                                                               | The drain and its arms                  | New arms; spawned intents                                                                    |
| `src/core/engine/revise-strategy.ts`                                                                       | Entity rewrite prompt                   | `established` block                                                                          |
| `src/core/engine/settings.ts`                                                                              | Engine settings                         | `reviewEvery`; owns `PARAGRAPH_CHARS`                                                        |
| `src/core/store/effects/engine-loop.ts`                                                                    | The pass                                | Review step, manual review                                                                   |
| `src/core/store/types.ts`, `slices/world.ts`, `slices/engine.ts`, `index.ts`, `persistence/story-store.ts` | Thread model and store                  | New shape                                                                                    |
| `src/ui/panels/world/*`                                                                                    | Thread UI                               | Two fields, two statuses                                                                     |
| `src/ui/hud/*`, `src/ui/panels/settings/*`                                                                 | HUD and settings                        | Review reading and control                                                                   |
| `tools/review-probe.naiscript`                                                                             | Live prompt harness                     | Create                                                                                       |

---

### Task 1: Fast pass keeps only REVISE

**Files:**

- Modify: `src/core/utils/prompts.ts:740-778` (triage), `:882-926` (delete open)
- Modify: `src/core/engine/triage-strategy.ts`
- Modify: `src/core/engine/loop-machine.ts:48-57`
- Modify: `src/core/engine/intents.ts:39-52`
- Modify: `src/core/engine/execute.ts`
- Modify: `src/core/store/effects/engine-loop.ts`
- Delete: `src/core/engine/open-strategy.ts`, `tests/core/engine/open-strategy.test.ts`
- Test: `tests/core/engine/triage-strategy.test.ts`, `tests/core/engine/pass.test.ts`, `tests/core/engine/execute.test.ts`, `tests/core/engine/intents.test.ts`

**Interfaces:**

- Produces: `TriageManifest = { entities: TriageEntity[] }`; `TRIAGE_MAX_TOKENS = 300`; exported `cleanArgument(raw: string): string`, `normalizeName(name: string): string`, `indexBy<T extends {id: string}>(items: T[], label: (item: T) => string): Map<string, string>`; `Intent = { kind: "revise"; entityId: string; prose: string } | { kind: "condense"; entryId: string }`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/engine/triage-strategy.test.ts` (the file already imports `parseTriage`; build the manifest inline):

```ts
describe("triage names revisions and nothing else", () => {
  const manifest = {
    entities: [
      {
        id: "e1",
        name: "Ines Corbel",
        category: "Character",
        summary: "Keeps the east hives.",
      },
    ],
  };

  it("reads a REVISE command", () => {
    expect(parseTriage("REVISE Ines Corbel", manifest, "prose")).toEqual([
      { kind: "revise", entityId: "e1", prose: "prose" },
    ]);
  });

  it("ignores a reasoning line that ends in the verb", () => {
    const text =
      "Ines Corbel: the prose shows her sell the east hives, and her record says she keeps them: REVISE\nREVISE Ines Corbel";
    expect(parseTriage(text, manifest, "prose")).toHaveLength(1);
  });

  it("no longer opens or retires anything", () => {
    expect(
      parseTriage(
        "OPEN the unpaid honey levy\nRETIRE The Levy",
        manifest,
        "prose",
      ),
    ).toEqual([]);
  });
});
```

Add to `tests/core/engine/pass.test.ts`, using the file's own `harness`, `documentOf`, `triageReturns`, `seedLoopRecord` and `loopRecord` helpers:

```ts
describe("a queue written by 0.15", () => {
  it("drops intents of a kind this build no longer has", async () => {
    const h = harness();
    documentOf("Ada counted the frames.");
    seedLoopRecord({
      queue: [
        { kind: "open", subject: "the levy", prose: "x" },
        { kind: "retire", threadId: "t1", why: "satisfied" },
      ] as unknown as EngineRecord["queue"],
    });
    triageReturns(h, "");

    await h.runPass();

    expect(loopRecord()?.queue).toEqual([]);
    expect(h.store.getState().engine.phase).toBe("idle");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/core/engine/triage-strategy.test.ts tests/core/engine/pass.test.ts`
Expected: FAIL. The "no longer opens" test returns an `open` intent, and the 0.15 queue test finds the old intents still queued or throws in the drain.

- [ ] **Step 3: Replace the triage prompts and delete the open prompts**

In `src/core/utils/prompts.ts`, replace the header comment block above `TRIAGE_SYSTEM`, the constant, and `TRIAGE_INSTRUCTION` with:

```ts
// ── Engine: triage ──────────────────────────────────────────────────────────
// One small instruct call per pass, answering only which recorded entities the
// new prose has made wrong. It never writes prose and never invents.
//
// Written as a chain, fact before verdict: the model states what the prose
// shows about an entity before it may answer. The capitalised verb at the start
// of a line is the only thing parseTriage reads, so a reasoning line that ENDS
// in the verb is not a command.
//
// Triage cannot create or close anything. Threads belong to the review pass
// (REVIEW_SYSTEM), which reads at the scale an arc exists at.

export const TRIAGE_SYSTEM = `You are the triage pass of a story engine. You read the prose a writer has just produced and answer one question: which recorded entities does that prose make wrong?

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
- Most passes need no command. Writing none is a correct and common answer.`;

export const TRIAGE_INSTRUCTION = `Which entities does the new prose above make wrong? Walk each one the prose names, then write the commands, or none.`;
```

Delete the doc comment above `ENGINE_OPEN_SYSTEM`, `ENGINE_OPEN_SYSTEM` and `ENGINE_OPEN_INSTRUCTION`.

- [ ] **Step 4: Reduce `triage-strategy.ts`**

- Delete the imports of `displacedByNextThread`, `effectiveCap`, `ThreadHorizon`, `ThreadStatus`.
- Delete `TriageThread` and `formatThreads`.
- Replace `TriageManifest` with:

```ts
/** What triage is allowed to name. Rendered into the prompt, and the only thing
 *  `parseTriage` will resolve a name against. */
export type TriageManifest = {
  entities: TriageEntity[];
};
```

- Change `TRIAGE_MAX_TOKENS` to `300` and update its comment: the reasoning lines the prompt now asks for need the room.
- In `createTriageFactory`, delete the `manifest.threads` block.
- Replace the command regex and export the three helpers:

```ts
const COMMAND = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(REVISE)\b[:\s]*(.*)$/;
```

Rename `normalize` to `normalizeName` and add `export` to `cleanArgument`, `normalizeName` and `indexBy`.

- Replace the body of the loop in `parseTriage` after `const argument = ...; if (!argument) continue;` with:

```ts
const entityId = entityIds.get(normalizeName(argument));
if (entityId) intents.push({ kind: "revise", entityId, prose: carried });
```

and delete `threadIds` and the unused `verb` binding (`const [, , rest] = match;`).

- [ ] **Step 5: Reduce the intent union, its key, and the drain**

`src/core/engine/loop-machine.ts`, replace the `Intent` type (keep its doc comment's first two paragraphs, drop the sentences about `retire`):

```ts
export type Intent =
  | { kind: "revise"; entityId: string; prose: string }
  | { kind: "condense"; entryId: string };
```

`src/core/engine/intents.ts`, `intentKey`:

```ts
export function intentKey(intent: Intent): string {
  switch (intent.kind) {
    case "revise":
      return `revise:${intent.entityId}`;
    case "condense":
      return `condense:${intent.entryId}`;
  }
}
```

`src/core/engine/execute.ts`:

- Delete the imports from `./open-strategy`, `./thread-bind`, and `../store/slices/world`.
- Delete the `retire` and `open` functions.
- `INTENT_MAX_TOKENS` becomes `{ revise: REVISE_MAX_TOKENS, condense: CONDENSE_MAX_TOKENS }`.
- The `execute` switch keeps only the `revise` and `condense` cases.
- `DrainDeps.assessment` is no longer read by any arm. Delete the field and its comment, and delete the `Assessment` import.

Delete `src/core/engine/open-strategy.ts` and `tests/core/engine/open-strategy.test.ts`.

- [ ] **Step 6: Reduce the pass**

`src/core/store/effects/engine-loop.ts`:

- Delete the imports of `expiredThreads`, `renewedThreads`, `threadAnchorSet`.
- Replace `readQueue`:

```ts
/** The intent kinds this build can run. A record written by an older build may
 *  hold others (`open`, `retire`); they are dropped here, at the one door
 *  persisted intents come through, so the drain's exhaustive switch never meets
 *  a kind it has no arm for. */
const KNOWN_KINDS: ReadonlySet<string> = new Set(["revise", "condense"]);

function readQueue(value: unknown): Intent[] {
  if (!Array.isArray(value)) return [];
  return (value as Intent[]).filter(
    (intent) =>
      KNOWN_KINDS.has(intent?.kind) &&
      (intent.kind !== "revise" ||
        (typeof intent.prose === "string" && intent.prose.length > 0)),
  );
}
```

- `buildManifest(state, candidateIds)` loses its `threadCap` parameter and its `threads` block, and returns `{ entities }`. Update its doc comment's first line to "the entities the new prose plausibly mentions".
- Delete `renewTouchedThreads` and `expiredRetires` and their two call sites in `runPass`.
- `dedupe(queue, [...intents, ...condense])`.
- In the `drain(...)` call, remove the `assessment` property and its comment.

- [ ] **Step 7: Prune the tests of what was removed**

Run: `npx vitest run tests/core/engine`
Every remaining failure is a test of removed behaviour. In `triage-strategy.test.ts`, `execute.test.ts`, `pass.test.ts`, `intents.test.ts` and `loop-machine.test.ts`, delete each `describe` or `it` whose subject is `OPEN`, `RETIRE`, the `open` or `retire` intent, thread renewal, thread expiry, cap displacement in the manifest, or the manifest's THREADS block. Where a surviving test builds a manifest, remove its `threads` and `threadCap` properties; where a harness builds `DrainDeps`, remove its `assessment` property. Do not weaken an assertion in a test that is about `revise` or `condense`.

- [ ] **Step 8: Run the suite**

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: builds. (`thread-cap.ts` and `thread-bind.ts` now hold unused exports; Task 2 removes them.)

- [ ] **Step 9: Commit**

```bash
npm run format
git add -A src/core tests/core
git commit -m "refactor(engine): the fast pass revises entities and nothing else"
```

---

### Task 2: The Thread model, its condition, and its lorebook entry

`npm run build` will report type errors under `src/ui/panels/world/` at the end of this task. Task 3 fixes them. `npm run test` must pass.

**Files:**

- Modify: `src/core/store/types.ts:131-196`
- Modify: `src/core/store/slices/world.ts`
- Modify: `src/core/store/index.ts:7,12,73-93`
- Modify: `src/core/store/persistence/story-store.ts`
- Modify: `src/ui/mount.ts:191-207`
- Modify: `src/core/engine/settings.ts:29`, `src/core/engine/condense.ts:34`, `src/ui/panels/settings/engine-settings-model.ts:42`
- Delete: `src/core/engine/thread-horizon.ts`
- Rewrite: `src/core/engine/thread-cap.ts`, `src/core/engine/thread-condition.ts`
- Modify: `src/core/engine/thread-bind.ts`
- Modify: `src/core/utils/crucible-command-parser.ts:63-68,366-385,454-459`, `src/core/store/effects/handlers/forge-chat.ts:295-304`, `src/core/generation-journal.ts:260`
- Modify: `src/core/utils/prompts.ts:561-565,576-585,642,682`
- Modify: `src/core/utils/lorebook-strategy.ts:134-141`, `src/core/utils/summary-strategy.ts`
- Test: `tests/core/engine/thread-condition.test.ts`, `thread-cap.test.ts`, `thread-bind.test.ts` (rewrite), `tests/core/utils/command-parser.test.ts`, plus fixture updates wherever a `Thread` is built

**Interfaces:**

- Consumes: nothing from Task 1 beyond a compiling tree.
- Produces:

```ts
// types.ts
export type ThreadStatus = "open" | "concluded";
export interface Thread {
  id: string; title: string; state: string; latent: string;
  entityIds: string[]; lorebookEntryId?: string; status: ThreadStatus;
}
export type ThreadDraft = Omit<Thread, "status" | "latent"> & Partial<Pick<Thread, "status" | "latent">>;

// slices/world.ts — actions
threadLedgerUpdated({ threadId: string; state: string; latent: string })
// removed: threadTextUpdated, threadHorizonSet, threadAnchorSet

// thread-cap.ts
export function effectiveCap(cap: number): number;
export function openThreadCount(threads: readonly Pick<Thread, "status">[]): number;
export function atThreadCap(threads: readonly Pick<Thread, "status">[], cap: number): boolean;

// thread-condition.ts
export const THREAD_PRESENCE_RANGE_CHARS = 4000;
export type ThreadMember = { id: string; aliases: string[] };
export function buildThreadCondition(thread: Pick<Thread, "entityIds">, members: ThreadMember[]): LorebookCondition[] | null;

// thread-bind.ts
export type Aliases = Record<string, string[]>;
export async function entityAliases(state: RootState, entityIds: readonly string[]): Promise<Aliases>;
export async function syncThreadEntry(getState: () => RootState, threadId: string): Promise<boolean>;
export async function syncOpenThreadEntries(getState: () => RootState): Promise<void>;
export async function disableDeletedThreadEntry(entryId: string | undefined): Promise<boolean>; // unchanged

// settings.ts
export const PARAGRAPH_CHARS = 400;

// story-store.ts
export type WorldRecord = { story: StoryState; world: WorldState; droppedThreadEntryIds: string[] };

// crucible-command-parser.ts
export interface ThreadCommand { kind: "THREAD"; title: string; memberNames: string[]; state: string; latent: string }
```

- [ ] **Step 1: Write the failing condition tests**

Replace `tests/core/engine/thread-condition.test.ts` entirely:

```ts
import { describe, it, expect } from "vitest";
import {
  buildThreadCondition,
  THREAD_PRESENCE_RANGE_CHARS,
  type ThreadMember,
} from "../../../src/core/engine/thread-condition";

const key = (k: string) => ({
  type: "key",
  key: k,
  in: ["story"],
  range: THREAD_PRESENCE_RANGE_CHARS,
});

const member = (id: string, ...aliases: string[]): ThreadMember => ({
  id,
  aliases,
});

describe("a Thread is in context when its cast is on stage", () => {
  it("gives a cast-less Thread no condition at all", () => {
    expect(buildThreadCondition({ entityIds: [] }, [])).toBeNull();
  });

  it("probes for the one member of a single-member Thread", () => {
    expect(
      buildThreadCondition({ entityIds: ["a"] }, [member("a", "ines corbel")]),
    ).toEqual([key("ines corbel")]);
  });

  it("needs both members of a two-person Thread", () => {
    expect(
      buildThreadCondition({ entityIds: ["a", "b"] }, [
        member("a", "ines corbel"),
        member("b", "pell"),
      ]),
    ).toEqual([{ type: "and", conditions: [key("ines corbel"), key("pell")] }]);
  });

  it("needs any two members of a larger cast", () => {
    const [condition] = buildThreadCondition({ entityIds: ["a", "b", "c"] }, [
      member("a", "ines"),
      member("b", "pell"),
      member("c", "the cooperative"),
    ]) as LorebookCondition[];
    expect(condition).toEqual({
      type: "or",
      conditions: [
        { type: "and", conditions: [key("ines"), key("pell")] },
        { type: "and", conditions: [key("ines"), key("the cooperative")] },
        { type: "and", conditions: [key("pell"), key("the cooperative")] },
      ],
    });
  });

  it("treats any of a member's aliases as that member on stage", () => {
    expect(
      buildThreadCondition({ entityIds: ["a"] }, [
        member("a", "ines", "corbel", "Ines"),
      ]),
    ).toEqual([{ type: "or", conditions: [key("ines"), key("corbel")] }]);
  });

  it("skips a member nothing can name, and a member the World no longer holds", () => {
    expect(
      buildThreadCondition({ entityIds: ["a", "b", "gone"] }, [
        member("a", "ines"),
        member("b", " "),
      ]),
    ).toEqual([key("ines")]);
  });

  it("always emits exactly one condition", () => {
    const built = buildThreadCondition({ entityIds: ["a", "b"] }, [
      member("a", "ines"),
      member("b", "pell"),
    ]);
    expect(built).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/core/engine/thread-condition.test.ts`
Expected: FAIL: `THREAD_PRESENCE_RANGE_CHARS` is not exported and the builder returns a negated probe.

- [ ] **Step 3: Rewrite `thread-condition.ts`**

Replace the whole file:

```ts
// A Thread's `advancedConditions`: "its cast is on stage".
//
//   one member     key(A)
//   two members    and( key(A), key(B) )
//   three or more  or( and(A,B), and(A,C), and(B,C), ... )
//
// where key(X) is itself an `or` over X's aliases. A Thread records how things
// stand between entities, so it belongs in context exactly when those entities
// are in the scene together — and nowhere else. It never arrives when the story
// has moved on, because text arriving then reads to the story model as a cue to
// go back.
//
// Pure. The caller resolves each member's aliases (`thread-bind.ts`); nothing
// here reads `api.v1` or the store.
//
// **The entry carrying this condition must not be `forceActivation: true`.**
// Always On overrides `advancedConditions` outright — measured with
// `tools/paragraph-count-probe.naiscript` — so the condition activates the
// entry on its own: `keys: []`, `forceActivation: false`.

import type { Thread } from "../store/types";

/** How far back a member may have been named and still count as on stage, in
 *  characters — the unit `LorebookAdvancedConditionKey.range` is documented in.
 *  About ten 400-character paragraphs: one scene. */
export const THREAD_PRESENCE_RANGE_CHARS = 4000;

/** One cast member as the caller must hand it over: an id, and every string
 *  whose presence in the prose means this member is in the scene.
 *
 *  Aliases, not a name. Prose says "Oriel" far more often than "Oriel Vant",
 *  and the member's own lorebook keys are the writer's statement of what counts
 *  as a mention. Resolving them is async (a lorebook read), which is why it is
 *  the caller's job and this module stays pure. */
export type ThreadMember = {
  id: string;
  aliases: string[];
};

/** "This member is on stage", or null when nothing can name them. Aliases are
 *  passed to NovelAI's matcher verbatim; blank ones and case-duplicates are
 *  dropped. A one-alias `or` is noise in a structure a writer can open in
 *  NovelAI's condition editor, so one probe stays one probe. */
function onStage(member: ThreadMember): LorebookCondition | null {
  const seen = new Set<string>();
  const probes: LorebookCondition[] = [];
  for (const raw of member.aliases) {
    const alias = raw.trim();
    const folded = alias.toLowerCase();
    if (!alias || seen.has(folded)) continue;
    seen.add(folded);
    probes.push({
      type: "key",
      key: alias,
      in: ["story"],
      range: THREAD_PRESENCE_RANGE_CHARS,
    });
  }
  if (probes.length === 0) return null;
  return probes.length === 1 ? probes[0] : { type: "or", conditions: probes };
}

/** The Thread's `advancedConditions`, or null for a Thread with no nameable
 *  cast — which gets no lorebook entry at all.
 *
 *  Always ONE condition when there is one. `advancedConditions` is an array and
 *  the `.d.ts` does not say how its members combine, so the composition is
 *  written out with `and`/`or` rather than left to a rule nobody has verified.
 *
 *  A two-person Thread needs both: firing whenever either appears alone would
 *  put a relationship in a scene only one of them is in. A larger cast needs
 *  any two, because a feud between houses is in play when two of them meet. */
export function buildThreadCondition(
  thread: Pick<Thread, "entityIds">,
  members: ThreadMember[],
): LorebookCondition[] | null {
  const byId = new Map(members.map((m) => [m.id, m]));
  const cast = thread.entityIds
    .map((id) => byId.get(id))
    .filter((m): m is ThreadMember => m !== undefined)
    .map(onStage)
    .filter((c): c is LorebookCondition => c !== null);

  if (cast.length === 0) return null;
  if (cast.length === 1) return [cast[0]];
  if (cast.length === 2) return [{ type: "and", conditions: cast }];

  const pairs: LorebookCondition[] = [];
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      pairs.push({ type: "and", conditions: [cast[i], cast[j]] });
    }
  }
  return [{ type: "or", conditions: pairs }];
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/core/engine/thread-condition.test.ts`
Expected: PASS.

- [ ] **Step 5: Change the types**

`src/core/store/types.ts`: delete `ThreadHorizon` and its comment. Replace `ThreadStatus`, `Thread` and `ThreadDraft`:

```ts
/** A Thread is open while a later scene can still move it, and concluded once
 *  its state has become a permanent fact written into its cast's own entries.
 *  Concluding disables the Thread's lorebook entry; it deletes nothing. */
export type ThreadStatus = "open" | "concluded";

/** The standing state of an arc or relationship between known entities.
 *
 *  Two texts with different readers. `state` is what is true now, and it is the
 *  Thread's lorebook entry text — the story model reads it whenever the cast is
 *  on stage. `latent` is what is unspoken, owed or concealed, and it never
 *  leaves Story Engine: a model shown that something has not happened writes
 *  it happening. */
export interface Thread {
  id: string;
  title: string;
  state: string;
  latent: string;
  entityIds: string[];
  lorebookEntryId?: string;
  status: ThreadStatus;
}

/** A Thread as a callsite hands it to `threadCreated`. `status` and `latent`
 *  are the reducer's to default, so no creator has to remember them. */
export type ThreadDraft = Omit<Thread, "status" | "latent"> &
  Partial<Pick<Thread, "status" | "latent">>;
```

- [ ] **Step 6: Change the world slice**

`src/core/store/slices/world.ts`:

- Imports: drop `ThreadHorizon`.
- Delete `DEFAULT_THREAD_HORIZON`, `DEFAULT_THREAD_ANCHOR` and their comments. Keep `DEFAULT_THREAD_STATUS`.
- Replace `threadCreated` and its comment:

```ts
    // Defaults land here rather than at the callsites, so the World's "+", the
    // Forge's [THREAD] and the Engine's admission cannot disagree about them.
    // The thread limit is NOT enforced here: it restrains the Engine's
    // admissions only, and is checked where those are decided
    // (`applyFloors` in engine/review-strategy.ts, and again in the drain).
    threadCreated: (state, payload: { thread: ThreadDraft }) => ({
      ...state,
      threads: [
        ...state.threads,
        {
          ...payload.thread,
          latent: payload.thread.latent ?? "",
          status: payload.thread.status ?? DEFAULT_THREAD_STATUS,
        },
      ],
    }),
```

- Replace `threadTextUpdated` with:

```ts
    /** Both halves of the ledger in one action, because they are written
     *  together: the Thread write call returns them as a pair, and the pane
     *  saves them as a pair. `thread-bind.ts` subscribes to this and mirrors
     *  `state` — never `latent` — into the Thread's lorebook entry. */
    threadLedgerUpdated: (
      state,
      payload: { threadId: string; state: string; latent: string },
    ) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId
          ? { ...t, state: payload.state, latent: payload.latent }
          : t,
      ),
    }),
```

- Delete `threadHorizonSet` and `threadAnchorSet`.
- Rewrite the comment above `threadRenamed` to: "`thread-bind.ts` subscribes to every thread action below and re-syncs the entry."
- Shorten `threadStatusSet`'s comment to say it is a setter (idempotent) and that `thread-bind.ts` applies it to the entry's `enabled` flag.
- Update the exported actions list accordingly.

`src/core/store/index.ts`: delete the `enforceThreadCap` import, the `threadCreated` import if now unused, and the whole "thread cap" block at lines 73-93 so the function ends `return next;` directly.

- [ ] **Step 7: Rewrite `thread-cap.ts`**

Replace the whole file:

```ts
// The thread limit, as arithmetic.
//
// The limit restrains the ENGINE: at the limit the review pass admits no new
// Thread. It does not displace anything and it does not stop the writer or the
// Forge creating one. Admission by the slow review pass is the real
// proliferation control; this is the backstop behind it.
//
// Pure. `applyFloors` (review-strategy.ts) and the drain's admit arm are the
// two callers.

import type { Thread } from "../store/types";

/** The limit as everything downstream must read it: at least 1, and whole. */
export function effectiveCap(cap: number): number {
  return Math.max(1, Math.floor(cap) || 1);
}

/** Open Threads only. A concluded Thread's entry is disabled and costs no
 *  context, so it holds no slot. */
export function openThreadCount(
  threads: readonly Pick<Thread, "status">[],
): number {
  return threads.filter((t) => t.status === "open").length;
}

export function atThreadCap(
  threads: readonly Pick<Thread, "status">[],
  cap: number,
): boolean {
  return openThreadCount(threads) >= effectiveCap(cap);
}
```

Replace `tests/core/engine/thread-cap.test.ts` entirely:

```ts
import { describe, it, expect } from "vitest";
import {
  atThreadCap,
  effectiveCap,
  openThreadCount,
} from "../../../src/core/engine/thread-cap";

const open = { status: "open" as const };
const concluded = { status: "concluded" as const };

describe("the thread limit counts open Threads", () => {
  it("ignores concluded Threads", () => {
    expect(openThreadCount([open, concluded, open])).toBe(2);
  });

  it("is reached at the limit, not past it", () => {
    expect(atThreadCap([open, open], 2)).toBe(true);
    expect(atThreadCap([open, concluded], 2)).toBe(false);
  });

  it("never reads a limit below one", () => {
    expect(effectiveCap(0)).toBe(1);
    expect(effectiveCap(8.9)).toBe(8);
    expect(effectiveCap(Number.NaN)).toBe(1);
  });
});
```

- [ ] **Step 8: Move `PARAGRAPH_CHARS` and delete `thread-horizon.ts`**

In `src/core/engine/settings.ts`, replace the `thread-horizon` import with:

```ts
/** The prose paragraph the Engine's sizes are reasoned in: ~400 characters,
 *  ~65 words, which is what NovelAI's editor produces at a comfortable line. */
export const PARAGRAPH_CHARS = 400;
```

Repoint the import in `src/core/engine/condense.ts`, `src/ui/panels/settings/engine-settings-model.ts`, `tests/core/engine/settings.test.ts` and `tests/ui/engine-settings-model.test.ts` to the settings module. Delete `src/core/engine/thread-horizon.ts`.

Run: `grep -rn "thread-horizon" src tests`
Expected: matches only in `src/ui/panels/world/thread-display.ts` and tests Task 3 rewrites, plus `tests/core/engine/execute.test.ts` and `thread-bind.test.ts`. Remove the import from `execute.test.ts` now, along with any test that used it.

- [ ] **Step 9: Write the failing bind tests**

Replace `tests/core/engine/thread-bind.test.ts` entirely:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createStore, type Store } from "nai-store";
import {
  entityAliases,
  registerThreadConditionEffects,
  resolveThreadMembers,
  syncOpenThreadEntries,
  syncThreadEntry,
} from "../../../src/core/engine/thread-bind";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../../src/core/store/types";
import {
  initialWorldState,
  threadCreated,
  threadDeleted,
  threadLedgerUpdated,
  threadMemberToggled,
  threadStatusSet,
} from "../../../src/core/store/slices/world";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import { installStoryStorageFake } from "../../helpers/story-storage-fake";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function entity(
  id: string,
  name: string,
  lorebookEntryId?: string,
): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: lorebookEntryId ? "live" : "draft",
    name,
    summary: "",
    ...(lorebookEntryId ? { lorebookEntryId } : {}),
  };
}

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    title: "The Shared Apiary",
    state: "Ines Corbel and Pell work the east hives together.",
    latent: "Pell has not told Ines the cooperative means to sell them.",
    entityIds: ["a", "b"],
    status: "open",
    ...over,
  };
}

let lorebook: LorebookFake;

function storeOf(
  entities: WorldEntity[],
  threads: Thread[] = [],
): Store<RootState> {
  const store = createStore<RootState>(rootReducer);
  store.dispatch(
    persistedDataLoaded({
      world: {
        ...initialWorldState,
        entityIds: entities.map((e) => e.id),
        entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
        threads,
      },
    }),
  );
  registerThreadConditionEffects(
    store.subscribeEffect,
    store.getState,
    store.dispatch,
  );
  return store;
}

beforeEach(() => {
  lorebook = installLorebookFake();
  installStoryStorageFake();
  lorebook.seed({
    id: "la",
    displayName: "Ines Corbel",
    keys: ["ines", "corbel"],
    text: "",
  } as LorebookEntry);
  lorebook.seed({
    id: "lb",
    displayName: "Pell",
    keys: ["pell"],
    text: "",
  } as LorebookEntry);
});

const cast = () => [
  entity("a", "Ines Corbel", "la"),
  entity("b", "Pell", "lb"),
];

describe("a member's aliases", () => {
  it("are its entry's keys plus its display name", async () => {
    const store = storeOf(cast());
    const members = await resolveThreadMembers(store.getState(), thread());
    expect(members).toEqual([
      { id: "a", aliases: ["ines", "corbel", "ines corbel"] },
      { id: "b", aliases: ["pell", "pell"] },
    ]);
  });

  it("are the name alone for a draft with no entry", async () => {
    const store = storeOf([entity("a", "Ines Corbel")]);
    const members = await resolveThreadMembers(
      store.getState(),
      thread({ entityIds: ["a"] }),
    );
    expect(members).toEqual([{ id: "a", aliases: ["ines corbel"] }]);
  });

  it("for the admission floor leave out regex keys", async () => {
    lorebook.seed({
      id: "la",
      displayName: "Ines Corbel",
      keys: ["ines", "/cor+bel/i"],
      text: "",
    } as LorebookEntry);
    const store = storeOf(cast());
    expect(await entityAliases(store.getState(), ["a"])).toEqual({
      a: ["Ines Corbel", "ines"],
    });
  });
});

describe("a Thread's lorebook entry", () => {
  it("is created with state as its text, no keys, not always-on, and never the latent", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();

    const [created] = lorebook.created();
    expect(created.text).toBe(
      "Ines Corbel and Pell work the east hives together.",
    );
    expect(created.keys).toEqual([]);
    expect(created.forceActivation).toBe(false);
    expect(created.enabled).toBe(true);
    expect(JSON.stringify(created)).not.toContain("has not told");
    expect(store.getState().world.threads[0].lorebookEntryId).toBe(created.id);
  });

  it("is not created for a Thread with no cast", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread({ entityIds: [] }) }));
    await settle();
    expect(lorebook.created()).toEqual([]);
  });

  it("is created once the Thread gains a cast", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread({ entityIds: [] }) }));
    await settle();
    store.dispatch(threadMemberToggled({ threadId: "t1", entityId: "a" }));
    await settle();
    expect(lorebook.created()).toHaveLength(1);
  });

  it("follows a ledger update, writing state and not latent", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    store.dispatch(
      threadLedgerUpdated({
        threadId: "t1",
        state: "Ines Corbel works the east hives alone.",
        latent: "Pell means to come back for his share.",
      }),
    );
    await settle();

    const entryId = store.getState().world.threads[0].lorebookEntryId as string;
    expect(lorebook.read(entryId)?.text).toBe(
      "Ines Corbel works the east hives alone.",
    );
    expect(JSON.stringify(lorebook.read(entryId))).not.toContain("come back");
  });

  it("is disabled when the Thread concludes and re-enabled when it reopens", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    store.dispatch(threadStatusSet({ threadId: "t1", status: "concluded" }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(false);

    store.dispatch(threadStatusSet({ threadId: "t1", status: "open" }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(true);
  });

  it("is disabled when the Thread loses its last cast member", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread({ entityIds: ["a"] }) }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    store.dispatch(threadMemberToggled({ threadId: "t1", entityId: "a" }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(false);
  });

  it("is disabled, not deleted, when the Thread is deleted", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    store.dispatch(threadDeleted({ threadId: "t1", lorebookEntryId: entryId }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(false);
  });

  it("writes nothing when the entry already agrees", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const before = lorebook.updates().length;
    expect(await syncThreadEntry(store.getState, "t1")).toBe(false);
    expect(lorebook.updates()).toHaveLength(before);
  });

  it("follows a member's keys when they are edited in the lorebook", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    lorebook.seed({
      id: "lb",
      displayName: "Pell",
      keys: ["pell", "the drone-keeper"],
      text: "",
    } as LorebookEntry);
    await syncOpenThreadEntries(store.getState);

    expect(
      JSON.stringify(lorebook.read(entryId)?.advancedConditions),
    ).toContain("the drone-keeper");
  });

  it("overwrites a hand edit of the entry text: the Thread's state is the authority", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;
    lorebook.seed({
      ...(lorebook.read(entryId) as LorebookEntry),
      text: "hand-edited",
    });

    await syncThreadEntry(store.getState, "t1");
    expect(lorebook.read(entryId)?.text).toBe(
      "Ines Corbel and Pell work the east hives together.",
    );
  });
});
```

Run: `npx vitest run tests/core/engine/thread-bind.test.ts`
Expected: FAIL: `entityAliases`, `syncThreadEntry` and `threadLedgerUpdated` do not exist.

- [ ] **Step 10: Rewrite the binding in `thread-bind.ts`**

Keep the file's imports of `matchesAction`, `Store`, `writeLorebookEntry`, `nameKey`, `applyEratoPrefix`, `resolveDisplayName`, `UNNAMED_ENTRY`, `ensureNamedCategory`, `SE_THREAD_CATEGORY`, and `disableDeletedThreadEntry` with its comment. Remove the `mentionsName` import. Replace the world-slice import with:

```ts
import {
  entityDeleted,
  threadCreated,
  threadDeleted,
  threadLedgerUpdated,
  threadLorebookEntrySet,
  threadMemberToggled,
  threadRenamed,
  threadStatusSet,
} from "../store/slices/world";
```

Rewrite the header comment's first paragraph to describe the new contract: a Thread's entry carries `state` as its text and a cast-presence condition, is enabled exactly when the Thread is open and has a nameable cast, and is kept in step by one function, `syncThreadEntry`.

Delete `castFromSubject`, `findThreadBySubject`, `rebuildThreadCondition`, `applyThreadStatus`. Replace `resolveThreadMembers`, `resolveThreadCondition`, `createThreadEntry`, `ensureThreadEntry` and `registerThreadConditionEffects` with:

```ts
/** The Thread's cast, each with the strings that mean "this member is in the
 *  scene": the member's own lorebook keys, then its resolved display name.
 *
 *  `resolveDisplayName` is called, never reimplemented, and with `"unattended"`
 *  — the edit pane's half-typed title must not become a probe. A member the
 *  World no longer holds is dropped; so is one nothing can name. A draft has no
 *  entry, so its name is the only alias it has. */
export async function resolveThreadMembers(
  state: RootState,
  thread: Pick<Thread, "entityIds">,
): Promise<ThreadMember[]> {
  const members = await Promise.all(
    thread.entityIds.map(async (id): Promise<ThreadMember | null> => {
      const entity = state.world.entitiesById[id];
      if (!entity) return null;

      const entryId = entity.lorebookEntryId;
      if (!entryId) {
        const name = nameKey(entity.name);
        return name ? { id, aliases: [name] } : null;
      }

      const entry = await api.v1.lorebook.entry(entryId);
      const displayName = await resolveDisplayName(
        state,
        entryId,
        entry?.displayName,
        "unattended",
      );
      const aliases = [
        ...(entry?.keys ?? []),
        ...(displayName === UNNAMED_ENTRY ? [] : [nameKey(displayName)]),
      ].filter((alias) => alias.trim().length > 0);
      return aliases.length > 0 ? { id, aliases } : null;
    }),
  );
  return members.filter((m): m is ThreadMember => m !== null);
}

/** Entity id → the plain strings that name it in prose.
 *
 *  For code that has to answer "is this entity named in this paragraph" with
 *  `mentionsName` — the review pass's tags and its admission floor. Regex keys
 *  (`/…/`) are left out: `mentionsName` matches literals, and a pattern read as
 *  a literal matches nothing. The World's own name leads, so an entity with no
 *  entry still has one alias. */
export type Aliases = Record<string, string[]>;

export async function entityAliases(
  state: RootState,
  entityIds: readonly string[],
): Promise<Aliases> {
  const pairs = await Promise.all(
    entityIds.map(async (id): Promise<[string, string[]]> => {
      const entity = state.world.entitiesById[id];
      if (!entity) return [id, []];
      const entry = entity.lorebookEntryId
        ? await api.v1.lorebook.entry(entity.lorebookEntryId)
        : null;
      const keys = (entry?.keys ?? []).filter(
        (key) => key.trim().length > 0 && !key.trim().startsWith("/"),
      );
      return [id, [entity.name, ...keys].filter((a) => a.trim().length > 0)];
    }),
  );
  return Object.fromEntries(pairs);
}

/** The Thread's condition from the World as it stands, or null when it has no
 *  nameable cast. The one place resolution and builder meet, so creation and
 *  every later sync build the same condition from the same Thread. */
export async function resolveThreadCondition(
  state: RootState,
  thread: Pick<Thread, "entityIds">,
): Promise<LorebookCondition[] | null> {
  return buildThreadCondition(
    thread,
    await resolveThreadMembers(state, thread),
  );
}

/** What the Thread's entry should say: `state`, with the erato divider when the
 *  writer has that setting on. Never `latent`. */
async function entryTextOf(thread: Thread): Promise<string> {
  const erato = Boolean(await api.v1.config.get("erato_compatibility"));
  return applyEratoPrefix(thread.state, erato);
}

/** Create the Thread's lorebook entry. Returns its id.
 *
 *  `keys: []` and `forceActivation: false`: the condition activates the entry
 *  on its own, and Always On would override it (measured — see
 *  `thread-condition.ts`). Its own `SE: Threads` category, so a writer opening
 *  their lorebook finds Threads as a group. One call, so the condition is
 *  present from the first moment the entry exists. */
async function createThreadEntry(
  thread: Thread,
  advancedConditions: LorebookCondition[],
): Promise<string> {
  const [category, text] = await Promise.all([
    ensureNamedCategory(SE_THREAD_CATEGORY),
    entryTextOf(thread),
  ]);
  return api.v1.lorebook.createEntry({
    id: api.v1.uuid(),
    displayName: thread.title,
    text,
    keys: [],
    enabled: thread.status === "open",
    forceActivation: false,
    advancedConditions,
    category,
  });
}

/** Give a Thread its lorebook entry, once.
 *
 *  Two things must be true first. A title: the World's "+" makes an untitled
 *  draft, and a draft gets nothing until Save names it. A nameable cast: with
 *  nobody to be on stage there is no condition, and an entry with no condition
 *  could only ever be always-on or never-on. */
export async function ensureThreadEntry(
  getState: () => RootState,
  dispatch: Store<RootState>["dispatch"],
  threadId: string,
): Promise<boolean> {
  const state = getState();
  const thread = state.world.threads.find((t) => t.id === threadId);
  if (!thread || thread.lorebookEntryId) return false;
  if (!thread.title.trim()) return false;

  const condition = await resolveThreadCondition(state, thread);
  if (!condition) return false;

  const entryId = await createThreadEntry(thread, condition);
  dispatch(threadLorebookEntrySet({ threadId, entryId }));
  return true;
}

/** Bring a Thread's entry into step with the Thread: text, condition, enabled.
 *
 *  **One function for every edit.** A Thread's entry is `state` as its text,
 *  the cast-presence condition, and enabled exactly when the Thread is open and
 *  has a nameable cast. Rename, cast change, ledger update and status change
 *  all invalidate one of those, and a sync per kind of edit is how two of them
 *  end up disagreeing.
 *
 *  **`state` is the authority for the entry's text**, unlike an entity's entry,
 *  where the lorebook outranks the store. A Thread's text is the Engine's
 *  ledger; a hand edit made in the lorebook is overwritten on the next sync,
 *  and the place to edit a Thread is its pane.
 *
 *  Through the door, and only the fields that differ: returning null when the
 *  entry already agrees keeps a review pass's blanket re-sync from writing
 *  eight entries to change none. The entry's `displayName` is left alone.
 *
 *  Returns whether anything was written. */
export async function syncThreadEntry(
  getState: () => RootState,
  threadId: string,
): Promise<boolean> {
  const state = getState();
  const thread = state.world.threads.find((t) => t.id === threadId);
  if (!thread?.lorebookEntryId) return false;

  const [condition, text] = await Promise.all([
    resolveThreadCondition(state, thread),
    entryTextOf(thread),
  ]);
  const enabled = thread.status === "open" && condition !== null;

  return writeLorebookEntry(thread.lorebookEntryId, (live) => {
    const patch: Partial<LorebookEntry> = {};
    if ((live.text ?? "") !== text) patch.text = text;
    if ((live.enabled ?? true) !== enabled) patch.enabled = enabled;
    if (
      condition &&
      JSON.stringify(live.advancedConditions ?? null) !==
        JSON.stringify(condition)
    ) {
      patch.advancedConditions = condition;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  });
}

/** Re-sync every open Thread's entry.
 *
 *  A member's lorebook keys are edited outside the store — in NovelAI's own
 *  lorebook, or by a keys generation — so no action announces the change and a
 *  condition built from the old keys goes on probing for them. The review pass
 *  calls this before it reads, which bounds the staleness to one review. */
export async function syncOpenThreadEntries(
  getState: () => RootState,
): Promise<void> {
  for (const thread of getState().world.threads) {
    if (thread.status === "open") await syncThreadEntry(getState, thread.id);
  }
}

/** Every edit that can put a Thread and its entry out of step.
 *
 *  An effect rather than a call at each dispatch site: the World's pane, the
 *  Forge and the drain all dispatch these, and a sync the caller has to
 *  remember is a sync that will be forgotten.
 *
 *  Errors are logged rather than thrown: an effect is fire-and-forget, and a
 *  failed sync leaves the previous entry standing rather than a broken one. */
export function registerThreadConditionEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
  dispatch: Store<RootState>["dispatch"],
): void {
  const settle = (threadId: string): void => {
    void (async () => {
      try {
        if (!(await ensureThreadEntry(getState, dispatch, threadId))) {
          await syncThreadEntry(getState, threadId);
        }
      } catch (error) {
        api.v1.log("[engine] thread entry sync failed:", error);
      }
    })();
  };

  subscribeEffect(matchesAction(threadCreated), (action) =>
    settle(action.payload.thread.id),
  );
  subscribeEffect(matchesAction(threadRenamed), (action) =>
    settle(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadMemberToggled), (action) =>
    settle(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadLedgerUpdated), (action) =>
    settle(action.payload.threadId),
  );
  subscribeEffect(matchesAction(threadStatusSet), (action) =>
    settle(action.payload.threadId),
  );

  // Deleting an entity removes it from every cast in the reducer, with no
  // thread action to announce it.
  subscribeEffect(matchesAction(entityDeleted), () => {
    for (const thread of getState().world.threads) settle(thread.id);
  });

  subscribeEffect(matchesAction(threadDeleted), (action) => {
    const { lorebookEntryId } = action.payload;
    void (async () => {
      try {
        await disableDeletedThreadEntry(lorebookEntryId);
      } catch (error) {
        api.v1.log("[engine] deleted thread's entry not switched off:", error);
      }
    })();
  });
}
```

Update `disableDeletedThreadEntry`'s comment: remove the references to cap displacement and `applyThreadStatus`; keep the reasoning about the entry id travelling on the action.

Run: `npx vitest run tests/core/engine/thread-bind.test.ts`
Expected: PASS.

- [ ] **Step 11: Persistence drops old Threads**

Write the failing test first. Add `tests/core/store/story-store.test.ts` if it does not exist (check with `ls tests/core/store`), or append to the existing one:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadWorldRecord } from "../../../src/core/store/persistence/story-store";
import { STORAGE_KEYS } from "../../../src/core/keys";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

let story: StoryStorageFake;
beforeEach(() => {
  story = installStoryStorageFake();
});

describe("Threads written before 0.16", () => {
  it("are dropped, and their entry ids handed back to be switched off", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [
          {
            id: "old",
            title: "The glass",
            text: "x",
            horizon: "plot",
            lorebookEntryId: "le-old",
          },
          { id: "old2", title: "No entry", text: "y" },
          { id: "new", title: "Kept", state: "Stands.", entityIds: [] },
        ],
      },
    });

    const record = await loadWorldRecord();

    expect(record.world.threads).toEqual([
      {
        id: "new",
        title: "Kept",
        state: "Stands.",
        latent: "",
        entityIds: [],
        status: "open",
      },
    ]);
    expect(record.droppedThreadEntryIds).toEqual(["le-old"]);
  });

  it("reads an unknown status as open", async () => {
    story.set(STORAGE_KEYS.WORLD, {
      world: {
        threads: [
          {
            id: "t",
            title: "T",
            state: "s",
            latent: "l",
            entityIds: [],
            status: "satisfied",
          },
        ],
      },
    });
    expect((await loadWorldRecord()).world.threads[0].status).toBe("open");
  });
});
```

Run it and confirm it fails. Then in `src/core/store/persistence/story-store.ts`:

- Imports: drop `DEFAULT_THREAD_ANCHOR`, `DEFAULT_THREAD_HORIZON`.
- `WorldRecord` gains `droppedThreadEntryIds: string[]`.
- The early return in `hydrate` gains `droppedThreadEntryIds: []`.
- Replace the `threads` mapping:

```ts
// A Thread without a `state` string was written before 0.16, when a Thread
// was a commitment with a reminder. Those are the flood this model replaces,
// so they are dropped rather than converted — and the ids of the lorebook
// entries they owned are handed back, because an entry nothing manages any
// more would otherwise go on injecting.
const threads: Thread[] = [];
const droppedThreadEntryIds: string[] = [];
for (const stored of record.world?.threads ?? []) {
  if (typeof stored.state !== "string") {
    if (stored.lorebookEntryId) {
      droppedThreadEntryIds.push(stored.lorebookEntryId);
    }
    continue;
  }
  threads.push({
    ...(stored as Thread),
    latent: typeof stored.latent === "string" ? stored.latent : "",
    entityIds: stored.entityIds ?? [],
    status: stored.status === "concluded" ? "concluded" : DEFAULT_THREAD_STATUS,
  });
}
```

and return `droppedThreadEntryIds` alongside `story` and `world`. Update the file header comment's sentence about `threadCreated`'s defaults to name `latent` and `status`.

In `src/ui/mount.ts`, immediately after the `store.dispatch(persistedDataLoaded({...}))` call:

```ts
// Threads from before 0.16 were dropped on load; switch their entries off so
// nothing unmanaged goes on injecting. Disabled, never deleted.
for (const entryId of persisted.droppedThreadEntryIds) {
  await disableDeletedThreadEntry(entryId);
}
```

and import `disableDeletedThreadEntry` from `../core/engine/thread-bind`.

- [ ] **Step 12: The Forge's THREAD command**

Add to `tests/core/utils/command-parser.test.ts` (the file imports the parser's entry point; use the same function its neighbours call, shown here as `parseCommands`):

```ts
describe("THREAD carries a state and a private note", () => {
  it("reads four segments", () => {
    const { commands } = parseCommands(
      '[THREAD "The Shared Apiary" | "Ines Corbel", "Pell" | Ines Corbel and Pell work the east hives together. | Pell means to sell them.]',
    );
    expect(commands[0]).toEqual({
      kind: "THREAD",
      title: "The Shared Apiary",
      memberNames: ["Ines Corbel", "Pell"],
      state: "Ines Corbel and Pell work the east hives together.",
      latent: "Pell means to sell them.",
    });
  });

  it("reads three segments as a state with no private note", () => {
    const { commands } = parseCommands(
      '[THREAD "The Shared Apiary" | "Ines Corbel", "Pell" | They work the east hives together.]',
    );
    expect(commands[0]).toMatchObject({
      state: "They work the east hives together.",
      latent: "",
    });
  });
});
```

In `src/core/utils/crucible-command-parser.ts`:

```ts
export interface ThreadCommand {
  kind: "THREAD";
  title: string;
  memberNames: string[];
  /** How things stand between the members now — shown to the story model. */
  state: string;
  /** What is unspoken or unsettled between them — private. */
  latent: string;
}
```

Replace the `threadMatch` block's match and field extraction:

```ts
  const threadMatch =
    line.match(
      /^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\|([^|]+?)\|([^\]]+?)\]?\s*$/,
    ) ??
    line.match(/^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\|([^\]]+?)\]?\s*$/) ??
    line.match(/^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\]?\s*$/);
  if (threadMatch) {
    const title = threadMatch[1].trim();
    const membersRaw = threadMatch[2];
    const state = (threadMatch[3] ?? "").trim();
    const latent = (threadMatch[4] ?? "").trim();
```

and return `{ kind: "THREAD", title, memberNames, state, latent }`. Update the header comment line 9 to `[THREAD "<Title>" | "<A>", "<B>" | state | latent]`. Replace the serializer case:

```ts
    case "THREAD": {
      const members = cmd.memberNames.map((n) => `"${n}"`).join(", ");
      const tail = [cmd.state, cmd.latent].filter(Boolean).join(" | ");
      return tail
        ? `[THREAD "${cmd.title}" | ${members} | ${tail}]`
        : `[THREAD "${cmd.title}" | ${members}]`;
    }
```

In `src/core/store/effects/handlers/forge-chat.ts`, the THREAD case builds:

```ts
const thread: ThreadDraft = {
  id: api.v1.uuid(),
  title: cmd.title,
  state: cmd.state,
  latent: cmd.latent,
  entityIds: memberIds,
};
```

and its comment becomes "No status: `threadCreated` defaults it (world.ts)."

In `src/core/generation-journal.ts:260`, replace `cmd.description` (both occurrences on the line) with `cmd.state`. The journal is a writer-facing log; it must not print `cmd.latent`.

- [ ] **Step 13: Prompts that describe a Thread**

In `src/core/utils/prompts.ts`:

Replace `THREAD_SUMMARY_PROMPT`:

```ts
export const THREAD_SUMMARY_PROMPT = `Write one or two sentences saying how things stand between this thread's members right now.

This text is shown to the model writing the story whenever the members are on the page together, and that model acts on whatever it reads. So say only what is already so: present tense, each member named, no pronoun without a name beside it. Leave out anything that has not happened, anything a member intends, and anything one member is keeping from another.

Return the sentences and nothing else.`;
```

In `FORGE_PROMPT`, replace the THREAD vocabulary line, the "For THREAD" line and the example line:

```
  [THREAD "<Title>" | "Name1", "Name2" | how things stand between them now | what is unspoken or unsettled between them]  — record how 2–4 elements stand toward each other
```

```
For THREAD, list only the members who share a direct structural bond — not every element tangentially related. A THREAD has two descriptions. The first says how things stand between the members right now, in the present tense, and is shown to the story model. The second holds what is concealed, owed or undecided between them; it is private and the story model never sees it. Anything that points at a future event belongs in the second.
```

```
[THREAD "Black-Market Bay" | "Mira Voss", "The Sunken Arcade" | Mira Voss runs her trade out of the Sunken Arcade's back bays, in plain sight of its regulars. | The Arcade's owner does not know what Mira moves through his building.]
```

At line 642 replace `| 1-sentence description]   — group 2-4 drafts with a real shared dynamic` with `| how things stand now | what is unspoken between them]   — record how 2-4 drafts stand toward each other`. At line 682 replace `| description]` with `| state | latent]`.

In `src/core/utils/summary-strategy.ts`, replace the user line `"Generate a summary describing this thread's dynamic."` with `"Write how things stand between these members."`.

In `src/core/utils/lorebook-strategy.ts`, replace `formatEntityThreads`:

```ts
/** Format the open Threads an entity belongs to as context text.
 *
 *  `state` only. This block feeds lorebook entry generation, whose output the
 *  story model reads — so a Thread's private notes must never be in it. A
 *  concluded Thread is left out: its state is already in its cast's entries. */
function formatEntityThreads(state: RootState, entityId: string): string {
  const threads = state.world.threads.filter(
    (t) => t.status === "open" && t.entityIds.includes(entityId),
  );
  if (threads.length === 0) return "";
  return threads.map((t) => `- ${t.title}: ${t.state}`).join("\n");
}
```

Also in that file, rewrite the three comments at lines 74-91 and 116 that describe "a thread's forgetting detector" so they describe a cast-presence probe instead: a half-typed name becomes a probe no prose matches, so the Thread never activates.

- [ ] **Step 14: Fix every remaining Thread fixture and stale reference**

Run: `grep -rn "horizon\|anchorParagraph\|threadTextUpdated\|threadHorizonSet\|threadAnchorSet\|\"satisfied\"\|\"abandoned\"" src/core tests/core`
For each hit under `tests/core`, change the Thread fixture helper to:

```ts
function thread(id: string, over: Partial<Thread> = {}): Thread {
  return {
    id,
    title: id,
    state: `How things stand for ${id}.`,
    latent: "",
    entityIds: [],
    status: "open",
    ...over,
  };
}
```

and delete tests whose subject is horizon, anchor, grace, expiry, renewal, displacement or the `satisfied`/`abandoned` distinction. For each hit under `src/core`, it is a comment describing removed behaviour: rewrite or delete the sentence. `src/ui/hud/hud-model.ts` compiles unchanged (`status === "open"`); leave it for Task 7.

- [ ] **Step 15: Run the suite**

Run: `npm run test`
Expected: PASS, except tests under `tests/ui/thread-*.test.ts` and `tests/ui/world-select.test.ts`, which Task 3 rewrites. If any other test fails, fix it now.

- [ ] **Step 16: Commit**

```bash
npm run format
git add -A src tests
git commit -m "feat(world): a Thread is a standing state with a private half"
```

---

### Task 3: The World's Thread UI

**Files:**

- Rewrite: `src/ui/panels/world/thread-display.ts`, `src/ui/panels/world/ThreadStatusIcon.tsx`
- Modify: `src/ui/panels/world/ThreadItem.tsx`, `ThreadEditPane.tsx`, `World.tsx:14-22,64-104,160-270`, `world-select.ts:35-59`
- Test: `tests/ui/thread-display.test.ts`, `tests/ui/thread-source.test.ts`, `tests/ui/world-select.test.ts`

**Interfaces:**

- Consumes: `Thread`, `ThreadStatus`, `threadLedgerUpdated`, `threadStatusSet`, `effectiveCap`, `openThreadCount` from Task 2.
- Produces: `statusOption(status)`, `nextStatus(status)`, `threadAddModel(openCount: number, cap: number): { count: string; title: string }`, `partitionThreads(threads): { open: Thread[]; concluded: Thread[] }`.

- [ ] **Step 1: Write the failing model tests**

Replace `tests/ui/thread-display.test.ts` entirely:

```ts
import { describe, it, expect } from "vitest";
import {
  nextStatus,
  statusOption,
  STATUS_OPTIONS,
  threadAddModel,
} from "../../src/ui/panels/world/thread-display";

describe("a Thread's status, in words", () => {
  it("has exactly two readings", () => {
    expect(STATUS_OPTIONS.map((o) => o.id)).toEqual(["open", "concluded"]);
  });

  it("says what pressing the control does from each", () => {
    expect(statusOption("open").action).toBe("Conclude");
    expect(statusOption("concluded").action).toBe("Reopen");
  });

  it("moves between the two by explicit value", () => {
    expect(nextStatus("open")).toBe("concluded");
    expect(nextStatus("concluded")).toBe("open");
  });
});

describe("the add-thread control", () => {
  it("shows open Threads against the Engine's limit", () => {
    expect(threadAddModel(3, 8).count).toBe("3/8");
  });

  it("says the limit binds the Engine, not the writer", () => {
    expect(threadAddModel(8, 8).title).toContain("the Engine admits no more");
    expect(threadAddModel(3, 8).title).toBe("Add thread (3/8)");
  });
});
```

In `tests/ui/world-select.test.ts`, change the `partitionThreads` tests to expect `{ open, concluded }` and use `status: "concluded"` fixtures.

Run: `npx vitest run tests/ui/thread-display.test.ts tests/ui/world-select.test.ts`
Expected: FAIL.

- [ ] **Step 2: Rewrite `thread-display.ts`**

```ts
// The words the World's thread surfaces put on a status, and the add-thread
// control's reading of the Engine's limit.
//
// A `.ts` module rather than a const block inside `ThreadEditPane.tsx`: vitest
// here collects `tests/**/*.test.ts` in a node environment, so nothing inside a
// `.tsx` can be asserted except by scanning its source.
//
// Icons live in the components, not here. `nai:icons/feather` is a virtual
// module the bundler provides; importing it into a module vitest collects
// would break the tests that hold this file.

import { effectiveCap } from "../../../core/engine/thread-cap";
import type { ThreadStatus } from "../../../core/store/types";

export type StatusOption = {
  id: ThreadStatus;
  /** The word beside the icon. */
  label: string;
  /** What this reading means — the icon's tooltip in the World list. */
  help: string;
  /** What pressing the pane's control does from here. */
  action: string;
};

const STATUS_TEXT: Record<ThreadStatus, StatusOption> = {
  open: {
    id: "open",
    label: "Open",
    help: "Open — the story can still change how this stands",
    action: "Conclude",
  },
  concluded: {
    id: "concluded",
    label: "Concluded",
    help: "Concluded — settled, and written into its cast's own entries",
    action: "Reopen",
  },
};

export const STATUS_OPTIONS: readonly StatusOption[] = [
  STATUS_TEXT.open,
  STATUS_TEXT.concluded,
];

export function statusOption(status: ThreadStatus): StatusOption {
  return STATUS_TEXT[status];
}

/** The status the pane's control moves a Thread to. The value it returns is
 *  what the action carries — `threadStatusSet` takes a status, not a toggle —
 *  so a press delivered twice against one rendered state sets the same value
 *  twice instead of walking back. */
export function nextStatus(status: ThreadStatus): ThreadStatus {
  return status === "open" ? "concluded" : "open";
}

export type ThreadAddModel = {
  /** Open Threads against the Engine's limit, drawn beside the icon: `"3/8"`. */
  count: string;
  title: string;
};

/** What the World header's add-thread button reads as.
 *
 *  The limit restrains the Engine's admissions and nothing else, so this
 *  control never refuses. It shows the count because a writer at the limit
 *  should know why the Engine has stopped proposing Threads. */
export function threadAddModel(openCount: number, cap: number): ThreadAddModel {
  const count = `${openCount}/${effectiveCap(cap)}`;
  return {
    count,
    title:
      openCount >= effectiveCap(cap)
        ? `Add thread (${count}) — at the limit the Engine admits no more on its own; you still can`
        : `Add thread (${count})`,
  };
}
```

- [ ] **Step 3: `world-select.ts`**

Rename `partitionThreads`'s `retired` to `concluded` in the return type and body, and rewrite its doc comment: concluded Threads fold under their own heading because their state now lives in their cast's entries; order within each list is the stored order.

- [ ] **Step 4: `ThreadStatusIcon.tsx`**

Replace the import and the component body (keep the header comment, updating "from phase 6" to "during the Engine's own pass"):

```tsx
import { CheckCircle, Circle } from "nai:icons/feather";
import { T } from "../../style";
import type { ThreadStatus } from "../../../core/store/types";
import { statusOption } from "./thread-display";

export function ThreadStatusIcon(props: {
  status: ThreadStatus;
  size: number;
}) {
  const concluded = props.status === "concluded";
  return (
    <span
      title={statusOption(props.status).help}
      style={{
        display: "inline-flex",
        alignItems: "center",
        // Icons inherit this through SVG currentColor. Green for concluded,
        // matching the "on" reading MemberToggle uses; an open Thread is not a
        // warning, so it sits at the dim end.
        color: concluded ? T.midIntensity : T.textDisabled,
      }}
    >
      <CheckCircle
        size={props.size}
        style={{ display: concluded ? "inline-flex" : "none" }}
      />
      <Circle
        size={props.size}
        style={{ display: concluded ? "none" : "inline-flex" }}
      />
    </span>
  );
}
```

- [ ] **Step 5: `ThreadItem.tsx`**

Rename `retired` to `concluded` (`thread.status !== "open"`). After the row `<div>` that holds the icon, title button and `ConfirmButton`, and inside the outer column `<div>`, add:

```tsx
      {/* What the story model is shown for this Thread. Always mounted; an
          empty state renders an empty line rather than removing the element. */}
      <span
        style={{
          padding: `0 ${SP.sm} ${SP.sm}`,
          background: T.bg2,
          fontSize: "0.85em",
          color: T.text,
          opacity: concluded ? 0.55 : 0.85,
          display: thread.state ? "block" : "none",
        }}
      >
        {thread.state}
      </span>
      <span
        title="A Thread reaches the story model only when its cast is on stage, so one with no cast has no lorebook entry"
        style={{
          padding: `0 ${SP.sm} ${SP.sm}`,
          background: T.bg2,
          fontSize: "0.75em",
          color: T.textDisabled,
          display: thread.entityIds.length === 0 ? "block" : "none",
        }}
      >
        Not in the lorebook: add a cast
      </span>
```

Rewrite the header comment's first line to "One Thread row: status icon + title button + two-click delete, then its state." and replace the third paragraph's mention of "retired threads" with "concluded Threads".

- [ ] **Step 6: `ThreadEditPane.tsx`**

- Imports: replace `threadTextUpdated`, `threadHorizonSet` with `threadLedgerUpdated`; delete the `ThreadHorizon` type import, `HORIZON_OPTIONS`, `horizonOption`, and the `Crosshair`, `GitBranch`, `TrendingUp` icons. Delete `HORIZON_ICONS` and its comment.
- Drafts:

```tsx
const title = useDraftField(thread?.title ?? "");
const state = useDraftField(thread?.state ?? "");
const latent = useDraftField(thread?.latent ?? "");
```

- In the generation effect, `text.setValue(live)` becomes `state.setValue(live)`.
- `onSave`:

```tsx
const onSave = () => {
  store.dispatch(threadRenamed({ threadId, title: title.value.trim() }));
  store.dispatch(
    threadLedgerUpdated({
      threadId,
      state: state.value.trim(),
      latent: latent.value.trim(),
    }),
  );
  close();
};
```

- Delete the whole Horizon section (the label, the button row, the help line).
- Replace the Summary section with:

```tsx
      {/* State — what the story model reads. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <span style={{ ...sectionLabel, flex: 1 }}>State</span>
        <button
          title="Generate state"
          onClick={onGenerate}
          disabled={pending}
          style={genZapStyle(pending)}
        >
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <span style={{ fontSize: "0.75em", color: T.textDisabled }}>
        What the story model sees when this cast is on the page. Say only what
        is already so.
      </span>
      <textarea
        placeholder="How do things stand between them right now?"
        value={live ?? state.value}
        disabled={pending}
        onInput={(e) => state.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
      />

      {/* Private notes — never leave Story Engine. */}
      <span style={sectionLabel}>Private notes</span>
      <span style={{ fontSize: "0.75em", color: T.textDisabled }}>
        Never shown to the story model. What is unspoken, owed or concealed
        goes here.
      </span>
      <textarea
        placeholder="What is unsaid or unsettled between them?"
        value={latent.value}
        onInput={(e) => latent.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
      />
```

- Rewrite the header comment: title, state and private notes are local drafts committed on Save (`threadRenamed` + `threadLedgerUpdated`); membership toggles and the status control dispatch immediately.

- [ ] **Step 7: `World.tsx`**

- `const addThread = threadAddModel(openThreads.length, threadCap);` (move it below the `partitionThreads` call, whose destructuring becomes `{ open: openThreads, concluded: concludedThreads }`; rename `retiredOpen`/`setRetiredOpen` to `concludedOpen`/`setConcludedOpen`).
- `onAddThread` loses its `if (!addThread.enabled) return;` line and creates `{ id, title: "", state: "", entityIds: [] }`.
- The add button loses `aria-disabled`, and its style uses `color: T.text` and `opacity: 0.6` unconditionally.
- The fold's `title` becomes `"Threads whose state has settled into their cast's entries"` and its label `Concluded ({concludedThreads.length})`.
- Rewrite header comment lines 14-22: the add control shows the open count against the Engine's limit and never refuses, because the limit restrains the Engine's admissions only.

- [ ] **Step 8: Update the source-scan tests**

In `tests/ui/thread-source.test.ts`:

- Delete the `describe` blocks "the edit pane offers the horizon as a choice, like a category" and "the World panel refuses a hand create at the cap".
- In "the status indicator swaps no component types", the icons expected are `CheckCircle` and `Circle`.
- In "both thread creators go through the one action", delete the test "leaves the cap to the reducer".
- Add:

```ts
describe("the edit pane keeps the private half private", () => {
  const pane = readFileSync("src/ui/panels/world/ThreadEditPane.tsx", "utf8");

  it("labels each field with who reads it", () => {
    expect(pane).toContain(
      "What the story model sees when this cast is on the page.",
    );
    expect(pane).toContain("Never shown to the story model.");
  });

  it("saves both halves in one action", () => {
    expect(pane).toMatch(
      /threadLedgerUpdated\(\{\s*threadId,\s*state: state\.value\.trim\(\),\s*latent: latent\.value\.trim\(\),/,
    );
  });

  it("never stages a generation into the private notes", () => {
    expect(pane).not.toMatch(/latent\.setValue\(live\)/);
  });
});

describe("the World list shows a Thread's state and nothing private", () => {
  const item = readFileSync("src/ui/panels/world/ThreadItem.tsx", "utf8");

  it("renders state", () => {
    expect(item).toContain("{thread.state}");
  });

  it("never reads latent", () => {
    expect(item).not.toContain("latent");
  });
});
```

(The file already imports `readFileSync`; if its other tests read sources through a local helper, use that helper instead.)

- [ ] **Step 9: Run everything**

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: builds with no type errors.

- [ ] **Step 10: Commit**

```bash
npm run format
git add -A src/ui tests/ui
git commit -m "feat(world): the Thread pane edits a state and a private note"
```

---

### Task 4: The Thread write call

**Files:**

- Modify: `src/core/utils/prompts.ts` (append)
- Create: `src/core/engine/thread-write-strategy.ts`
- Test: `tests/core/engine/thread-write-strategy.test.ts`

**Interfaces:**

- Consumes: `clampProse` (triage-strategy), `trimToLastCompleteUnit` (revise-strategy), `buildModelParams`, `isTruncated` (utils/config), `stripThinkingTags` (utils/tag-parser).
- Produces:

```ts
export const THREAD_WRITE_MAX_TOKENS = 300;
export type ThreadWriteInput = {
  title: string;
  cast: { name: string; summary: string }[];
  current: { state: string; latent: string } | null;
  prose: string;
};
export type ThreadWriteRejection = { reply: string; phrase: string };
export type ThreadRecord = { moved: string; latent: string; state: string };
export function threadWriteParams(): Promise<GenerationParams>;
export function createThreadWriteFactory(
  input: ThreadWriteInput,
  rejection?: ThreadWriteRejection,
): MessageFactory;
export function parseThreadWrite(
  raw: string,
  finishReason: string | undefined,
): ThreadRecord | null;
export function lintState(state: string): string | null;
export function stateRejection(phrase: string): string;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/core/engine/thread-write-strategy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createThreadWriteFactory,
  lintState,
  parseThreadWrite,
  stateRejection,
  type ThreadWriteInput,
} from "../../../src/core/engine/thread-write-strategy";
import { THREAD_WRITE_SYSTEM } from "../../../src/core/utils/prompts";

const input: ThreadWriteInput = {
  title: "The Shared Apiary",
  cast: [
    { name: "Ines Corbel", summary: "Keeps the east hives." },
    { name: "Pell", summary: "" },
  ],
  current: {
    state: "They work the hives together.",
    latent: "Pell means to sell.",
  },
  prose: "Ines found the bill of sale under the smoker.",
};

const contents = async (factory: ReturnType<typeof createThreadWriteFactory>) =>
  (await factory()).messages.map((m) => m.content ?? "");

describe("the Thread write prompt", () => {
  it("orders system, cast, thread, prose, instruction", async () => {
    const blocks = await contents(createThreadWriteFactory(input));
    expect(blocks[0]).toBe(THREAD_WRITE_SYSTEM);
    expect(blocks[1]).toBe(
      "=== CAST ===\n- Ines Corbel: Keeps the east hives.\n- Pell",
    );
    expect(blocks[2]).toBe(
      "=== THREAD ===\nTitle: The Shared Apiary\nCast: Ines Corbel, Pell\nSTATE: They work the hives together.\nLATENT: Pell means to sell.",
    );
    expect(blocks[3]).toBe(
      "=== PROSE ===\nInes found the bill of sale under the smoker.",
    );
    expect(blocks).toHaveLength(5);
  });

  it("marks a Thread with no record as new", async () => {
    const blocks = await contents(
      createThreadWriteFactory({ ...input, current: null }),
    );
    expect(blocks[2]).toBe(
      "=== THREAD ===\nTitle: The Shared Apiary\nCast: Ines Corbel, Pell\n(new: no record yet)",
    );
  });

  it("writes an empty private note as none", async () => {
    const blocks = await contents(
      createThreadWriteFactory({
        ...input,
        current: { state: "S.", latent: "" },
      }),
    );
    expect(blocks[2]).toContain("LATENT: none");
  });

  it("appends its own rejected reply and the repair on a retry", async () => {
    const blocks = await contents(
      createThreadWriteFactory(input, {
        reply: "STATE: Pell will sell.",
        phrase: "will",
      }),
    );
    expect(blocks).toHaveLength(7);
    expect(blocks[5]).toBe("STATE: Pell will sell.");
    expect(blocks[6]).toBe(stateRejection("will"));
  });
});

describe("reading a Thread write", () => {
  it("reads the three fields", () => {
    expect(
      parseThreadWrite(
        "MOVED: Ines found the bill of sale.\nLATENT: Pell does not know she has it.\nSTATE: Ines Corbel holds the bill of sale for the east hives.",
        "stop",
      ),
    ).toEqual({
      moved: "Ines found the bill of sale.",
      latent: "Pell does not know she has it.",
      state: "Ines Corbel holds the bill of sale for the east hives.",
    });
  });

  it("tolerates bullets, bold labels and wrapped lines", () => {
    const record = parseThreadWrite(
      "- **MOVED:** a.\n**LATENT**: b\n  and more b.\n* STATE: c.\r\n",
      "stop",
    );
    expect(record).toEqual({
      moved: "a.",
      latent: "b and more b.",
      state: "c.",
    });
  });

  it("reads a LATENT of none as empty", () => {
    expect(parseThreadWrite("LATENT: None.\nSTATE: c.", "stop")?.latent).toBe(
      "",
    );
  });

  it("declines when STATE is missing or blank", () => {
    expect(parseThreadWrite("MOVED: a.\nLATENT: b.", "stop")).toBeNull();
    expect(parseThreadWrite("STATE:   ", "stop")).toBeNull();
  });

  it("cuts a truncated STATE back to its last whole sentence, or declines", () => {
    expect(
      parseThreadWrite("STATE: Ines holds the bill. Pell has gon", "length")
        ?.state,
    ).toBe("Ines holds the bill.");
    expect(parseThreadWrite("STATE: Ines holds the bi", "length")).toBeNull();
  });

  it("ignores a lowercase label in prose", () => {
    expect(
      parseThreadWrite("the state: of things\nSTATE: c.", "stop")?.state,
    ).toBe("c.");
  });
});

describe("the STATE lint", () => {
  it.each([
    ["Pell has not yet sold the hives.", "yet"],
    ["Pell hasn't told her.", "hasn't"],
    ["Pell hasn’t told her.", "hasn't"],
    ["Ines must decide.", "must"],
    ["The sale happens soon.", "soon"],
    ["Pell is about to leave.", "about to"],
    ["She keeps them until spring.", "until"],
    ["Pell will sell the hives.", "will"],
    ["One day the hives go.", "one day"],
  ])("rejects %j for %j", (state, phrase) => {
    expect(lintState(state)).toBe(phrase);
  });

  it.each([
    "Ines Corbel holds the bill of sale for the east hives.",
    "The mustard field belongs to Pell.",
    "Will Carter keeps the west hives.",
    "The water in the trough stands still.",
  ])("accepts %j", (state) => {
    expect(lintState(state)).toBeNull();
  });

  it("names the phrase and the repair in its rejection", () => {
    expect(stateRejection("yet")).toBe(
      'STATE contains "yet", which points forward. Move that to LATENT. STATE says only what is already so. Write all three fields again.',
    );
  });
});
```

Run: `npx vitest run tests/core/engine/thread-write-strategy.test.ts`
Expected: FAIL: the module does not exist.

- [ ] **Step 2: Add the prompts**

Append to `src/core/utils/prompts.ts`:

```ts
/** The Engine writing one Thread (design: threads-as-standing-state §6.3).
 *
 *  A Thread has two readers, and the whole prompt is written against one
 *  failure: forward-pointing material landing in the half the story model
 *  reads. A model shown that something has not happened writes it happening.
 *
 *  Three things push the other way. LATENT is asked for BEFORE STATE, so the
 *  pending material has a home before the model writes the part that is shown.
 *  The examples are minimal pairs — the same facts sorted, and two lines that
 *  look alike and belong in different fields. And `lintState` in
 *  `thread-write-strategy.ts` rejects a STATE that points forward anyway: a
 *  prompt is an argument and a lint is a floor.
 *
 *  Unmeasured until `tools/review-probe.naiscript` has been run. */
export const THREAD_WRITE_SYSTEM = `You are the archivist of a story engine. You keep one Thread at a time: a record of how things stand between the entities in its cast.

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
- Return the three fields and nothing else.`;

export const THREAD_WRITE_INSTRUCTION = `Write MOVED, then LATENT, then STATE for the Thread above, from the prose above.`;
```

- [ ] **Step 3: Write the module**

Create `src/core/engine/thread-write-strategy.ts`:

```ts
// The Thread write: the prompt that produces a Thread's two halves, how to read
// its answer, and the lint that guards the half the story model sees.
//
// Like `revise-strategy.ts`, this module returns text and never writes. The
// drain's `threadWrite` and `admit` arms dispatch what comes back.
//
// Sent to the INSTRUCT model, for revise's reason one step further: `state` is
// read by the model writing the story, so a creative fine-tune's instinct to
// embellish would put invented specifics into that model's context unattended.

import type { MessageFactory } from "nai-gen-x";
import { clampProse } from "./triage-strategy";
import { trimToLastCompleteUnit } from "./revise-strategy";
import { buildModelParams, isTruncated } from "../utils/config";
import { stripThinkingTags } from "../utils/tag-parser";
import {
  THREAD_WRITE_SYSTEM,
  THREAD_WRITE_INSTRUCTION,
} from "../utils/prompts";

/** The price of one Thread write: three short fields. The drain refuses to
 *  start one the bucket cannot cover and quotes this number, so it must be the
 *  number `max_tokens` then bounds the call at. */
export const THREAD_WRITE_MAX_TOKENS = 300;

export type ThreadWriteInput = {
  title: string;
  /** The cast as the World records it. Summaries are context for who these
   *  entities are; the prompt forbids taking facts about the Thread from them. */
  cast: { name: string; summary: string }[];
  /** The Thread as it stands, or null for an admission. */
  current: { state: string; latent: string } | null;
  /** The prose the review pass read — carried on the intent. */
  prose: string;
};

/** A first answer the lint refused: what the model wrote, and the phrase that
 *  failed. Appended to the same conversation on the retry, so the generation
 *  whose output was rejected is the one that sees the rejection. */
export type ThreadWriteRejection = { reply: string; phrase: string };

export type ThreadRecord = {
  /** What the model said changed. Logged, never stored. */
  moved: string;
  latent: string;
  state: string;
};

/** Colder than revise's 0.6: the fields say what the prose established and no
 *  more, and latitude buys exactly what the prompt spends its length forbidding. */
export function threadWriteParams(): Promise<GenerationParams> {
  return buildModelParams(
    { max_tokens: THREAD_WRITE_MAX_TOKENS, temperature: 0.4, min_p: 0.05 },
    "instruct",
  );
}

function formatCast(cast: ThreadWriteInput["cast"]): string {
  const lines = cast.map((member) => {
    const summary = member.summary.trim();
    return `- ${member.name}${summary ? `: ${summary}` : ""}`;
  });
  return `=== CAST ===\n${lines.join("\n")}`;
}

function formatThread(input: ThreadWriteInput): string {
  const head = `=== THREAD ===\nTitle: ${input.title.trim()}\nCast: ${input.cast
    .map((m) => m.name)
    .join(", ")}`;
  if (!input.current) return `${head}\n(new: no record yet)`;
  return `${head}\nSTATE: ${input.current.state.trim()}\nLATENT: ${
    input.current.latent.trim() || "none"
  }`;
}

/** Context first, the thing being written last: who the cast are, the Thread
 *  as it stands, the prose that moved it, then the ask. */
export function createThreadWriteFactory(
  input: ThreadWriteInput,
  rejection?: ThreadWriteRejection,
): MessageFactory {
  return async () => {
    const messages: Message[] = [
      { role: "system", content: THREAD_WRITE_SYSTEM },
      { role: "assistant", content: formatCast(input.cast) },
      { role: "assistant", content: formatThread(input) },
      {
        role: "assistant",
        content: `=== PROSE ===\n${clampProse(input.prose.trim())}`,
      },
      { role: "user", content: THREAD_WRITE_INSTRUCTION },
    ];
    if (rejection) {
      messages.push(
        { role: "assistant", content: rejection.reply },
        { role: "user", content: stateRejection(rejection.phrase) },
      );
    }
    return { messages, params: await threadWriteParams() };
  };
}

// ──────────────────────────── reading the answer ────────────────────────────

/** A field label at the start of a line: capitals, a colon, and whatever
 *  decoration a model reaches for around them. Capitals are required so a
 *  sentence containing "the state: …" is not read as a field. */
const FIELD =
  /^\s*(?:[-*•]\s*)?\**\s*(MOVED|LATENT|STATE)\s*\**\s*:\s*\**\s*(.*)$/;

/** Read the three fields, or null to decline.
 *
 *  A field runs until the next label, so a model that wraps a sentence loses
 *  nothing. `LATENT: none` reads as empty. A missing or blank STATE declines the
 *  whole write: a Thread's entry text is its state, and a blank one is an entry
 *  with nothing to say. A truncated answer is cut back to its last whole
 *  sentence rather than continued — the drain paid for one call. */
export function parseThreadWrite(
  raw: string,
  finishReason: string | undefined,
): ThreadRecord | null {
  let body = stripThinkingTags(raw);
  if (isTruncated(finishReason)) body = trimToLastCompleteUnit(body);

  const fields: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of body.split(/\r\n|\r|\n/)) {
    const match = FIELD.exec(line);
    if (match) {
      current = match[1];
      fields[current] = [match[2].trim()];
    } else if (current && line.trim()) {
      fields[current].push(line.trim());
    }
  }

  const read = (label: string): string =>
    (fields[label] ?? []).filter(Boolean).join(" ").trim();

  const state = read("STATE");
  if (!state) return null;
  const latent = read("LATENT");
  return {
    moved: read("MOVED"),
    latent: /^none\.?$/i.test(latent) ? "" : latent,
    state,
  };
}

// ───────────────────────────────── the lint ─────────────────────────────────

/** Phrasing that points at something to come. A lint over surface form, not a
 *  reading of meaning: it will sometimes reject an innocent sentence, and the
 *  cost is one retry. `still` is deliberately absent — "stands still", "the
 *  still water" — and `will` is matched in lowercase only, so a character
 *  named Will does not make every STATE unwritable. */
const FORWARD_PHRASES: readonly { phrase: string; flags: string }[] = [
  { phrase: "yet", flags: "i" },
  { phrase: "hasn't", flags: "i" },
  { phrase: "has not", flags: "i" },
  { phrase: "haven't", flags: "i" },
  { phrase: "have not", flags: "i" },
  { phrase: "soon", flags: "i" },
  { phrase: "will", flags: "" },
  { phrase: "about to", flags: "i" },
  { phrase: "until", flags: "i" },
  { phrase: "must", flags: "i" },
  { phrase: "waiting", flags: "i" },
  { phrase: "sooner or later", flags: "i" },
  { phrase: "one day", flags: "i" },
  { phrase: "eventually", flags: "i" },
];

/** The first forward-pointing phrase in a STATE, or null when it is clean. */
export function lintState(state: string): string | null {
  const text = state.replace(/[’‘]/g, "'");
  for (const { phrase, flags } of FORWARD_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`, flags);
    if (pattern.test(text)) return phrase;
  }
  return null;
}

/** The rejection the retry is shown: the phrase, and the exact repair. */
export function stateRejection(phrase: string): string {
  return `STATE contains "${phrase}", which points forward. Move that to LATENT. STATE says only what is already so. Write all three fields again.`;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/core/engine/thread-write-strategy.test.ts`
Expected: PASS. If `isTruncated("length")` is false in this codebase, read `isTruncated` in `src/core/utils/config.ts` and use the finish reason it treats as truncated in the two truncation tests.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/core/utils/prompts.ts src/core/engine/thread-write-strategy.ts tests/core/engine/thread-write-strategy.test.ts
git commit -m "feat(engine): the Thread write call, and a lint on what the story model sees"
```

---

### Task 5: The review call and its floors

**Files:**

- Modify: `src/core/utils/prompts.ts` (append)
- Create: `src/core/engine/review-strategy.ts`
- Test: `tests/core/engine/review-strategy.test.ts`

**Interfaces:**

- Consumes: `Watermark`, `mentionsName` (assess); `TriageEntity`, `cleanArgument`, `normalizeName`, `indexBy` (triage-strategy, Task 1); `atThreadCap` (thread-cap, Task 2); `Aliases` (thread-bind, Task 2); `Thread`.
- Produces:

```ts
export const REVIEW_MAX_TOKENS = 400;
export const REVIEW_WINDOW_CHARS = 12000;
export const ADMIT_MIN_PARAGRAPHS = 3;
export type ReviewWindow = {
  paragraphs: string[];
  reached: Watermark | null;
  backlog: number;
};
export function reviewWindow(
  input: {
    sectionIds: number[];
    watermark: Watermark | null;
    textBySection: Map<number, string>;
  },
  limitChars?: number,
): ReviewWindow;
export function paragraphsNaming(
  paragraphs: readonly string[],
  aliases: readonly string[],
): number;
export type ReviewThread = {
  id: string;
  title: string;
  cast: string[];
  entityIds: string[];
  state: string;
  latent: string;
  inProse: boolean;
};
export type ReviewManifest = {
  foundation: string;
  entities: TriageEntity[];
  threads: ReviewThread[];
};
export function buildReviewManifest(input: {
  foundation: string;
  entities: TriageEntity[];
  threads: Thread[];
  aliases: Aliases;
  paragraphs: string[];
}): ReviewManifest;
export function reviewParams(): Promise<GenerationParams>;
export function createReviewFactory(
  manifest: ReviewManifest,
  paragraphs: string[],
): MessageFactory;
export type ReviewDecision =
  | { kind: "update"; threadId: string }
  | { kind: "conclude"; threadId: string }
  | { kind: "admit"; title: string; entityIds: string[] };
export function parseReview(
  text: string,
  manifest: ReviewManifest,
): ReviewDecision[];
export type FloorContext = {
  threads: Thread[];
  paragraphs: string[];
  aliases: Aliases;
  threadCap: number;
};
export type FloorResult = {
  accepted: ReviewDecision[];
  refused: { decision: ReviewDecision; reason: string }[];
};
export function applyFloors(
  decisions: ReviewDecision[],
  context: FloorContext,
): FloorResult;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/core/engine/review-strategy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ADMIT_MIN_PARAGRAPHS,
  applyFloors,
  buildReviewManifest,
  createReviewFactory,
  paragraphsNaming,
  parseReview,
  reviewWindow,
  type ReviewManifest,
} from "../../../src/core/engine/review-strategy";
import { REVIEW_SYSTEM } from "../../../src/core/utils/prompts";
import type { Thread } from "../../../src/core/store/types";

const sections = (...texts: string[]) => ({
  sectionIds: texts.map((_, i) => 100 + i),
  textBySection: new Map(texts.map((t, i) => [100 + i, t])),
});

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    title: "The Shared Apiary",
    state: "They work the hives together.",
    latent: "Pell means to sell.",
    entityIds: ["a", "b"],
    status: "open",
    ...over,
  };
}

const entities = [
  {
    id: "a",
    name: "Ines Corbel",
    category: "Character",
    summary: "Keeps the east hives.",
  },
  { id: "b", name: "Pell", category: "Character", summary: "" },
  { id: "c", name: "The Cooperative", category: "Faction", summary: "" },
];
const aliases = {
  a: ["Ines Corbel", "ines"],
  b: ["Pell"],
  c: ["The Cooperative"],
};

describe("the review window", () => {
  it("reads everything on a branch never reviewed", () => {
    const w = reviewWindow({
      ...sections("one", "", "three"),
      watermark: null,
    });
    expect(w.paragraphs).toEqual(["one", "three"]);
    expect(w.backlog).toBe(2);
    expect(w.reached).toEqual({ sectionId: 102, offset: 5 });
  });

  it("starts after the watermark, including what was appended to its section", () => {
    const w = reviewWindow({
      ...sections("read. appended", "next"),
      watermark: { sectionId: 100, offset: 5 },
    });
    expect(w.paragraphs).toEqual(["appended", "next"]);
  });

  it("stops at a paragraph boundary when the limit is reached, and counts the rest as backlog", () => {
    const w = reviewWindow(
      { ...sections("aaaa", "bbbb", "cccc"), watermark: null },
      9,
    );
    expect(w.paragraphs).toEqual(["aaaa", "bbbb"]);
    expect(w.backlog).toBe(3);
    expect(w.reached).toEqual({ sectionId: 101, offset: 4 });
  });

  it("takes one oversized paragraph whole rather than cutting it", () => {
    const w = reviewWindow(
      { ...sections("a".repeat(50), "b"), watermark: null },
      9,
    );
    expect(w.paragraphs).toEqual(["a".repeat(50)]);
  });

  it("re-reads from the start when the watermark's section is gone", () => {
    const w = reviewWindow({
      ...sections("one"),
      watermark: { sectionId: 999, offset: 0 },
    });
    expect(w.paragraphs).toEqual(["one"]);
  });

  it("is empty when nothing is unread", () => {
    const w = reviewWindow({
      ...sections("one"),
      watermark: { sectionId: 100, offset: 3 },
    });
    expect(w.paragraphs).toEqual([]);
    expect(w.backlog).toBe(0);
  });
});

describe("the review manifest", () => {
  const paragraphs = [
    "Ines lit the smoker.",
    "Pell watched Ines work.",
    "The road was empty.",
  ];

  it("tags a Thread whose cast is on stage, by alias", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread()],
      aliases,
      paragraphs,
    });
    expect(m.threads[0].inProse).toBe(true);
    expect(m.threads[0].cast).toEqual(["Ines Corbel", "Pell"]);
  });

  it("does not tag a two-person Thread when only one of them appears", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread()],
      aliases,
      paragraphs: ["Ines lit the smoker."],
    });
    expect(m.threads[0].inProse).toBe(false);
  });

  it("lists entities the window names plus every open Thread's cast, and leaves out the rest", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread({ entityIds: ["c"] })],
      aliases,
      paragraphs: ["Ines lit the smoker."],
    });
    expect(m.entities.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("leaves concluded Threads out", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread({ status: "concluded" })],
      aliases,
      paragraphs,
    });
    expect(m.threads).toEqual([]);
  });
});

describe("the review prompt", () => {
  it("orders system, foundation, entities, threads, prose, instruction", async () => {
    const manifest = buildReviewManifest({
      foundation: "[NARRATIVE FOUNDATION]\nIntent: a slow feud",
      entities,
      threads: [thread()],
      aliases,
      paragraphs: ["Ines lit the smoker.", "Pell watched Ines work."],
    });
    const { messages } = await createReviewFactory(manifest, [
      "Ines lit the smoker.",
      "Pell watched Ines work.",
    ])();
    const blocks = messages.map((m) => m.content ?? "");
    expect(blocks[0]).toBe(REVIEW_SYSTEM);
    expect(blocks[1]).toBe("[NARRATIVE FOUNDATION]\nIntent: a slow feud");
    expect(blocks[2]).toBe(
      "=== KNOWN ENTITIES ===\n- Ines Corbel [Character]: Keeps the east hives.\n- Pell [Character]",
    );
    expect(blocks[3]).toBe(
      "=== THREADS ===\n- The Shared Apiary [in this prose] | cast: Ines Corbel, Pell\n  STATE: They work the hives together.\n  PRIVATE: Pell means to sell.",
    );
    expect(blocks[4]).toBe(
      "=== PROSE ===\nInes lit the smoker.\n\nPell watched Ines work.",
    );
    expect(blocks).toHaveLength(6);
  });

  it("says so when there are no Threads, and omits an empty foundation", async () => {
    const manifest = buildReviewManifest({
      foundation: "",
      entities,
      threads: [],
      aliases,
      paragraphs: ["Ines."],
    });
    const blocks = (
      await createReviewFactory(manifest, ["Ines."])()
    ).messages.map((m) => m.content ?? "");
    expect(blocks[2]).toBe("=== THREADS ===\n(none yet)");
    expect(blocks).toHaveLength(5);
  });
});

describe("reading a review", () => {
  const manifest: ReviewManifest = {
    foundation: "",
    entities,
    threads: [
      {
        id: "t1",
        title: "The Shared Apiary",
        cast: [],
        entityIds: ["a", "b"],
        state: "",
        latent: "",
        inProse: true,
      },
    ],
  };

  it("reads the three commands", () => {
    expect(
      parseReview(
        "UPDATE The Shared Apiary\nCONCLUDE the shared apiary\nADMIT The Sold Hives | Ines Corbel, The Cooperative",
        manifest,
      ),
    ).toEqual([
      { kind: "update", threadId: "t1" },
      { kind: "conclude", threadId: "t1" },
      { kind: "admit", title: "The Sold Hives", entityIds: ["a", "c"] },
    ]);
  });

  it("ignores reasoning lines, including ones that end in a verb", () => {
    const text =
      "The Shared Apiary: the prose shows Pell sell the hives; the record says they share them: UPDATE\nAdmission: Ines Corbel and Pell. Nothing new stands between them: no command";
    expect(parseReview(text, manifest)).toEqual([]);
  });

  it("drops a command naming a Thread it was not shown", () => {
    expect(parseReview("UPDATE The Hanging Nail", manifest)).toEqual([]);
  });

  it("drops an ADMIT naming anyone who is not a known entity", () => {
    expect(
      parseReview(
        "ADMIT The Funny Look | Ines Corbel, a passing couple",
        manifest,
      ),
    ).toEqual([]);
  });

  it("drops an ADMIT with no cast, or no bar", () => {
    expect(parseReview("ADMIT The Glass On The Table", manifest)).toEqual([]);
    expect(parseReview("ADMIT The Glass On The Table | ", manifest)).toEqual(
      [],
    );
  });

  it("peels decoration from the title and the names", () => {
    expect(
      parseReview(
        '- ADMIT "The Sold Hives" | "Ines Corbel", [Pell] — because of the sale',
        manifest,
      ),
    ).toEqual([
      { kind: "admit", title: "The Sold Hives", entityIds: ["a", "b"] },
    ]);
  });

  it("names a cast member once however often the model repeats them", () => {
    expect(parseReview("ADMIT X | Pell, Pell", manifest)).toEqual([
      { kind: "admit", title: "X", entityIds: ["b"] },
    ]);
  });
});

describe("the floors", () => {
  const sustained = [
    "Ines counted frames.",
    "The Cooperative sent a letter to Ines.",
    "Ines read it twice.",
    "The Cooperative wanted the east hives.",
    "The Cooperative would not wait, Ines said.",
  ];
  const context = {
    threads: [thread()],
    paragraphs: sustained,
    aliases,
    threadCap: 8,
  };
  const admit = (entityIds: string[]) => ({
    kind: "admit" as const,
    title: "The Sold Hives",
    entityIds,
  });

  it("counts paragraphs by alias", () => {
    expect(paragraphsNaming(sustained, aliases.a)).toBe(4);
    expect(ADMIT_MIN_PARAGRAPHS).toBe(3);
  });

  it("admits a cast that recurs", () => {
    expect(applyFloors([admit(["a", "c"])], context).accepted).toEqual([
      admit(["a", "c"]),
    ]);
  });

  it("refuses a cast member named in fewer than three paragraphs", () => {
    const result = applyFloors([admit(["a", "b"])], context);
    expect(result.accepted).toEqual([]);
    expect(result.refused[0].reason).toContain("fewer than 3 paragraphs");
  });

  it("turns an admission of an existing cast into an update of that Thread", () => {
    const paragraphs = ["Ines and Pell.", "Pell and Ines.", "Ines, Pell."];
    expect(
      applyFloors([admit(["b", "a"])], { ...context, paragraphs }).accepted,
    ).toEqual([{ kind: "update", threadId: "t1" }]);
  });

  it("admits at most one Thread per review", () => {
    const result = applyFloors(
      [admit(["a", "c"]), { kind: "admit", title: "Second", entityIds: ["c"] }],
      context,
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.refused[0].reason).toBe("one admission per review");
  });

  it("admits nothing at the thread limit", () => {
    const result = applyFloors([admit(["a", "c"])], {
      ...context,
      threadCap: 1,
    });
    expect(result.accepted).toEqual([]);
    expect(result.refused[0].reason).toBe("thread limit reached");
  });

  it("does not count concluded Threads against the limit", () => {
    const threads = [thread({ status: "concluded" })];
    expect(
      applyFloors([admit(["a", "c"])], { ...context, threads, threadCap: 1 })
        .accepted,
    ).toHaveLength(1);
  });

  it("lets a conclude outrank an update of the same Thread", () => {
    expect(
      applyFloors(
        [
          { kind: "conclude", threadId: "t1" },
          { kind: "update", threadId: "t1" },
        ],
        context,
      ).accepted,
    ).toEqual([{ kind: "conclude", threadId: "t1" }]);
  });

  it("refuses to touch a Thread that is no longer open", () => {
    const threads = [thread({ status: "concluded" })];
    expect(
      applyFloors([{ kind: "update", threadId: "t1" }], { ...context, threads })
        .accepted,
    ).toEqual([]);
  });
});
```

Run: `npx vitest run tests/core/engine/review-strategy.test.ts`
Expected: FAIL: the module does not exist.

- [ ] **Step 2: Add the prompts**

Append to `src/core/utils/prompts.ts`:

```ts
/** The Engine's review pass (design: threads-as-standing-state §6.2).
 *
 *  The slow read. It runs once per scene's worth of prose, with the Foundation
 *  in view, and it is the only thing that may admit a Thread. Two chains, each
 *  writing the fact before the verdict that depends on it, each with an arm
 *  for "the prose does not show this" whose answer is stated: no command.
 *
 *  Membership is not asked of the model. Code tags the Threads whose cast is in
 *  the prose and lists only entities the prose names; after the answer, code
 *  refuses an admission whose cast is not a known entity, does not recur, or
 *  duplicates a Thread (`applyFloors` in `review-strategy.ts`).
 *
 *  Unmeasured until `tools/review-probe.naiscript` has been run. */
export const REVIEW_SYSTEM = `You are the review pass of a story engine. You read a scene's worth of prose and keep a short list of Threads true. A Thread records how things stand between known entities: an alliance, a rivalry, a debt, a claim one holds over another.

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
- Most reviews change little. Writing no command is a correct and common answer.`;

export const REVIEW_INSTRUCTION = `Walk each Thread tagged [in this prose], then admission, then write the commands, or none.`;
```

- [ ] **Step 3: Write the module**

Create `src/core/engine/review-strategy.ts`:

```ts
// Review: the slow read that keeps Threads true, and the floors under it.
//
// Triage reads a paragraph or three after every generation and may only revise
// an entity. Review reads a scene's worth, with the Foundation in view, and is
// the only thing that may admit, update or conclude a Thread — because an arc
// is not visible at paragraph grain, and judged there every unsettled detail
// looks like one.
//
// The split of labour is fixed. CODE supplies what can be computed: which prose
// is unread, which entities it names, which Threads' casts are on stage. The
// MODEL decides what the prose shows between them. CODE then checks every
// decision it can check (`applyFloors`) and drops what fails.
//
// Pure: no `api.v1`, no store. The pass (`engine-loop.ts`) reads the document
// and the lorebook and hands the results in.

import type { MessageFactory } from "nai-gen-x";
import { mentionsName, type Watermark } from "./assess";
import {
  cleanArgument,
  indexBy,
  normalizeName,
  type TriageEntity,
} from "./triage-strategy";
import { atThreadCap } from "./thread-cap";
import type { Aliases } from "./thread-bind";
import type { Thread } from "../store/types";
import { buildModelParams } from "../utils/config";
import { REVIEW_SYSTEM, REVIEW_INSTRUCTION } from "../utils/prompts";

/** The review call's output allowance: a reasoning line per Thread on stage,
 *  the admission chain, and the commands. */
export const REVIEW_MAX_TOKENS = 400;

/** How much prose one review reads, in characters — about thirty paragraphs.
 *  A window, never a clamp: what does not fit is left for the next review. */
export const REVIEW_WINDOW_CHARS = 12000;

/** How many separate paragraphs must name each member of an admitted cast. The
 *  computable form of "sustained, not an aside". */
export const ADMIT_MIN_PARAGRAPHS = 3;

// ─────────────────────────────── the window ───────────────────────────────

export type ReviewWindow = {
  /** The unread paragraphs this review will read, in document order. */
  paragraphs: string[];
  /** Where the review watermark moves to if this review completes: the end of
   *  the last section the window covers. Null when there is nothing past the
   *  watermark at all. */
  reached: Watermark | null;
  /** Every unread paragraph past the watermark, including those this window
   *  did not reach — what the trigger and the HUD count. */
  backlog: number;
};

/** The prose past the review watermark, up to `limitChars`, whole paragraphs
 *  only.
 *
 *  Same reading of a watermark as `assess`: an offset inside its section, so
 *  prose appended to a paragraph already reviewed is picked up; and a watermark
 *  naming a section the document no longer holds reads as none.
 *
 *  **The window never cuts a paragraph and never cuts the middle out.** It
 *  stops BEFORE the paragraph that would cross the limit and leaves the rest as
 *  backlog. A single paragraph larger than the limit is taken whole, because
 *  the alternative is a review that can never get past it. */
export function reviewWindow(
  input: {
    sectionIds: number[];
    watermark: Watermark | null;
    textBySection: Map<number, string>;
  },
  limitChars: number = REVIEW_WINDOW_CHARS,
): ReviewWindow {
  const { sectionIds, watermark, textBySection } = input;
  const at = watermark === null ? -1 : sectionIds.indexOf(watermark.sectionId);

  const pieces: { sectionId: number; text: string; end: number }[] = [];
  if (watermark !== null && at !== -1) {
    const full = textBySection.get(watermark.sectionId) ?? "";
    pieces.push({
      sectionId: watermark.sectionId,
      text: full.slice(watermark.offset).trim(),
      end: full.length,
    });
  }
  for (const sectionId of sectionIds.slice(at + 1)) {
    const full = textBySection.get(sectionId) ?? "";
    pieces.push({ sectionId, text: full.trim(), end: full.length });
  }

  const backlog = pieces.filter((piece) => piece.text.length > 0).length;

  const paragraphs: string[] = [];
  let reached: Watermark | null = null;
  let size = 0;
  for (const piece of pieces) {
    if (piece.text.length > 0) {
      if (paragraphs.length > 0 && size + piece.text.length > limitChars) break;
      paragraphs.push(piece.text);
      size += piece.text.length;
    }
    // A blank section is covered too, so the watermark does not stall on it.
    reached = { sectionId: piece.sectionId, offset: piece.end };
  }

  return { paragraphs, reached, backlog };
}

// ─────────────────────────────── the manifest ───────────────────────────────

function namedIn(text: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => mentionsName(text, alias));
}

/** How many of these paragraphs name the entity, by any of its aliases. */
export function paragraphsNaming(
  paragraphs: readonly string[],
  aliases: readonly string[],
): number {
  return paragraphs.filter((paragraph) => namedIn(paragraph, aliases)).length;
}

export type ReviewThread = {
  id: string;
  title: string;
  /** Cast names as KNOWN ENTITIES spells them. */
  cast: string[];
  entityIds: string[];
  state: string;
  /** Shown to the review model, which needs it to notice an arc moving. This
   *  prompt is never the story's context. */
  latent: string;
  /** Whether the cast is on stage in this window — computed, never asked. */
  inProse: boolean;
};

/** Both halves of the contract: rendered into the prompt, and the only thing
 *  `parseReview` resolves a name against. */
export type ReviewManifest = {
  /** `formatFoundationBlock`'s output, or "" when the story has none. What
   *  makes "does this matter to the story" a question the input can answer. */
  foundation: string;
  entities: TriageEntity[];
  threads: ReviewThread[];
};

/** Build the manifest from the World and the window.
 *
 *  A Thread is tagged on the same rule its lorebook entry activates on: both
 *  members of a pair, any two of a larger cast, the one of a single.
 *
 *  Entities are the ones the window names, plus every open Thread's cast. An
 *  entity the window never names cannot pass the admission floor, so listing it
 *  would only lengthen a prompt that is rebuilt every review. */
export function buildReviewManifest(input: {
  foundation: string;
  entities: TriageEntity[];
  threads: Thread[];
  aliases: Aliases;
  paragraphs: string[];
}): ReviewManifest {
  const { foundation, entities, aliases, paragraphs } = input;
  const text = paragraphs.join("\n\n");
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const open = input.threads.filter((thread) => thread.status === "open");

  const threads: ReviewThread[] = open.map((thread) => {
    const cast = thread.entityIds.filter((id) => byId.has(id));
    const onStage = cast.filter((id) =>
      namedIn(text, aliases[id] ?? []),
    ).length;
    return {
      id: thread.id,
      title: thread.title,
      cast: cast.map((id) => (byId.get(id) as TriageEntity).name),
      entityIds: thread.entityIds,
      state: thread.state,
      latent: thread.latent,
      inProse: cast.length > 0 && onStage >= Math.min(2, cast.length),
    };
  });

  const inCast = new Set(open.flatMap((thread) => thread.entityIds));
  return {
    foundation,
    entities: entities.filter(
      (entity) =>
        inCast.has(entity.id) || namedIn(text, aliases[entity.id] ?? []),
    ),
    threads,
  };
}

// ──────────────────────────────── the prompt ────────────────────────────────

export function reviewParams(): Promise<GenerationParams> {
  return buildModelParams(
    { max_tokens: REVIEW_MAX_TOKENS, temperature: 0.3 },
    "instruct",
  );
}

function formatEntities(entities: TriageEntity[]): string {
  const lines = entities.map((e) => {
    const summary = e.summary.trim();
    return `- ${e.name} [${e.category}]${summary ? `: ${summary}` : ""}`;
  });
  return `=== KNOWN ENTITIES ===\n${lines.join("\n")}`;
}

function formatThreads(threads: ReviewThread[]): string {
  if (threads.length === 0) return "=== THREADS ===\n(none yet)";
  const lines = threads.map(
    (t) =>
      `- ${t.title}${t.inProse ? " [in this prose]" : ""} | cast: ${t.cast.join(", ")}\n  STATE: ${t.state.trim() || "(blank)"}\n  PRIVATE: ${t.latent.trim() || "none"}`,
  );
  return `=== THREADS ===\n${lines.join("\n")}`;
}

/** Context first, the thing being decided last: what the story is, who is in
 *  it, the Threads as recorded, then the prose, then the ask. */
export function createReviewFactory(
  manifest: ReviewManifest,
  paragraphs: string[],
): MessageFactory {
  return async () => {
    const messages: Message[] = [{ role: "system", content: REVIEW_SYSTEM }];
    if (manifest.foundation.trim()) {
      messages.push({ role: "assistant", content: manifest.foundation });
    }
    messages.push(
      { role: "assistant", content: formatEntities(manifest.entities) },
      { role: "assistant", content: formatThreads(manifest.threads) },
      {
        role: "assistant",
        content: `=== PROSE ===\n${paragraphs.join("\n\n")}`,
      },
      { role: "user", content: REVIEW_INSTRUCTION },
    );
    return { messages, params: await reviewParams() };
  };
}

// ──────────────────────────── reading the answer ────────────────────────────

export type ReviewDecision =
  | { kind: "update"; threadId: string }
  | { kind: "conclude"; threadId: string }
  | { kind: "admit"; title: string; entityIds: string[] };

/** A command is the verb in capitals at the start of a line. A reasoning line
 *  ends in its verdict and starts with a Thread title or "Admission", so it
 *  never matches. */
const COMMAND =
  /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(UPDATE|ADMIT|CONCLUDE)\b[:\s]*(.*)$/;

/** Read the review's response into decisions, resolving every name against the
 *  manifest the model was shown. A line that cannot be resolved is dropped —
 *  never fuzzy-matched. An ADMIT naming even one cast member who is not a known
 *  entity is dropped whole: that member is exactly the non-entity the floor
 *  exists to keep out, and admitting the rest would record a different Thread
 *  than the model described. */
export function parseReview(
  text: string,
  manifest: ReviewManifest,
): ReviewDecision[] {
  const threadIds = indexBy(manifest.threads, (t) => t.title);
  const entityIds = indexBy(manifest.entities, (e) => e.name);

  const decisions: ReviewDecision[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = COMMAND.exec(line);
    if (!match) continue;
    const [, verb, rest] = match;

    if (verb === "ADMIT") {
      const bar = rest.indexOf("|");
      if (bar === -1) continue;
      const title = cleanArgument(rest.slice(0, bar));
      const names = rest
        .slice(bar + 1)
        .split(",")
        .map((name) => cleanArgument(name))
        .filter((name) => name.length > 0);
      const ids = names.map((name) => entityIds.get(normalizeName(name)));
      if (!title || ids.length === 0 || ids.includes(undefined)) continue;
      decisions.push({
        kind: "admit",
        title,
        entityIds: [...new Set(ids as string[])],
      });
      continue;
    }

    const threadId = threadIds.get(normalizeName(cleanArgument(rest)));
    if (!threadId) continue;
    decisions.push({
      kind: verb === "UPDATE" ? "update" : "conclude",
      threadId,
    });
  }
  return decisions;
}

// ───────────────────────────────── the floors ─────────────────────────────────

export type FloorContext = {
  threads: Thread[];
  paragraphs: string[];
  aliases: Aliases;
  threadCap: number;
};

export type FloorResult = {
  accepted: ReviewDecision[];
  /** What was refused and why, for the Engine log — so a writer wondering why
   *  no Thread appeared can find the floor that stopped it. */
  refused: { decision: ReviewDecision; reason: string }[];
};

function sameCast(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** What code checks before anything is queued.
 *
 *  1. UPDATE and CONCLUDE must name a Thread that is still open.
 *  2. An ADMIT whose cast is exactly an open Thread's cast is that Thread
 *     again under another title; it becomes an UPDATE of it.
 *  3. One ADMIT per review.
 *  4. Every admitted cast member is named in at least `ADMIT_MIN_PARAGRAPHS`
 *     separate paragraphs of the window.
 *  5. No ADMIT at the thread limit.
 *
 *  One decision per Thread: a CONCLUDE outranks an UPDATE of the same Thread,
 *  since the concluding rewrite carries the Thread's whole ledger anyway. */
export function applyFloors(
  decisions: ReviewDecision[],
  context: FloorContext,
): FloorResult {
  const open = context.threads.filter((thread) => thread.status === "open");
  const refused: FloorResult["refused"] = [];
  const touched = new Map<string, ReviewDecision>();
  const admitted: ReviewDecision[] = [];

  const touch = (decision: ReviewDecision & { threadId: string }): void => {
    const held = touched.get(decision.threadId);
    if (!held || decision.kind === "conclude") {
      touched.set(decision.threadId, decision);
    }
  };

  for (const decision of decisions) {
    if (decision.kind !== "admit") {
      if (open.some((thread) => thread.id === decision.threadId)) {
        touch(decision);
      } else {
        refused.push({ decision, reason: "thread is not open" });
      }
      continue;
    }

    const twin = open.find((thread) =>
      sameCast(thread.entityIds, decision.entityIds),
    );
    if (twin) {
      touch({ kind: "update", threadId: twin.id });
      continue;
    }
    if (admitted.length > 0) {
      refused.push({ decision, reason: "one admission per review" });
      continue;
    }
    const thin = decision.entityIds.find(
      (id) =>
        paragraphsNaming(context.paragraphs, context.aliases[id] ?? []) <
        ADMIT_MIN_PARAGRAPHS,
    );
    if (thin !== undefined) {
      refused.push({
        decision,
        reason: `cast member ${thin} is named in fewer than ${ADMIT_MIN_PARAGRAPHS} paragraphs`,
      });
      continue;
    }
    if (atThreadCap(context.threads, context.threadCap)) {
      refused.push({ decision, reason: "thread limit reached" });
      continue;
    }
    admitted.push(decision);
  }

  return { accepted: [...touched.values(), ...admitted], refused };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/core/engine/review-strategy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/core/utils/prompts.ts src/core/engine/review-strategy.ts tests/core/engine/review-strategy.test.ts
git commit -m "feat(engine): the review call, its window, and the floors under it"
```

---

### Task 6: Intents and drain arms for Threads

**Files:**

- Modify: `src/core/engine/loop-machine.ts` (Intent)
- Modify: `src/core/engine/intents.ts`
- Modify: `src/core/engine/revise-strategy.ts:49-125`
- Modify: `src/core/utils/prompts.ts` (`ENGINE_REVISE_SYSTEM`)
- Modify: `src/core/engine/execute.ts`
- Modify: `src/core/store/effects/engine-loop.ts` (`KNOWN_KINDS`, `readQueue`)
- Test: `tests/core/engine/intents.test.ts`, `tests/core/engine/revise-strategy.test.ts`, `tests/core/engine/execute.test.ts`

**Interfaces:**

- Consumes: Task 2's `threadCreated`, `threadLedgerUpdated`, `threadStatusSet`, `syncThreadEntry`, `atThreadCap`; Task 4's `createThreadWriteFactory`, `threadWriteParams`, `parseThreadWrite`, `lintState`, `THREAD_WRITE_MAX_TOKENS`.
- Produces:

```ts
export type Intent =
  | { kind: "revise"; entityId: string; prose: string; established?: string }
  | { kind: "condense"; entryId: string }
  | { kind: "threadWrite"; threadId: string; prose: string }
  | { kind: "admit"; title: string; entityIds: string[]; prose: string }
  | { kind: "conclude"; threadId: string; prose: string };
// ReviseInput gains: established?: string
// DrainDeps unchanged from Task 1: { dispatch, getState, genX, log }
```

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/engine/intents.test.ts`:

```ts
describe("Thread intents", () => {
  it("key a write by its Thread, an admission by its cast, a conclusion by its Thread", () => {
    expect(intentKey({ kind: "threadWrite", threadId: "t1", prose: "p" })).toBe(
      "thread:t1",
    );
    expect(intentKey({ kind: "conclude", threadId: "t1", prose: "p" })).toBe(
      "conclude:t1",
    );
    expect(
      intentKey({
        kind: "admit",
        title: "X",
        entityIds: ["b", "a"],
        prose: "p",
      }),
    ).toBe("admit:a,b");
  });

  it("lets a revise that carries a settled fact replace a queued one that does not", () => {
    const plain = { kind: "revise" as const, entityId: "e1", prose: "old" };
    const settled = {
      kind: "revise" as const,
      entityId: "e1",
      prose: "new",
      established: "The debt is paid.",
    };
    expect(dedupe([plain], [settled])).toEqual([settled]);
    expect(dedupe([settled], [plain])).toEqual([settled]);
  });
});
```

Add to `tests/core/engine/revise-strategy.test.ts` (reuse the file's existing entry/prefill fixtures; shown here as `entry` and `prefill`):

```ts
describe("a concluding revise", () => {
  it("puts the settled fact between the prose and the entry", async () => {
    const { messages, contextPinning } = await createReviseFactory({
      entry,
      prefill,
      newText: "Pell signed the hives over.",
      established: "The Shared Apiary\nPell has sold the east hives.",
    })();
    const blocks = messages.map((m) => m.content ?? "");
    expect(blocks[1]).toMatch(/^=== NEW PROSE ===/);
    expect(blocks[2]).toBe(
      "=== NOW SETTLED ===\nThe Shared Apiary\nPell has sold the east hives.",
    );
    expect(blocks[3]).toMatch(/^=== CURRENT ENTRY ===/);
    expect(contextPinning).toEqual({ head: 1, tail: 3 });
  });

  it("adds no block when nothing is settled", async () => {
    const { messages } = await createReviseFactory({
      entry,
      prefill,
      newText: "x",
    })();
    expect(
      messages.some((m) => (m.content ?? "").includes("NOW SETTLED")),
    ).toBe(false);
  });
});
```

Add to `tests/core/engine/execute.test.ts`. The file's `harness(threads, entities)` registers the thread effects; use its `says`, `settle`, `lorebook` and `logged` helpers, with the Task 2 `thread()` fixture:

```ts
const WRITE =
  "MOVED: Pell signed the hives over.\nLATENT: Ines does not know the price.\nSTATE: Pell has sold the east hives to the Cooperative.";

describe("the threadWrite arm", () => {
  it("writes both halves of the ledger from the model's answer", async () => {
    const h = harness(
      [thread("t1", { entityIds: ["a"] })],
      [entity("a", { name: "Pell" })],
    );
    h.generate.mockImplementation(says(WRITE));

    const { executed } = await drain(
      [{ kind: "threadWrite", threadId: "t1", prose: "p" }],
      h.deps,
    );

    expect(executed).toHaveLength(1);
    expect(h.store.getState().world.threads[0]).toMatchObject({
      state: "Pell has sold the east hives to the Cooperative.",
      latent: "Ines does not know the price.",
    });
  });

  it("retries once when STATE points forward, showing the model its own answer and the repair", async () => {
    const h = harness(
      [thread("t1", { entityIds: ["a"] })],
      [entity("a", { name: "Pell" })],
    );
    h.generate
      .mockImplementationOnce(
        says("LATENT: none\nSTATE: Pell will sell the east hives."),
      )
      .mockImplementationOnce(says(WRITE));

    await drain([{ kind: "threadWrite", threadId: "t1", prose: "p" }], h.deps);

    expect(h.generate).toHaveBeenCalledTimes(2);
    const retry = await (
      h.generate.mock.calls[1][0] as () => Promise<{ messages: Message[] }>
    )();
    expect(retry.messages.at(-1)?.content).toContain('STATE contains "will"');
    expect(h.store.getState().world.threads[0].state).toBe(
      "Pell has sold the east hives to the Cooperative.",
    );
  });

  it("keeps the previous ledger when the retry points forward too", async () => {
    const h = harness(
      [thread("t1", { entityIds: ["a"], state: "Before." })],
      [entity("a", { name: "Pell" })],
    );
    h.generate.mockImplementation(
      says("LATENT: none\nSTATE: Pell must sell soon."),
    );

    const { executed } = await drain(
      [{ kind: "threadWrite", threadId: "t1", prose: "p" }],
      h.deps,
    );

    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(executed).toEqual([]);
    expect(h.store.getState().world.threads[0].state).toBe("Before.");
  });

  it("does not retry when the budget cannot cover a second call", async () => {
    const h = harness(
      [thread("t1", { entityIds: ["a"] })],
      [entity("a", { name: "Pell" })],
    );
    h.generate.mockImplementation(async () => {
      vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(100);
      return {
        choices: [
          {
            text: "STATE: Pell will sell.",
            index: 0,
            token_ids: [],
            finish_reason: "stop",
          },
        ],
      };
    });

    await drain([{ kind: "threadWrite", threadId: "t1", prose: "p" }], h.deps);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it("skips a Thread the writer deleted or concluded while the write was queued", async () => {
    const h = harness([thread("t1", { status: "concluded" })], []);
    const { executed, remaining } = await drain(
      [
        { kind: "threadWrite", threadId: "t1", prose: "p" },
        { kind: "threadWrite", threadId: "gone", prose: "p" },
      ],
      h.deps,
    );
    expect(h.generate).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
    expect(remaining).toEqual([]);
    expect(h.store.getState().world.threads).toHaveLength(1);
  });
});

describe("the admit arm", () => {
  const admit = {
    kind: "admit" as const,
    title: "The Sold Hives",
    entityIds: ["a", "b"],
    prose: "p",
  };
  const cast = () => [
    entity("a", { name: "Pell" }),
    entity("b", { name: "Ines Corbel" }),
  ];

  it("creates the Thread only once the model has written a clean state", async () => {
    const h = harness([], cast());
    h.generate.mockImplementation(says(WRITE));

    await drain([admit], h.deps);

    expect(h.store.getState().world.threads[0]).toMatchObject({
      title: "The Sold Hives",
      entityIds: ["a", "b"],
      state: "Pell has sold the east hives to the Cooperative.",
      latent: "Ines does not know the price.",
      status: "open",
    });
  });

  it("creates nothing when the model's answer is unusable", async () => {
    const h = harness([], cast());
    h.generate.mockImplementation(says("I cannot help with that."));
    await drain([admit], h.deps);
    expect(h.store.getState().world.threads).toEqual([]);
    expect(lorebook.created()).toEqual([]);
  });

  it("creates nothing at the thread limit, without spending a generation", async () => {
    const h = harness([thread("t0")], cast());
    h.store.dispatch(
      engineSettingsChanged({ ...ENGINE_DEFAULTS, threadCap: 1 }),
    );
    await drain([admit], h.deps);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.store.getState().world.threads).toHaveLength(1);
  });

  it("creates nothing when an open Thread already has that cast", async () => {
    const h = harness([thread("t0", { entityIds: ["b", "a"] })], cast());
    await drain([admit], h.deps);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.store.getState().world.threads).toHaveLength(1);
  });

  it("drops cast members the World no longer holds, and admits nothing if none are left", async () => {
    const h = harness([], []);
    await drain([admit], h.deps);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.store.getState().world.threads).toEqual([]);
  });
});

describe("the conclude arm", () => {
  it("concludes the Thread, disables its entry, and queues a settled revise for each cast member with an entry", async () => {
    lorebook.seed({
      id: "la",
      displayName: "Pell",
      text: "Name: Pell\nKeeps bees.",
      keys: ["pell"],
    } as LorebookEntry);
    // The Thread arrives through `persistedDataLoaded`, which fires no
    // `threadCreated`, so its entry is seeded rather than minted by the effect.
    const entryId = "lt";
    lorebook.seed({
      id: entryId,
      displayName: "t1",
      text: "Pell has sold the hives.",
      keys: [],
      enabled: true,
    } as LorebookEntry);
    const h = harness(
      [
        thread("t1", {
          entityIds: ["a", "b"],
          state: "Pell has sold the hives.",
          latent: "For half their worth.",
          lorebookEntryId: entryId,
        }),
      ],
      [
        entity("a", { name: "Pell", lorebookEntryId: "la" }),
        entity("b", { name: "Ines Corbel" }),
      ],
    );
    h.generate.mockImplementation(
      says("Sold the east hives for half their worth."),
    );

    const { executed } = await drain(
      [{ kind: "conclude", threadId: "t1", prose: "p" }],
      h.deps,
    );

    expect(h.store.getState().world.threads[0].status).toBe("concluded");
    expect(lorebook.read(entryId)?.enabled).toBe(false);
    expect(executed.map((i) => i.kind)).toEqual(["conclude", "revise"]);
    const prompt = await (
      h.generate.mock.calls[0][0] as () => Promise<{ messages: Message[] }>
    )();
    expect(prompt.messages.map((m) => m.content).join("\n")).toContain(
      "=== NOW SETTLED ===\nt1\nPell has sold the hives.\nFor half their worth.",
    );
  });

  it("defers the second cast member's rewrite to a later pass", async () => {
    lorebook.seed({
      id: "la",
      displayName: "Pell",
      text: "x",
      keys: [],
    } as LorebookEntry);
    lorebook.seed({
      id: "lb",
      displayName: "Ines Corbel",
      text: "y",
      keys: [],
    } as LorebookEntry);
    const h = harness(
      [thread("t1", { entityIds: ["a", "b"] })],
      [
        entity("a", { name: "Pell", lorebookEntryId: "la" }),
        entity("b", { name: "Ines Corbel", lorebookEntryId: "lb" }),
      ],
    );
    h.generate.mockImplementation(says("Rewritten."));

    const { remaining } = await drain(
      [{ kind: "conclude", threadId: "t1", prose: "p" }],
      h.deps,
    );

    expect(remaining).toEqual([
      expect.objectContaining({
        kind: "revise",
        entityId: "b",
        established: expect.any(String),
      }),
    ]);
  });

  it("skips a Thread that is already concluded or gone", async () => {
    const h = harness([thread("t1", { status: "concluded" })], []);
    const { executed } = await drain(
      [{ kind: "conclude", threadId: "t1", prose: "p" }],
      h.deps,
    );
    expect(executed).toEqual([]);
  });
});
```

Add the imports the new tests need (`engineSettingsChanged`, `ENGINE_DEFAULTS` are already imported in this file).

Run: `npx vitest run tests/core/engine/intents.test.ts tests/core/engine/revise-strategy.test.ts tests/core/engine/execute.test.ts`
Expected: FAIL.

- [ ] **Step 2: The intent union and its keys**

`src/core/engine/loop-machine.ts`:

```ts
/** The queue's unit of work.
 *
 *  Every kind but `condense` carries the prose that raised it. An intent the
 *  budget defers runs on a later pass, whose prose is different and whose
 *  watermark has moved past the sentences that motivated it; carrying the prose
 *  makes the payload self-contained, so deferring changes nothing about what it
 *  will do. `condense` is a function of an entry's length alone.
 *
 *  `established` on a `revise` is a Thread's concluded ledger: the settled fact
 *  the entity's entry must now carry. It is not part of `intentKey` — the same
 *  entity is the same rewrite — but `dedupe` lets a revise that has one replace
 *  a queued revise that does not, or the settled fact would be lost. */
export type Intent =
  | { kind: "revise"; entityId: string; prose: string; established?: string }
  | { kind: "condense"; entryId: string }
  | { kind: "threadWrite"; threadId: string; prose: string }
  | { kind: "admit"; title: string; entityIds: string[]; prose: string }
  | { kind: "conclude"; threadId: string; prose: string };
```

`src/core/engine/intents.ts`:

```ts
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
```

- [ ] **Step 3: The `established` block in revise**

`src/core/engine/revise-strategy.ts`: add to `ReviseInput`:

```ts
  /** A concluded Thread's ledger: a fact about this subject that is now
   *  settled. Present only on the rewrites a `conclude` queues. */
  established?: string;
```

In `createReviseFactory`, destructure `established` and build the messages as:

```ts
const messages: Message[] = [
  { role: "system", content: ENGINE_REVISE_SYSTEM },
  { role: "assistant", content: `=== NEW PROSE ===\n${prose}` },
];
if (established?.trim()) {
  messages.push({
    role: "assistant",
    content: `=== NOW SETTLED ===\n${established.trim()}`,
  });
}
messages.push(
  {
    role: "assistant",
    content: `=== CURRENT ENTRY ===\n${text || "(this entry is empty)"}`,
  },
  { role: "user", content: ENGINE_REVISE_INSTRUCTION },
  { role: "assistant", content: prefill },
);
```

Keep the existing comments on the prose and entry blocks. `contextPinning` stays `{ head: 1, tail: 3 }`: the settled block sits in the trimmable middle with the prose, and the entry stays pinned.

In `src/core/utils/prompts.ts`, `ENGINE_REVISE_SYSTEM` under RULES: replace the line beginning "- Only the new prose may add facts." with:

```
- Only the new prose, and a NOW SETTLED block when one is given, may add facts. Do not infer, extrapolate, foreshadow, or fill a gap with something plausible. If neither establishes it, it does not go in.
- When a NOW SETTLED block is given, what it states is established. It may enter the entry, as the condition it left behind.
```

- [ ] **Step 4: The drain's new arms**

`src/core/engine/execute.ts`. Add imports:

```ts
import { dedupe, intentKey } from "./intents";
import {
  createThreadWriteFactory,
  lintState,
  parseThreadWrite,
  threadWriteParams,
  THREAD_WRITE_MAX_TOKENS,
  type ThreadRecord,
  type ThreadWriteInput,
} from "./thread-write-strategy";
import { syncThreadEntry } from "./thread-bind";
import { atThreadCap } from "./thread-cap";
import {
  threadCreated,
  threadLedgerUpdated,
  threadStatusSet,
} from "../store/slices/world";
```

`INTENT_MAX_TOKENS`:

```ts
export const INTENT_MAX_TOKENS: Record<Intent["kind"], number> = {
  revise: REVISE_MAX_TOKENS,
  condense: CONDENSE_MAX_TOKENS,
  threadWrite: THREAD_WRITE_MAX_TOKENS,
  admit: THREAD_WRITE_MAX_TOKENS,
  // Free: a status flip and a disabled entry. The rewrites it queues are
  // priced as the `revise` intents they are.
  conclude: 0,
};
```

Change `revise`'s signature to `revise(entityId: string, prose: string, established: string | undefined, deps: DrainDeps)` and pass `established` into `createReviseFactory({ entry: live, prefill, newText: prose, established })`.

Add, above `execute`:

```ts
/** The cast as the Thread write prompt is shown it. Members the World no
 *  longer holds are left out. */
function castOf(
  deps: DrainDeps,
  entityIds: readonly string[],
): ThreadWriteInput["cast"] {
  const { entitiesById } = deps.getState().world;
  return entityIds
    .map((id) => entitiesById[id])
    .filter((entity) => entity !== undefined)
    .map((entity) => ({ name: entity.name, summary: entity.summary }));
}

/** One Thread write, with the lint and its single retry.
 *
 *  The retry is the same conversation with the model's own answer and the
 *  rejection appended, so the generation whose output was refused is the one
 *  that sees why. It runs only if the bucket still covers it — the drain
 *  priced this intent at ONE call, and a retry that overdrew would be taken
 *  out of the writer's next generation.
 *
 *  Null declines: nothing usable came back, or STATE pointed forward twice.
 *  The caller leaves the World exactly as it was. */
async function writeThread(
  input: ThreadWriteInput,
  label: string,
  deps: DrainDeps,
): Promise<ThreadRecord | null> {
  const ask = async (rejection?: { reply: string; phrase: string }) => {
    const response = await deps.genX.generate(
      createThreadWriteFactory(input, rejection),
      {
        ...(await threadWriteParams()),
        maxRetries: 0,
        // §3.5 of the Engine design: a background loop must not demand a
        // Continue click, and GenX's parked status is instance-wide.
        fastRejection: true,
        taskId: `engine-thread-${api.v1.uuid()}`,
      },
      undefined,
      "background",
    );
    const choice = response.choices?.[0];
    const reply = choice?.text ?? "";
    return { reply, record: parseThreadWrite(reply, choice?.finish_reason) };
  };

  const first = await ask();
  if (!first.record) {
    await deps.log(`[engine] ${label}: nothing usable in the response`);
    return null;
  }
  const phrase = lintState(first.record.state);
  if (!phrase) return first.record;

  await deps.log(
    `[engine] ${label}: STATE pointed forward ("${phrase}") — asking again`,
  );
  if (!affords(THREAD_WRITE_MAX_TOKENS)) {
    await deps.log(`[engine] ${label}: no budget for the retry, declined`);
    return null;
  }

  const second = await ask({ reply: first.reply, phrase });
  const again = second.record ? lintState(second.record.state) : "";
  if (!second.record || again) {
    await deps.log(
      `[engine] ${label}: declined after the retry${again ? ` ("${again}")` : ""}`,
    );
    return null;
  }
  return second.record;
}

/** Rewrite an open Thread's ledger from the prose a review read.
 *
 *  Skipped when the Thread is gone or no longer open: the writer deleted or
 *  concluded it while this was queued, and writing would resurrect it. The
 *  lorebook entry follows through `thread-bind.ts`'s effect on
 *  `threadLedgerUpdated`. */
async function threadWrite(
  threadId: string,
  prose: string,
  deps: DrainDeps,
): Promise<IntentResult> {
  const thread = deps.getState().world.threads.find((t) => t.id === threadId);
  if (!thread || thread.status !== "open") return "skipped";

  const record = await writeThread(
    {
      title: thread.title,
      cast: castOf(deps, thread.entityIds),
      current: { state: thread.state, latent: thread.latent },
      prose,
    },
    `thread "${thread.title}"`,
    deps,
  );
  if (!record) return "skipped";

  deps.dispatch(
    threadLedgerUpdated({
      threadId,
      state: record.state,
      latent: record.latent,
    }),
  );
  await deps.log(`[engine] thread "${thread.title}" updated: ${record.moved}`);
  return "executed";
}

/** Admit a new Thread.
 *
 *  The floors already passed when the review ran; the two that the World can
 *  have changed since are checked again here, before anything is spent. The
 *  Thread is created only once the model has returned a clean `state`, so a
 *  declined admission leaves no Thread and no lorebook entry. The entry itself
 *  is minted by `thread-bind.ts`'s effect on `threadCreated`. */
async function admit(
  title: string,
  entityIds: string[],
  prose: string,
  deps: DrainDeps,
): Promise<IntentResult> {
  const state = deps.getState();
  const cast = entityIds.filter((id) => state.world.entitiesById[id]);
  if (cast.length === 0) return "skipped";

  if (atThreadCap(state.world.threads, state.engine.settings.threadCap)) {
    await deps.log(`[engine] admit "${title}": thread limit reached, refused`);
    return "skipped";
  }
  const twin = state.world.threads.find(
    (t) =>
      t.status === "open" &&
      t.entityIds.length === cast.length &&
      cast.every((id) => t.entityIds.includes(id)),
  );
  if (twin) {
    await deps.log(
      `[engine] admit "${title}": "${twin.title}" already has this cast, refused`,
    );
    return "skipped";
  }

  const record = await writeThread(
    { title, cast: castOf(deps, cast), current: null, prose },
    `admit "${title}"`,
    deps,
  );
  if (!record) return "skipped";

  deps.dispatch(
    threadCreated({
      thread: {
        id: api.v1.uuid(),
        title: title.trim(),
        state: record.state,
        latent: record.latent,
        entityIds: cast,
      },
    }),
  );
  await deps.log(`[engine] admitted thread "${title}"`);
  return "executed";
}

/** Conclude a Thread: its state has become a permanent fact.
 *
 *  Free. The status flips, the entry is disabled, and one `revise` is spawned
 *  for each cast member that has a lorebook entry, carrying the Thread's whole
 *  ledger as `established`. That is how the settled arc reaches the
 *  characters' own entries — and it is the one route by which `latent` is ever
 *  written toward the lorebook, after the thing it held back has happened.
 *
 *  The entry is synced here as well as by the effect: the effect is
 *  fire-and-forget, and a pass that reports this intent executed should have
 *  the entry off by the time it does. */
async function conclude(
  threadId: string,
  prose: string,
  deps: DrainDeps,
  spawn: (intents: Intent[]) => void,
): Promise<IntentResult> {
  const thread = deps.getState().world.threads.find((t) => t.id === threadId);
  if (!thread || thread.status !== "open") return "skipped";

  deps.dispatch(threadStatusSet({ threadId, status: "concluded" }));
  await syncThreadEntry(deps.getState, threadId);

  const established = [thread.title, thread.state, thread.latent]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
  const { entitiesById } = deps.getState().world;
  spawn(
    thread.entityIds
      .filter((id) => entitiesById[id]?.lorebookEntryId)
      .map((entityId) => ({ kind: "revise", entityId, prose, established })),
  );
  await deps.log(`[engine] thread "${thread.title}" concluded`);
  return "executed";
}
```

Replace `execute`:

```ts
/** The branch. One arm per intent kind, no `default`. `spawn` is how an arm
 *  hands the drain follow-up work without reaching for the queue itself. */
async function execute(
  intent: Intent,
  deps: DrainDeps,
  spawn: (intents: Intent[]) => void,
): Promise<IntentResult> {
  switch (intent.kind) {
    case "revise":
      return revise(intent.entityId, intent.prose, intent.established, deps);
    case "condense":
      return condense(intent.entryId, deps);
    case "threadWrite":
      return threadWrite(intent.threadId, intent.prose, deps);
    case "admit":
      return admit(intent.title, intent.entityIds, intent.prose, deps);
    case "conclude":
      return conclude(intent.threadId, intent.prose, deps, spawn);
  }
}
```

In `drain`, replace `for (const intent of queue) {` with a working list, and pass `spawn`:

```ts
  // A working copy, because an arm may spawn follow-up intents (a conclusion
  // queues its cast's rewrites). They join what is still PENDING, through the
  // queue's own dedupe — never what has already run, or a spawned revise would
  // collide with one this pass just executed and never run.
  let pending = [...queue];

  while (pending.length > 0) {
    const intent = pending.shift() as Intent;
```

and the call becomes:

```ts
      const result = await execute(intent, deps, (spawned) => {
        pending = dedupe(pending, spawned);
      });
      if (result === "executed") {
```

Update the `drain` doc comment's last paragraph: "The queue passed in is never mutated."

In `engine-loop.ts`, update `KNOWN_KINDS` and `readQueue`:

```ts
const KNOWN_KINDS: ReadonlySet<string> = new Set([
  "revise",
  "condense",
  "threadWrite",
  "admit",
  "conclude",
]);

function readQueue(value: unknown): Intent[] {
  if (!Array.isArray(value)) return [];
  return (value as Intent[]).filter(
    (intent) =>
      KNOWN_KINDS.has(intent?.kind) &&
      (intent.kind === "condense" ||
        (typeof intent.prose === "string" && intent.prose.length > 0)),
  );
}
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run tests/core/engine`
Expected: PASS. The file's source scan that asserts every lorebook write goes through the door must still pass; if it lists allowed files, `execute.ts` adds none.

Run: `npm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A src/core tests/core
git commit -m "feat(engine): drain arms that write, admit and conclude Threads"
```

---

### Task 7: The review step in the pass, its setting, and its HUD control

**Files:**

- Modify: `src/core/engine/settings.ts`
- Modify: `src/ui/panels/settings/engine-settings-model.ts:53-74`, `src/ui/panels/settings/EngineSettings.tsx`
- Modify: `src/core/engine/intents.ts` (`EngineRecord`)
- Modify: `src/core/engine/loop-machine.ts` (`assessed`)
- Modify: `src/core/store/slices/engine.ts`
- Modify: `src/core/store/effects/engine-loop.ts`
- Modify: `src/core/store/index.ts:125`
- Modify: `src/ui/hud/hud-model.ts`, `src/ui/hud/Hud.tsx`
- Test: `tests/core/engine/settings.test.ts`, `tests/core/engine/loop-machine.test.ts`, `tests/core/engine/review-pass.test.ts` (create), `tests/ui/hud-model.test.ts`, `tests/ui/hud-source.test.ts`, `tests/ui/engine-settings-model.test.ts`, `tests/ui/engine-settings-source.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 2, 5 and 6.
- Produces:

```ts
// settings.ts
EngineSettings.reviewEvery: number; ENGINE_DEFAULTS.reviewEvery = 25;
export const REVIEW_EVERY_MIN = 5; export const REVIEW_EVERY_MAX = 200;
// intents.ts
export type EngineRecord = { watermark: Watermark | null; reviewWatermark: Watermark | null; queue: Intent[] };
// loop-machine.ts
| { type: "assessed"; backlog: number; candidateIds: string[]; reviewDue?: boolean }
// slices/engine.ts
EngineSliceState.reviewBacklog: number; engineReviewBacklogObserved({ backlog: number })
// engine-loop.ts
export const engineReviewRequested: () => { type: "engine/reviewRequested"; payload: undefined };
export function createEnginePass(deps: EngineLoopDeps): (options?: { forceReview?: boolean }) => Promise<void>;
// hud-model.ts
HudModel.reviewIn: number; HudModel.reviewEnabled: boolean;
```

- [ ] **Step 1: The setting**

Add to `tests/core/engine/settings.test.ts`:

```ts
describe("reviewEvery", () => {
  it("defaults to 25 paragraphs", () => {
    expect(normalizeEngineSettings({}).reviewEvery).toBe(25);
  });
  it("is clamped to 5–200 and rounded", () => {
    expect(normalizeEngineSettings({ reviewEvery: 1 }).reviewEvery).toBe(5);
    expect(normalizeEngineSettings({ reviewEvery: 9000 }).reviewEvery).toBe(
      200,
    );
    expect(normalizeEngineSettings({ reviewEvery: 30.4 }).reviewEvery).toBe(30);
  });
});
```

In `src/core/engine/settings.ts`:

- `EngineSettings` gains:

```ts
/** How many unread paragraphs trigger a review pass — the slow read that
 *  keeps Threads true. About a scene: an arc is not visible in less. */
reviewEvery: number;
```

- `ENGINE_DEFAULTS` gains `reviewEvery: 25,` after `threadCap`.
- Add the bounds:

```ts
/** Below five paragraphs the review is reading at the grain the fast pass
 *  already reads at, where every unsettled detail looks like an arc — the
 *  flood the review pass exists to end. It also could not admit anything: the
 *  admission floor wants a cast named in three separate paragraphs. */
export const REVIEW_EVERY_MIN = 5;

/** A review window holds about thirty paragraphs (`REVIEW_WINDOW_CHARS`), and
 *  what does not fit waits for the next pass. Two hundred is already six or
 *  seven windows of catching up each time the trigger fires; past that the
 *  setting reads as on while Threads go stale for a novella at a time. */
export const REVIEW_EVERY_MAX = 200;
```

- `normalizeEngineSettings` gains, after `threadCap`:

```ts
    reviewEvery: readNumber(
      record.reviewEvery,
      ENGINE_DEFAULTS.reviewEvery,
      REVIEW_EVERY_MIN,
      REVIEW_EVERY_MAX,
      Math.round,
    ),
```

- Rewrite the `threadCap` field comment, and the `THREAD_CAP_MIN`/`THREAD_CAP_MAX` comments, to the new meaning: the number of open Threads past which the Engine admits no more; the writer and the Forge are not bound by it; each open Thread is a lorebook entry in context whenever its cast is on stage.

In `src/ui/panels/settings/engine-settings-model.ts`: add `"reviewEvery"` to `NUMERIC_SETTINGS` after `"threadCap"`, and `reviewEvery: 1,` to `STORED_PER_TYPED`.

In `src/ui/panels/settings/EngineSettings.tsx`: add a draft beside `capDraft` following its exact pattern (`const [reviewDraft, setReviewDraft] = useState(draftFor(settings, "reviewEvery"))` and whatever effect re-seeds the other drafts from the store), import `REVIEW_EVERY_MIN` and `REVIEW_EVERY_MAX`, replace the Thread limit field's `help` and add the new field after it:

```tsx
        <NumberField
          label="Thread limit"
          help={`The Engine admits no new Thread past this many open ones. You and the Forge still can. ${THREAD_CAP_MIN}–${THREAD_CAP_MAX}.`}
          value={capDraft}
          min={THREAD_CAP_MIN}
          max={THREAD_CAP_MAX}
          step="1"
          onInput={setCapDraft}
          onCommit={() => commit("threadCap", capDraft, setCapDraft)}
        />

        <NumberField
          label="Review every (paragraphs)"
          help={`New paragraphs before the Engine reads back over a scene to update its Threads. ${REVIEW_EVERY_MIN}–${REVIEW_EVERY_MAX}.`}
          value={reviewDraft}
          min={REVIEW_EVERY_MIN}
          max={REVIEW_EVERY_MAX}
          step="1"
          onInput={setReviewDraft}
          onCommit={() => commit("reviewEvery", reviewDraft, setReviewDraft)}
        />
```

Run: `npx vitest run tests/core/engine/settings.test.ts tests/ui/engine-settings-model.test.ts tests/ui/engine-settings-source.test.ts`
Expected: PASS. These tests derive the field list from `ENGINE_DEFAULTS`; if one fails naming `reviewEvery`, it is pointing at a place the field still has to be added.

- [ ] **Step 2: The machine and the slice**

Add to `tests/core/engine/loop-machine.test.ts`:

```ts
it("goes on to read when a review is due even with nothing new for triage", () => {
  const assessing = loopReducer(initialLoopState, { type: "passRequested" });
  expect(
    loopReducer(assessing, {
      type: "assessed",
      backlog: 0,
      candidateIds: [],
      reviewDue: true,
    }).phase,
  ).toBe("triaging");
  expect(
    loopReducer(assessing, { type: "assessed", backlog: 0, candidateIds: [] })
      .phase,
  ).toBe("idle");
});
```

`src/core/engine/loop-machine.ts`: the event becomes

```ts
  /** `reviewDue` keeps the pass alive when triage has nothing new but the
   *  review pass does — a manual review, or one an earlier pass could not
   *  afford. */
  | { type: "assessed"; backlog: number; candidateIds: string[]; reviewDue?: boolean }
```

and in the reducer's `assessed` case the early return's condition becomes `if (event.backlog === 0 && !event.reviewDue)`.

`src/core/store/slices/engine.ts`:

```ts
export type EngineSliceState = LoopState & {
  settings: EngineSettings;
  /** Unread paragraphs past the REVIEW watermark, as of the last pass. Beside
   *  the machine rather than in it, like `settings`: the HUD draws how far off
   *  the next review is, and the lifecycle has no use for the number. */
  reviewBacklog: number;
};
```

`initialEngineState` gains `reviewBacklog: 0`. `engineLoopEvent` carries it across: `({ ...loopReducer(state, payload), settings: state.settings, reviewBacklog: state.reviewBacklog })`. Add:

```ts
    /** How much prose the review pass has not read. Touches nothing else. */
    engineReviewBacklogObserved: (state, payload: { backlog: number }) =>
      state.reviewBacklog === payload.backlog
        ? state
        : { ...state, reviewBacklog: payload.backlog },
```

and export it.

- [ ] **Step 3: Write the failing pass tests**

Create `tests/core/engine/review-pass.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStore, type Store } from "nai-store";
import {
  createEnginePass,
  type EngineLoopDeps,
} from "../../../src/core/store/effects/engine-loop";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../../src/core/store/types";
import { initialWorldState } from "../../../src/core/store/slices/world";
import {
  ENGINE_LOOP_KEY,
  type EngineRecord,
} from "../../../src/core/engine/intents";
import {
  ENGINE_DEFAULTS,
  type EngineSettings,
} from "../../../src/core/engine/settings";
import { STORAGE_KEYS } from "../../../src/core/keys";
import {
  REVIEW_SYSTEM,
  TRIAGE_SYSTEM,
  THREAD_WRITE_SYSTEM,
} from "../../../src/core/utils/prompts";
import { registerThreadConditionEffects } from "../../../src/core/engine/thread-bind";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

let story: StoryStorageFake;
let lorebook: LorebookFake;

beforeEach(() => {
  story = installStoryStorageFake();
  lorebook = installLorebookFake();
  vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(10000);
});

function documentOf(...texts: string[]): void {
  const scanned = texts.map((text, index) => ({
    sectionId: 500 + index,
    section: { text, origin: [], formatting: [] } as Section,
    index,
  }));
  api.v1.document.scan = vi.fn(async () => scanned);
}

function settings(over: Partial<EngineSettings>): void {
  story.set(STORAGE_KEYS.ENGINE_SETTINGS, {
    ...ENGINE_DEFAULTS,
    enabled: true,
    ...over,
  });
}

const record = () => story.get(ENGINE_LOOP_KEY) as EngineRecord;

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "draft",
    name,
    summary: "",
  };
}

type Reply = { triage?: string; review?: string; write?: string };

/** One fake model answering by which prompt it was shown. */
function harness(threads: Thread[], reply: Reply) {
  const store: Store<RootState> = createStore<RootState>(rootReducer);
  const entities = [entity("a", "Ines"), entity("c", "The Cooperative")];
  store.dispatch(
    persistedDataLoaded({
      world: {
        ...initialWorldState,
        entityIds: entities.map((e) => e.id),
        entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
        threads,
      },
    }),
  );
  registerThreadConditionEffects(
    store.subscribeEffect,
    store.getState,
    store.dispatch,
  );

  const seen: string[] = [];
  const generate = vi.fn(
    async (factory: () => Promise<{ messages: Message[] }>) => {
      const system = (await factory()).messages[0].content ?? "";
      const which =
        system === TRIAGE_SYSTEM
          ? "triage"
          : system === REVIEW_SYSTEM
            ? "review"
            : system === THREAD_WRITE_SYSTEM
              ? "write"
              : "other";
      seen.push(which);
      const text = which === "other" ? "" : (reply[which as keyof Reply] ?? "");
      return {
        choices: [{ text, index: 0, token_ids: [], finish_reason: "stop" }],
      };
    },
  );
  const deps: EngineLoopDeps = {
    subscribeEffect: store.subscribeEffect,
    dispatch: store.dispatch,
    getState: store.getState,
    genX: {
      generate,
      userInteraction: vi.fn(),
    } as unknown as EngineLoopDeps["genX"],
  };
  return { store, generate, seen, runPass: createEnginePass(deps) };
}

const SCENE = [
  "Ines counted frames.",
  "The Cooperative sent a letter to Ines.",
  "Ines read it twice.",
  "The Cooperative wanted the east hives.",
  "Ines told the Cooperative no.",
];
const ADMIT = "ADMIT The East Hives | Ines, The Cooperative";
const WRITE =
  "MOVED: The Cooperative asked for the hives.\nLATENT: none\nSTATE: Ines keeps the east hives against the Cooperative's claim.";

describe("the review step", () => {
  it("does not run until enough prose is unread", async () => {
    settings({ reviewEvery: 25 });
    documentOf(...SCENE);
    const h = harness([], { review: ADMIT, write: WRITE });

    await h.runPass();

    expect(h.seen).toEqual(["triage"]);
    expect(record().reviewWatermark).toBeNull();
    expect(h.store.getState().engine.reviewBacklog).toBe(5);
  });

  it("runs after triage once the threshold is met, and admits a Thread through the drain", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    const h = harness([], { review: ADMIT, write: WRITE });

    await h.runPass();

    expect(h.seen).toEqual(["triage", "review", "write"]);
    expect(h.store.getState().world.threads[0]).toMatchObject({
      title: "The East Hives",
      entityIds: ["a", "c"],
      state: "Ines keeps the east hives against the Cooperative's claim.",
    });
    expect(record().reviewWatermark).toEqual({
      sectionId: 504,
      offset: SCENE[4].length,
    });
    expect(h.store.getState().engine.reviewBacklog).toBe(0);
  });

  it("runs on demand below the threshold", async () => {
    settings({ reviewEvery: 25 });
    documentOf(...SCENE);
    const h = harness([], { review: "" });

    await h.runPass({ forceReview: true });

    expect(h.seen).toContain("review");
  });

  it("runs with nothing new for triage, when a review is still owed", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    story.set(ENGINE_LOOP_KEY, {
      watermark: { sectionId: 504, offset: SCENE[4].length },
      reviewWatermark: null,
      queue: [],
    });
    const h = harness([], { review: "" });

    await h.runPass();

    expect(h.seen).toEqual(["review"]);
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("leaves the review watermark alone when the budget cannot cover the call", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    const h = harness([], { review: ADMIT });
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(500);

    await h.runPass();

    expect(h.seen).toEqual(["triage"]);
    expect(record().reviewWatermark).toBeNull();
    expect(record().watermark).not.toBeNull();
  });

  it("leaves the review watermark alone when the call collides with the writer, and keeps triage's work", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    const h = harness([], {});
    h.generate.mockImplementation(
      async (factory: () => Promise<{ messages: Message[] }>) => {
        const system = (await factory()).messages[0].content ?? "";
        if (system === REVIEW_SYSTEM)
          throw new Error("A generation is already in progress");
        return {
          choices: [
            { text: "", index: 0, token_ids: [], finish_reason: "stop" },
          ],
        };
      },
    );

    await h.runPass();

    expect(record().reviewWatermark).toBeNull();
    expect(record().watermark).toEqual({
      sectionId: 504,
      offset: SCENE[4].length,
    });
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("re-syncs open Thread entries before it reads, so edited keys are followed", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    lorebook.seed({
      id: "la",
      displayName: "Ines",
      keys: ["ines"],
      text: "",
    } as LorebookEntry);
    const thread: Thread = {
      id: "t1",
      title: "T",
      state: "S.",
      latent: "",
      entityIds: ["a"],
      status: "open",
      lorebookEntryId: "lt",
    };
    lorebook.seed({
      id: "lt",
      displayName: "T",
      text: "S.",
      enabled: true,
      keys: [],
    } as LorebookEntry);
    const h = harness([thread], { review: "" });
    const live = h.store.getState().world.entitiesById.a;
    h.store.dispatch(
      persistedDataLoaded({
        world: {
          ...h.store.getState().world,
          entitiesById: {
            ...h.store.getState().world.entitiesById,
            a: { ...live, lifecycle: "live", lorebookEntryId: "la" },
          },
        },
      }),
    );
    lorebook.seed({
      id: "la",
      displayName: "Ines",
      keys: ["ines", "the beekeeper"],
      text: "",
    } as LorebookEntry);

    await h.runPass();

    expect(JSON.stringify(lorebook.read("lt")?.advancedConditions)).toContain(
      "the beekeeper",
    );
  });

  it("logs nothing to the World when a floor refuses the admission", async () => {
    settings({ reviewEvery: 5 });
    documentOf(
      "Ines counted frames.",
      "A glass stood on the table.",
      "x",
      "y",
      "z",
    );
    const h = harness([], { review: ADMIT, write: WRITE });

    await h.runPass();

    expect(h.seen).not.toContain("write");
    expect(h.store.getState().world.threads).toEqual([]);
  });
});
```

Run: `npx vitest run tests/core/engine/review-pass.test.ts`
Expected: FAIL: `runPass` takes no options and no review ever runs.

- [ ] **Step 4: The record**

`src/core/engine/intents.ts`:

```ts
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
```

- [ ] **Step 5: The pass**

`src/core/store/effects/engine-loop.ts`.

Imports to add:

```ts
import {
  applyFloors,
  buildReviewManifest,
  createReviewFactory,
  parseReview,
  reviewParams,
  reviewWindow,
  REVIEW_MAX_TOKENS,
  type ReviewDecision,
  type ReviewWindow,
} from "../../engine/review-strategy";
import { entityAliases, syncOpenThreadEntries } from "../../engine/thread-bind";
import type { EngineSettings } from "../../engine/settings";
import { formatFoundationBlock } from "../../utils/context-builder";
import type { MessageFactory } from "nai-gen-x";
import { engineReviewBacklogObserved } from "../slices/engine";
```

`readEngineRecord` returns `reviewWatermark: readWatermark(record.reviewWatermark)` as well.

Add the manual-review action beside `enginePassRequested`:

```ts
/** The HUD's review control: run a pass now and review whatever is unread,
 *  whether or not the threshold has been reached. */
const ENGINE_REVIEW_REQUESTED = "engine/reviewRequested";
export const engineReviewRequested = () => ({
  type: ENGINE_REVIEW_REQUESTED as typeof ENGINE_REVIEW_REQUESTED,
  payload: undefined,
});
engineReviewRequested.type = ENGINE_REVIEW_REQUESTED;
```

Generalise `generateTriage` into one bounded-backoff helper and use it for both calls. Rename it and change its signature; the body's retry loop is unchanged:

```ts
async function generateWithBackoff(
  genX: GenX,
  factory: MessageFactory,
  baseParams: GenerationParams,
  label: string,
  log: EngineLog,
): Promise<string> {
  const params = { ...baseParams, maxRetries: 0, fastRejection: true };

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await genX.generate(
        factory,
        { ...params, taskId: `engine-${label}-${api.v1.uuid()}` },
        undefined,
        "background",
      );
      return response.choices?.[0]?.text ?? "";
    } catch (error) {
      const wait = isConcurrencyRefusal(error) ? backoffMs(attempt) : null;
      if (wait === null) throw error;
      await log(
        `[engine] ${label} refused, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${wait}ms`,
      );
      await api.v1.timers.sleep(wait);
    }
  }
}
```

Keep its existing doc comment and the two inline comments, with "triage" generalised to "the call". The triage call site becomes:

```ts
        await generateWithBackoff(
          genX,
          createTriageFactory({ manifest, assessment }),
          await triageParams(),
          "triage",
          log,
        ),
```

Add the review step:

```ts
/** A review decision as the intent the drain runs. Each carries the window the
 *  review read, for the reason `revise` carries its prose. */
function toIntent(decision: ReviewDecision, prose: string): Intent {
  switch (decision.kind) {
    case "update":
      return { kind: "threadWrite", threadId: decision.threadId, prose };
    case "conclude":
      return { kind: "conclude", threadId: decision.threadId, prose };
    case "admit":
      return {
        kind: "admit",
        title: decision.title,
        entityIds: decision.entityIds,
        prose,
      };
  }
}

/** The review step: one generation over a scene's worth of unread prose, read
 *  into intents. Returns null when the review did not happen, so the caller
 *  leaves the review watermark where it was and the same prose is offered
 *  again.
 *
 *  **It never fails the pass.** By the time this runs triage has answered, and
 *  an exception here would throw that answer away with the watermark unsaved.
 *  A short bucket, a collision with the writer and a budget hold are all
 *  routine; each skips the review and lets the pass finish. Anything else is a
 *  real fault and is rethrown for the pass to classify.
 *
 *  Open Thread entries are re-synced first: a member's lorebook keys are edited
 *  outside the store, and this bounds how long a condition can lag them. */
async function runReview(
  deps: EngineLoopDeps,
  window: ReviewWindow,
  settings: EngineSettings,
  log: EngineLog,
): Promise<Intent[] | null> {
  const { genX, getState } = deps;

  // The call itself, plus the reserve every Engine spend leaves for the next
  // triage.
  if (
    api.v1.script.getAllowedOutput() <
    REVIEW_MAX_TOKENS + TRIAGE_MAX_TOKENS
  ) {
    await log("[engine] review due, budget short — left for the next pass");
    return null;
  }

  await syncOpenThreadEntries(getState);

  const state = getState();
  const aliases = await entityAliases(state, state.world.entityIds);
  const label = (entity: WorldEntity): string =>
    FIELD_CONFIGS.find((c) => c.id === entity.categoryId)?.label ?? "";
  const manifest = buildReviewManifest({
    foundation: formatFoundationBlock(state),
    entities: Object.values(state.world.entitiesById).map((entity) => ({
      id: entity.id,
      name: entity.name,
      category: label(entity),
      summary: entity.summary,
    })),
    threads: state.world.threads,
    aliases,
    paragraphs: window.paragraphs,
  });

  let text: string;
  try {
    text = await generateWithBackoff(
      genX,
      createReviewFactory(manifest, window.paragraphs),
      await reviewParams(),
      "review",
      log,
    );
  } catch (error) {
    if (!isConcurrencyRefusal(error) && !isBudgetHold(error)) throw error;
    await log("[engine] review could not run — left for the next pass");
    return null;
  }

  const { accepted, refused } = applyFloors(parseReview(text, manifest), {
    threads: state.world.threads,
    paragraphs: window.paragraphs,
    aliases,
    threadCap: settings.threadCap,
  });
  for (const { decision, reason } of refused) {
    await log(
      `[engine] review: refused ${decision.kind}${
        decision.kind === "admit" ? ` "${decision.title}"` : ""
      } — ${reason}`,
    );
  }

  const prose = window.paragraphs.join("\n\n");
  return accepted.map((decision) => toIntent(decision, prose));
}
```

Rewrite `runPass` from its signature through the first `saveEngineRecord`. The settings read, the `enabled` check, the long budget comment, the drain call and everything after it are unchanged except where shown:

```ts
  return async function runPass(
    options: { forceReview?: boolean } = {},
  ): Promise<void> {
    if (inFlight) return;
    if (!canStartPass(getState().engine)) return;
    inFlight = true;

    try {
      const settings = await readEngineSettings();
      dispatch(engineSettingsChanged(settings));
      if (!settings.enabled) return;
      const { minProse } = settings;
      const [{ watermark, reviewWatermark, queue }, sections] =
        await Promise.all([readEngineRecord(), api.v1.document.scan()]);

      const sectionIds = sections.map((s) => s.sectionId);
      const textBySection = new Map(
        sections.map((s) => [s.sectionId, s.section.text]),
      );
      const assessment = assess({
        sectionIds,
        watermark,
        textBySection,
        entities: Object.values(getState().world.entitiesById),
      });

      // The review pass's own reading of the same scan. It trails the fast
      // pass: its watermark moves only when a review completes.
      const window = reviewWindow({
        sectionIds,
        watermark: reviewWatermark,
        textBySection,
      });
      dispatch(engineReviewBacklogObserved({ backlog: window.backlog }));
      const reviewDue =
        window.paragraphs.length > 0 &&
        (options.forceReview === true ||
          window.backlog >= settings.reviewEvery);

      const reached = sections[sections.length - 1];

      // Rule 2, unchanged in meaning: a positive backlog under the minimum is
      // reported, not triaged. A due review still runs — it reads at its own
      // threshold, not triage's.
      const belowMinimum =
        assessment.backlog > 0 && assessment.backlog < minProse;
      if (belowMinimum) {
        dispatch(engineBacklogObserved({ backlog: assessment.backlog }));
        await log(
          `[engine] ${assessment.backlog} new paragraph(s), below the minimum of ${minProse} — not triaging`,
        );
        if (!reviewDue) return;
      }
      const triageNow = assessment.backlog > 0 && !belowMinimum;

      dispatch(engineLoopEvent({ type: "passRequested" }));
      dispatch(
        engineLoopEvent({
          type: "assessed",
          backlog: triageNow ? assessment.backlog : 0,
          candidateIds: assessment.candidateIds,
          reviewDue,
        }),
      );
      if (!triageNow && !reviewDue) return;

      let intents: Intent[] = [];
      let advanced = watermark;
      if (triageNow) {
        // (keep the existing long comment about the output-only check here)
        if (api.v1.script.getAllowedOutput() < TRIAGE_MAX_TOKENS) {
          dispatch(engineLoopEvent({ type: "budgetExhausted" }));
          await log("[engine] holding — budget below the triage reserve");
          return;
        }

        const manifest = buildManifest(getState(), assessment.candidateIds);
        intents = parseTriage(
          await generateWithBackoff(
            genX,
            createTriageFactory({ manifest, assessment }),
            await triageParams(),
            "triage",
            log,
          ),
          manifest,
          assessment.newText,
        );
        // Rule 1: triage got its answer, so the prose behind it has been read.
        advanced = {
          sectionId: reached.sectionId,
          offset: reached.section.text.length,
        };
      }

      // The slow read, after the fast one. It moves its own watermark and only
      // when it actually ran.
      let reviewed = reviewWatermark;
      let reviewIntents: Intent[] = [];
      if (reviewDue) {
        const outcome = await runReview(deps, window, settings, log);
        if (outcome) {
          reviewIntents = outcome;
          reviewed = window.reached;
          dispatch(
            engineReviewBacklogObserved({
              backlog: window.backlog - window.paragraphs.length,
            }),
          );
        }
      }

      const condense = await nextCondense(getState(), settings.condenseAtChars);

      // Triage's revises first, then the review's Thread work, then the
      // condense: the drain is FIFO among costly intents, and an entity record
      // the story has just made wrong outranks tidying.
      const enqueued = dedupe(queue, [
        ...intents,
        ...reviewIntents,
        ...condense,
      ]);
      dispatch(engineLoopEvent({ type: "triaged", intents: enqueued }));

      await saveEngineRecord({
        watermark: advanced,
        reviewWatermark: reviewed,
        queue: enqueued,
      });

      if (enqueued.length === 0) return;
```

The second `saveEngineRecord` after the drain becomes `{ watermark: advanced, reviewWatermark: reviewed, queue: remaining }`. Keep the existing explanatory comments around the drain. Update the header comment's rule 4 to say the record holds both watermarks and the queue.

In the "below minimum" branch the machine has not started, so returning there is correct; when `reviewDue` is true the code falls through to `passRequested`.

`createEnginePass`'s return type becomes `(options?: { forceReview?: boolean }) => Promise<void>`. In `registerEngineLoopEffects`, add beside the ⚡ subscription:

```ts
// The review control. Same runner, same guards; it only asks the pass to
// review whatever is unread without waiting for the threshold.
deps.subscribeEffect(matchesAction(engineReviewRequested), async () => {
  await runPass({ forceReview: true });
});
```

`src/core/store/index.ts:125`: `export { enginePassRequested, engineReviewRequested } from "./effects/engine-loop";`

Run: `npx vitest run tests/core/engine`
Expected: PASS. In `pass.test.ts`, `seedLoopRecord`'s default gains `reviewWatermark: null`, and any assertion on the saved record's exact shape gains the field. Existing pass tests use documents shorter than 25 paragraphs, so no review runs in them.

- [ ] **Step 6: The HUD**

Add to `tests/ui/hud-model.test.ts` (use the file's existing state builder, shown here as `stateOf`):

```ts
describe("the review reading", () => {
  it("counts down from the setting to zero", () => {
    expect(
      deriveHud(stateOf({ reviewBacklog: 10, reviewEvery: 25 }), {
        allowedOutput: 2048,
      }).reviewIn,
    ).toBe(15);
    expect(
      deriveHud(stateOf({ reviewBacklog: 40, reviewEvery: 25 }), {
        allowedOutput: 2048,
      }).reviewIn,
    ).toBe(0);
  });

  it("offers the review control exactly when the pass control is offered", () => {
    const model = deriveHud(stateOf({ enabled: false }), {
      allowedOutput: 2048,
    });
    expect(model.reviewEnabled).toBe(model.zapEnabled);
  });

  it("repaints when either number moves", () => {
    expect(hudSignature(stateOf({ reviewBacklog: 1 }))).not.toBe(
      hudSignature(stateOf({ reviewBacklog: 2 })),
    );
  });
});
```

If the builder does not accept these overrides, extend it: `reviewBacklog` sets `engine.reviewBacklog`, `reviewEvery` and `enabled` set `engine.settings`.

`src/ui/hud/hud-model.ts`: `HudModel` gains

```ts
/** Paragraphs until the next review pass; 0 means one is due. */
reviewIn: number;
/** Whether the review control should read as available. Presentation only,
 *  like `zapEnabled` — the guard is in the pass effect. */
reviewEnabled: boolean;
```

In `deriveHud`, compute `const zapEnabled = engine.settings.enabled && canStartPass(engine);` once and return `zapEnabled`, `reviewEnabled: zapEnabled`, and `reviewIn: Math.max(0, engine.settings.reviewEvery - engine.reviewBacklog)`. In `hudSignature` add `engine.reviewBacklog` and `engine.settings.reviewEvery` to the joined array. Rewrite the `threads`/`threadsTotal` comments: the slot counts open Threads, each a lorebook entry in context while its cast is on stage; the total includes concluded ones.

`src/ui/hud/Hud.tsx`: read lines 193-266 first. Import `engineReviewRequested` beside `enginePassRequested` and one feather icon the file does not already use (`BookOpen`). Immediately before the ⚡ button, add:

```tsx
<button
  onClick={() => store.dispatch(engineReviewRequested())}
  title={`Review — the Engine reads back over the story to update its Threads in ${model.reviewIn} more paragraph(s); press to review now`}
  style={zapStyle(model.reviewEnabled)}
>
  <BookOpen size={ICON_SIZE} />
  <span style={{ fontSize: "0.75em" }}>{model.reviewIn}</span>
</button>
```

Change the Threads slot's tooltip to: `` `Threads — ${model.threads} open of ${model.threadsTotal}; each open Thread is in context while its cast is on stage` ``. Update the file's header comment where it lists the controls.

In `tests/ui/hud-source.test.ts`:

- "dispatches the pass request and nothing else" becomes "dispatches the pass request and the review request, and nothing else": assert the source contains `store.dispatch(enginePassRequested())` and `store.dispatch(engineReviewRequested())` and that `store.dispatch(` occurs exactly twice.
- "says `open` on the thread slot, and where the rest of the list went": update the expected tooltip text.
- "draws no icon twice" must still pass with `BookOpen` added.
- Add:

```ts
it("gives the review control a tooltip that says what its number means", () => {
  expect(hud).toContain("more paragraph(s); press to review now");
});
```

- [ ] **Step 7: Run everything**

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: builds.

- [ ] **Step 8: Commit**

```bash
npm run format
git add -A src tests
git commit -m "feat(engine): a slow review pass keeps Threads true"
```

---

### Task 8: The privacy scan, the probe, and the release notes

**Files:**

- Create: `tests/core/engine/latent-privacy.test.ts`
- Create: `tools/review-probe.naiscript`
- Create: `tests/tools/review-probe.test.ts`
- Modify: `project.yaml` (version), `CHANGELOG.md`, `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md:296`

- [ ] **Step 1: The privacy scan**

Create `tests/core/engine/latent-privacy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every source file under a directory. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The only files that may touch a Thread's private half. Each has a reason:
 *  the type, the reducer, the record, the two creators, the review prompt (never
 *  the story's context), the Thread write, the drain, and the writer's pane. */
const ALLOWED = [
  "src/core/store/types.ts",
  "src/core/store/slices/world.ts",
  "src/core/store/persistence/story-store.ts",
  "src/core/store/effects/handlers/forge-chat.ts",
  "src/core/utils/crucible-command-parser.ts",
  "src/core/engine/loop-machine.ts",
  "src/core/engine/review-strategy.ts",
  "src/core/engine/thread-write-strategy.ts",
  "src/core/engine/execute.ts",
  "src/ui/panels/world/ThreadEditPane.tsx",
];

describe("a Thread's private notes never reach the story model", () => {
  const offenders = sourcesUnder("src")
    .filter((path) => !ALLOWED.includes(path.split("\\").join("/")))
    .filter((path) => /\blatent\b/.test(readFileSync(path, "utf8")));

  it("is named in no file outside the allowed list", () => {
    expect(offenders).toEqual([]);
  });

  it("is not written by the module that builds a Thread's lorebook entry", () => {
    expect(readFileSync("src/core/engine/thread-bind.ts", "utf8")).not.toMatch(
      /\.latent\b/,
    );
  });

  it("is not read by the story prefix or lorebook generation context", () => {
    for (const path of [
      "src/core/utils/context-builder.ts",
      "src/core/utils/lorebook-strategy.ts",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/\.latent\b/);
    }
  });

  it("has a positive control: the scan finds the word where it is allowed", () => {
    expect(readFileSync("src/core/engine/execute.ts", "utf8")).toMatch(
      /\blatent\b/,
    );
  });
});
```

Run: `npx vitest run tests/core/engine/latent-privacy.test.ts`
Expected: PASS. If the first test names a file, that file mentions `latent` in a comment or in code. A comment in `thread-bind.ts` or `lorebook-strategy.ts` that says "never `latent`" trips it: reword such comments to "never the private notes". If it names real code, that is the leak this test exists to catch — remove it, do not add the file to `ALLOWED`.

- [ ] **Step 2: The probe's drift guard**

Create `tests/tools/review-probe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  REVIEW_INSTRUCTION,
  REVIEW_SYSTEM,
  THREAD_WRITE_INSTRUCTION,
  THREAD_WRITE_SYSTEM,
} from "../../src/core/utils/prompts";

/** The probe is a standalone script and cannot import from `src/`, so it
 *  carries its own copy of the prompts it measures. A probe measuring last
 *  month's prompt is worse than no probe. */
describe("tools/review-probe.naiscript measures the shipped prompts", () => {
  const probe = readFileSync("tools/review-probe.naiscript", "utf8");

  it.each([
    ["REVIEW_SYSTEM", REVIEW_SYSTEM],
    ["REVIEW_INSTRUCTION", REVIEW_INSTRUCTION],
    ["THREAD_WRITE_SYSTEM", THREAD_WRITE_SYSTEM],
    ["THREAD_WRITE_INSTRUCTION", THREAD_WRITE_INSTRUCTION],
  ])("carries %s verbatim", (name, prompt) => {
    expect(probe).toContain(`const ${name} = ${JSON.stringify(prompt)};`);
  });
});
```

Run it and confirm it fails: the file does not exist.

- [ ] **Step 3: Write the probe**

Read `tools/budget-probe.naiscript` in full first; its header block, its `log` helper and its `api.v1.ui.register` block at the bottom are the house pattern for a probe. Create `tools/review-probe.naiscript` with a fresh `id` (run `node -e "console.log(crypto.randomUUID())"`), `name: Review Probe`, `version: 0.1.0`, and the description "How often do the review and Thread write prompts keep their contracts, at twenty runs per fixture?".

Generate the four prompt constants so they match the guard exactly:

```bash
npx tsx -e '
import * as p from "./src/core/utils/prompts";
for (const name of ["REVIEW_SYSTEM","REVIEW_INSTRUCTION","THREAD_WRITE_SYSTEM","THREAD_WRITE_INSTRUCTION"])
  console.log(`const ${name} = ${JSON.stringify((p as any)[name])};`);
'
```

If `tsx` is not installed, write a throwaway vitest test that prints the same four lines and delete it afterwards. Paste the four lines at the top of the script body, then:

```js
const RUNS = 20;
const MODEL = "glm-4-6";

// Fixtures use a watch-repair shop: unlike the prompts' harbour and unlike the
// unit tests' apiary, so no fixture is a copy of an example the prompt carries.
const ENTITIES = [
  "- Odile Marsh [Character]: Owns the shop and does the fine work.",
  "- Bram Tulloch [Character]: Her apprentice of two years.",
].join("\n");

const THREAD_NONE = "=== THREADS ===\n(none yet)";
const THREAD_BENCH =
  "=== THREADS ===\n- The Second Bench [in this prose] | cast: Odile Marsh, Bram Tulloch\n  STATE: Bram Tulloch works the second bench under Odile Marsh and takes the simple repairs.\n  PRIVATE: none";

const INCIDENTAL = [
  "Odile Marsh set a loupe on the bench and wound the regulator.",
  "A glass of water stood on the sill, leaving a ring.",
  "Bram Tulloch swept filings into a tin.",
  "A couple passed the window and looked in, then walked on.",
  "A nail had worked loose above the door; the sign hung a little crooked.",
  "Odile Marsh oiled a mainspring. Bram Tulloch labelled three envelopes.",
].join("\n\n");

const SHIFT = [
  "Odile Marsh found the Hartley chronometer open on Bram Tulloch's bench, its balance staff snapped.",
  "Bram Tulloch said he had only meant to clean it. Odile Marsh said nothing and took the movement to her own bench.",
  "By noon Odile Marsh had moved the fine work to the locked drawer and kept the key on her belt.",
  "Bram Tulloch asked for the Hartley job back. Odile Marsh gave him a box of alarm clocks instead.",
  "When the Hartley's owner came, Odile Marsh told him the delay was hers, and Bram Tulloch heard her say it.",
  "Bram Tulloch worked the alarm clocks until closing and did not ask again.",
].join("\n\n");

const NOTHING_BETWEEN = [
  "Odile Marsh spent the morning on a carriage clock.",
  "Bram Tulloch was out at the supplier's until three.",
  "Odile Marsh ate at the bench. Bram Tulloch came back with the mainsprings and shelved them.",
].join("\n\n");

const PENDING = [
  "Odile Marsh had drafted the letter ending Bram Tulloch's apprenticeship and had not sent it.",
  "Bram Tulloch had an offer from the shop on Kiln Street and had told no one.",
  "Odile Marsh moved the fine work to the locked drawer. Bram Tulloch took the alarm clocks without a word.",
].join("\n\n");

const reviewMessages = (threads, prose) => [
  { role: "system", content: REVIEW_SYSTEM },
  { role: "assistant", content: `=== KNOWN ENTITIES ===\n${ENTITIES}` },
  { role: "assistant", content: threads },
  { role: "assistant", content: `=== PROSE ===\n${prose}` },
  { role: "user", content: REVIEW_INSTRUCTION },
];

const writeMessages = (prose) => [
  { role: "system", content: THREAD_WRITE_SYSTEM },
  {
    role: "assistant",
    content: `=== CAST ===\n${ENTITIES.replace(/ \[Character\]/g, "")}`,
  },
  {
    role: "assistant",
    content:
      "=== THREAD ===\nTitle: The Second Bench\nCast: Odile Marsh, Bram Tulloch\n(new: no record yet)",
  },
  { role: "assistant", content: `=== PROSE ===\n${prose}` },
  { role: "user", content: THREAD_WRITE_INSTRUCTION },
];

const commands = (text, verb) =>
  text
    .split(/\r\n|\r|\n/)
    .filter((line) => new RegExp(`^\\s*${verb}\\b`).test(line));

// Mirrors FORWARD_PHRASES in src/core/engine/thread-write-strategy.ts.
const FORWARD = [
  /\byet\b/i,
  /\bhasn't\b/i,
  /\bhas\s+not\b/i,
  /\bhaven't\b/i,
  /\bhave\s+not\b/i,
  /\bsoon\b/i,
  /\bwill\b/,
  /\babout\s+to\b/i,
  /\buntil\b/i,
  /\bmust\b/i,
  /\bwaiting\b/i,
  /\bsooner\s+or\s+later\b/i,
  /\bone\s+day\b/i,
  /\beventually\b/i,
];
const stateOf = (text) => {
  const line = text
    .split(/\r\n|\r|\n/)
    .find((l) => /^\s*\**\s*STATE\b/.test(l));
  return line ? line.replace(/^[^:]*:\s*/, "") : "";
};

const REVIEW_PARAMS = { model: MODEL, max_tokens: 400, temperature: 0.3 };
const WRITE_PARAMS = {
  model: MODEL,
  max_tokens: 300,
  temperature: 0.4,
  min_p: 0.05,
};

// Each fixture states its contract in one sentence; `holds` is that sentence.
const FIXTURES = [
  {
    name: "Incidental",
    contract: "a window of incidental detail admits nothing",
    messages: reviewMessages(THREAD_NONE, INCIDENTAL),
    params: REVIEW_PARAMS,
    holds: (text) => commands(text, "ADMIT").length === 0,
  },
  {
    name: "Shift",
    contract:
      "a standing that shifts across several paragraphs is admitted once, naming both",
    messages: reviewMessages(THREAD_NONE, SHIFT),
    params: REVIEW_PARAMS,
    holds: (text) => {
      const admits = commands(text, "ADMIT");
      return (
        admits.length === 1 &&
        /Odile Marsh/.test(admits[0]) &&
        /Bram Tulloch/.test(admits[0])
      );
    },
  },
  {
    name: "NothingBetween",
    contract:
      "a cast on stage with nothing passing between them is not updated",
    messages: reviewMessages(THREAD_BENCH, NOTHING_BETWEEN),
    params: REVIEW_PARAMS,
    holds: (text) =>
      commands(text, "UPDATE").length === 0 &&
      commands(text, "CONCLUDE").length === 0,
  },
  {
    name: "Reversed",
    contract: "a Thread whose recorded state the prose reverses is updated",
    messages: reviewMessages(THREAD_BENCH, SHIFT),
    params: REVIEW_PARAMS,
    holds: (text) => commands(text, "UPDATE").length === 1,
  },
  {
    name: "Pending",
    contract:
      "a STATE written from prose dense with pending material points at nothing to come",
    messages: writeMessages(PENDING),
    params: WRITE_PARAMS,
    holds: (text) => {
      const state = stateOf(text);
      return (
        state.length > 0 && !FORWARD.some((pattern) => pattern.test(state))
      );
    },
  },
];

async function runFixture(fixture) {
  let failing = 0;
  let firstFailure = "";
  for (let run = 0; run < RUNS; run++) {
    // One at a time: concurrent script generations are refused.
    const response = await api.v1.generate(fixture.messages, fixture.params);
    const text = response.choices?.[0]?.text ?? "";
    if (!fixture.holds(text)) {
      failing++;
      if (!firstFailure) firstFailure = text;
    }
  }
  log(
    `${fixture.name}: ${failing} failing runs of ${RUNS} — ${fixture.contract}`,
  );
  if (firstFailure) log(`  first failing output:\n${firstFailure}`);
}

async function runAll() {
  report = "";
  log(`Review probe — ${RUNS} runs per fixture on ${MODEL}`);
  for (const fixture of FIXTURES) await runFixture(fixture);
  log("done");
}
```

Then the `report`/`log` helper and the `api.v1.ui.register` block copied from `budget-probe.naiscript`, with the run button calling `runAll`. Add this comment above `RUNS`:

```js
// The whole suite is 100 generations against a 2048-token-per-240s output
// bucket, so it takes a while and will pause for budget. Read every count with
// its denominator: one suite cannot rank two fixtures a run or two apart.
```

Run: `npx vitest run tests/tools/review-probe.test.ts`
Expected: PASS. If the tests directory glob does not collect `tests/tools/`, move the file to `tests/core/engine/review-probe-source.test.ts` and fix its relative import.

- [ ] **Step 4: Version, changelog, CLAUDE.md, spec pointer**

`project.yaml`: `version: 0.16.0`.

`CHANGELOG.md`: add above the `0.15.0` section, dated the day this lands:

```markdown
## [0.16.0] - YYYY-MM-DD

### Changed

- **A Thread is now how things stand, not a to-do.** Threads used to be commitments the Engine opened for anything the prose left unsettled, which filled the World with entries about a glass on a table. A Thread is now the standing state of an arc or relationship between entities your World already knows — an alliance, a rivalry, a debt — kept current as the story moves it. There are few of them and they last.
- **Each Thread has a State and Private notes.** **State** is what is true right now, and it is the only part the story model ever sees. **Private notes** hold what is unspoken, owed or concealed, and never leave Story Engine — because a model that reads "she hasn't told him" writes her telling him. Both are in the Thread's edit pane, labelled with who reads them.
- **A Thread is in context when its cast is on stage.** It no longer arrives when the story has drifted away from it. A Thread between two characters appears when both have been named in the last scene or so; one with a larger cast when any two have. Naming goes by each character's own lorebook keys, so "Oriel" counts for "Oriel Vant". A Thread with no cast has no lorebook entry.
- **The Engine reads at two speeds.** After each generation it still checks whether the new prose has made a character's or place's entry wrong, and that is all the quick pass can do. A slower **review**, every **25 paragraphs** by default (**Engine → Review every**), reads back over the scene with your Foundation in view and decides whether a Thread has moved, concluded, or whether one new Thread has earned a place. The HUD's book icon counts down to the next review; press it to review now.
- **New Threads have to earn it.** The Engine can only admit a Thread about entities already in your World, each named in at least three separate paragraphs of the scene, at most one per review, and none past the **Thread limit**. The limit now binds only the Engine — you and the Forge can always add one — and nothing is displaced to make room.
- **Threads conclude instead of expiring.** When what stands between a cast can no longer change — a death, a tie severed, a secret out — the Thread concludes: its entry is switched off and the settled fact is written into each cast member's own entry. Nothing ages out on a timer. The horizon picker and the Satisfied/Abandoned statuses are gone.
- **The Forge's `[THREAD]` writes both halves**: how things stand, then what is unspoken.

### Removed

- **Threads from 0.15 are dropped when a story is opened**, and their lorebook entries are switched off, not deleted. They were the flood; re-enable any entry you want to keep by hand.
```

`CLAUDE.md`: under **State (`src/core/store/`)**, change the `slices/world.ts` bullet to "`WorldEntity` records, `Thread`s, forge loop flag", and add after the **Entity system** section:

```markdown
**Threads (`src/core/engine/thread-*.ts`, `review-strategy.ts`):**

- A `Thread` is the standing state of an arc or relationship between known entities: `title`, `state`, `latent`, `entityIds`, optional `lorebookEntryId`, `status` (`"open" | "concluded"`).
- **`state` is what the story model sees; `latent` never leaves Story Engine.** `state` is the Thread's lorebook entry text. `latent` holds what is unspoken, owed or concealed — a model shown that something has not happened writes it happening. `tests/core/engine/latent-privacy.test.ts` lists the only files that may name `latent`; a failure there is a leak, not a list to extend.
- **A Thread's entry activates when its cast is on stage** (`thread-condition.ts`): `keys: []`, `forceActivation: false`, one advanced condition over the cast's aliases — each member's own lorebook keys plus its display name. Both members of a pair, any two of a larger cast. No cast, no entry.
- **`syncThreadEntry` is the only thing that writes a Thread's entry**, and `state` is the authority for its text (unlike an entity's entry, where the lorebook outranks the store).
- **Only the review pass admits a Thread.** The per-generation triage can only `REVISE` an entity. The review runs every `reviewEvery` paragraphs, emits `UPDATE` / `ADMIT` / `CONCLUDE`, and `applyFloors` refuses an admission whose cast is not known entities, does not recur across three paragraphs, duplicates a Thread, or exceeds the thread limit. The limit binds the Engine only.
- **Concluding** disables the entry and queues an entity `revise` per cast member carrying the Thread's ledger as `established`.
- The review and Thread write prompts are measured with `tools/review-probe.naiscript` (twenty runs per fixture, in NovelAI), not by unit tests.
```

`docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md`: directly under the `## 4. Threads` heading add:

```markdown
> **Superseded by `2026-10-05-threads-as-standing-state-design.md`.** Threads are no longer commitments with a forgetting detector, a horizon, a cap that displaces and an expiry. This section is kept for the reasoning behind what was built in 0.15.
```

- [ ] **Step 5: Run everything**

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript`.

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A
git commit -m "docs: 0.16.0 — Threads as standing state, and a probe to measure the prompts"
```

- [ ] **Step 7: Hand the probe to the writer**

The prompts are unmeasured. Tell the writer: load `tools/review-probe.naiscript` in NovelAI, press Run, and report each line as "N failing runs of 20". A fixture that fails is fixed by the procedure in `external/Prompt Engineering Principles.md` ("Fixing a failing prompt"), starting from the recorded failing output — not by editing the line where the wrong verdict appeared.
