# Scenario Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Brainstorm and Forge chats with one Scenario chat that builds pressures, stubs and Threads from a seed, keeps a writer's wish private, and never names a destination to a model; replace Foundation's Shape and Intent with a Situation line; page long chats.

**Architecture:** The Scenario chat is a new chat type on the Forge's existing command mechanism (parse a reply's `[COMMAND …]` lines, apply them to draft entities and Threads, show chips). One system prompt serves three turn kinds that code derives from the transcript. The chat transcript stops entering any other generation's prefix. `Thread` gains a writer-only `wish` that no generation strategy reads.

**Tech Stack:** TypeScript (strict), Preact JSX in NovelAI's QuickJS worker, `nai-store`, `nai-gen-x`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-scenario-chat-design.md`

## Global Constraints

- Version stays `0.15.0`. No bump. User-visible changes go into the existing `[0.15.0]` section of `CHANGELOG.md`.
- No migration: stored `brainstorm` / `forge` chats and stored `shape` / `intent` are dropped on load.
- Every generation prompt is a named export in `src/core/utils/prompts.ts`.
- `wish` is read by no generation strategy. Files allowed to name it: `src/core/store/types.ts`, `src/core/store/slices/world.ts`, `src/core/store/persistence/story-store.ts`, `src/core/utils/crucible-command-parser.ts`, `src/core/store/effects/handlers/forge-chat.ts`, `src/ui/panels/world/ThreadEditPane.tsx`, and `src/core/utils/prompts.ts` (the Scenario prompt has to tell the model what the segment is for; the spec's list omitted it).
- Internal names keep the word "forge" where they name the command mechanism (`forgeChat` request type, `forge` slice, `forgeSegments`, `handlers/forge-chat.ts`, `forge-chat-effects.ts`). Only the chat type id and what the writer sees become "Scenario". A rename of the internals is a separate, mechanical change.
- Bind text entry with `onInput`. Never `updateParts`. Never swap a component type at a fixed position: mount every variant and toggle `display`.
- No `any`. `api.v1.uuid()` for ids. `api.v1.log`, never `console.log`.
- Run one test file with `npx vitest run <path>`; the suite with `npm run test`; the type check with `npm run build`. Format with `npm run format` (it refuses if prettier is not the pinned version; then run `npm ci`).
- Each task ends with `npm run test` green. `npm run build` must be green at the end of Tasks 5, 7, 8 and 11 (Tasks 4 and 6 leave UI files that the next task fixes).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A four-segment `THREAD` from the model.** The old grammar had four; the model will write it. Expected: nothing is stored, the chip shows the repair text, and the next turn's context names the rejection. Pinned in Tasks 3 and 4.
2. **A `THREAD` re-emitted for an existing title with empty `latent` or `wish`.** Expected: the stored private notes and wish survive. Pinned in Task 3.
3. **Stories saved before this change.** They hold `brainstorm` and `forge` chats, and drafts that point at them. Expected: the Chat tab opens on a fresh Scenario chat, and those drafts appear in the World instead of vanishing. Pinned in Task 4.
4. **An empty send in a chat with nothing in it.** Expected: no generation and no blank bubble. Pinned in Task 5.
5. **Paging while the list shrinks.** A retry prunes messages, or the writer switches chat, while paged back. Expected: the window clamps to what exists and never shows an empty list for a non-empty chat. Pinned in Task 8.

---

### Task 1: `Thread.wish`

**Files:**

- Modify: `src/core/store/types.ts:145-158`
- Modify: `src/core/store/slices/world.ts:193-203`, `:275-309`
- Modify: `src/core/store/persistence/story-store.ts:89-95`
- Modify: `src/core/engine/execute.ts` (no code change; a test pins its behaviour)
- Test: `tests/core/store/slices/world.test.ts`, `tests/core/story-store.test.ts`, `tests/core/engine/latent-privacy.test.ts`, `tests/core/engine/execute.test.ts`

**Interfaces:**

- Produces: `Thread.wish: string`; `ThreadDraft` with optional `wish`; `threadWishSet(payload: { threadId: string; wish: string })` exported from `slices/world.ts`.

- [ ] **Step 1: Write the failing slice tests**

Append to `tests/core/store/slices/world.test.ts` (use the file's existing imports and its reducer helper; add `threadWishSet` to the import from `src/core/store/slices/world`):

```ts
describe("a Thread's wish", () => {
  const base = { ...initialWorldState };
  const draft = {
    id: "t1",
    title: "Half the House",
    state: "s",
    entityIds: [],
  };

  it("defaults to empty when a creator does not supply one", () => {
    const next = worldSlice.reducer(base, threadCreated({ thread: draft }));
    expect(next.threads[0].wish).toBe("");
  });

  it("is kept when a creator supplies one", () => {
    const next = worldSlice.reducer(
      base,
      threadCreated({ thread: { ...draft, wish: "She floods the cut." } }),
    );
    expect(next.threads[0].wish).toBe("She floods the cut.");
  });

  it("is set by threadWishSet and survives a ledger update", () => {
    let s = worldSlice.reducer(base, threadCreated({ thread: draft }));
    s = worldSlice.reducer(s, threadWishSet({ threadId: "t1", wish: "W" }));
    s = worldSlice.reducer(
      s,
      threadLedgerUpdated({ threadId: "t1", state: "new", latent: "hidden" }),
    );
    expect(s.threads[0]).toMatchObject({
      state: "new",
      latent: "hidden",
      wish: "W",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/core/store/slices/world.test.ts`
Expected: FAIL, `threadWishSet is not a function`.

- [ ] **Step 3: Implement**

In `src/core/store/types.ts`, replace the `Thread` interface and `ThreadDraft`:

```ts
/** The standing state of an arc or relationship between known entities.
 *
 *  Three texts with different readers. `state` is what is true now, and it is
 *  the Thread's lorebook entry text — the story model reads it whenever the
 *  cast is on stage. `latent` is what is true now and unspoken, owed or
 *  concealed, and it never leaves Story Engine: a model shown that something
 *  has not happened writes it happening. `wish` is what the writer wants to
 *  come about. It is not a fact, so it is never folded into anything on
 *  conclusion, and no generation reads it. */
export interface Thread {
  id: string;
  title: string;
  state: string;
  latent: string;
  wish: string;
  entityIds: string[];
  lorebookEntryId?: string;
  status: ThreadStatus;
}

/** A Thread as a callsite hands it to `threadCreated`. `status`, `latent` and
 *  `wish` are the reducer's to default, so no creator has to remember them. */
export type ThreadDraft = Omit<Thread, "status" | "latent" | "wish"> &
  Partial<Pick<Thread, "status" | "latent" | "wish">>;
```

In `src/core/store/slices/world.ts`, add `wish: payload.thread.wish ?? "",` beside the `latent` default in `threadCreated`, add this reducer after `threadLedgerUpdated`, and add `threadWishSet` to the exported actions:

```ts
    /** The writer's wish for this Thread. Its own action because nothing that
     *  rewrites the ledger may touch it, and `thread-bind.ts` does not
     *  subscribe: a wish is never part of the lorebook entry. */
    threadWishSet: (state, payload: { threadId: string; wish: string }) => ({
      ...state,
      threads: state.threads.map((t) =>
        t.id === payload.threadId ? { ...t, wish: payload.wish } : t,
      ),
    }),
```

In `src/core/store/persistence/story-store.ts`, add beside the `latent` line in the `threads.push`:

```ts
      wish: typeof stored.wish === "string" ? stored.wish : "",
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/core/store/slices/world.test.ts`
Expected: PASS.

- [ ] **Step 5: Pin the load default, the conclude rule and the privacy scan**

Append to `tests/core/story-store.test.ts`, using that file's existing helper for loading a stored record (the one its "latent" default test uses), a case asserting a stored Thread with no `wish` loads with `wish: ""` and one with `wish: "W"` loads with `"W"`.

Append to `tests/core/engine/execute.test.ts`, beside the existing conclude test, a case that concludes a Thread whose `wish` is `"ZZ-WISH-SENTINEL-4410"` and asserts no queued `revise` intent's `established` contains that string. Reuse the existing conclude test's fixture; add only the `wish` field and the assertion.

Append to `tests/core/engine/latent-privacy.test.ts`:

```ts
const WISH_ALLOWED = [
  "src/core/store/types.ts",
  "src/core/store/slices/world.ts",
  "src/core/store/persistence/story-store.ts",
  "src/core/utils/crucible-command-parser.ts",
  "src/core/store/effects/handlers/forge-chat.ts",
  "src/ui/panels/world/ThreadEditPane.tsx",
  // The Scenario prompt names the segment so the model can fill it.
  "src/core/utils/prompts.ts",
];

describe("a Thread's wish is read by no generation", () => {
  it("is named in no file outside the allowed list", () => {
    const offenders = sourcesUnder("src")
      .filter((path) => !WISH_ALLOWED.includes(path.split("\\").join("/")))
      .filter((path) => /\bwish\b/i.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("has a positive control: the scan finds the word where it is allowed", () => {
    expect(readFileSync("src/core/store/types.ts", "utf8")).toMatch(/\bwish\b/);
  });
});
```

Run: `npx vitest run tests/core/engine/latent-privacy.test.ts tests/core/story-store.test.ts tests/core/engine/execute.test.ts`
Expected: PASS. If the scan names a file whose only use of "wish" is ordinary English in a comment, reword the comment; do not extend the list.

- [ ] **Step 6: Commit**

```bash
npm run test
git add -A src tests
git commit -m "feat(threads): a Thread carries the writer's wish, private and never folded"
```

---

### Task 2: The Scenario and Situation prompts

**Files:**

- Modify: `src/core/utils/prompts.ts`
- Test: `tests/core/utils/prompts.test.ts`

**Interfaces:**

- Produces: `SCENARIO_PROMPT: string`, `SCENARIO_REGISTERS: Record<RegisterKey, string>`, `buildScenarioPrompt(level: RegisterKey): string`, `SCENARIO_GROW_INSTRUCTION: string`, `FOUNDATION_SITUATION_PROMPT: string`, `XIALONG_STYLE.scenario`, `XIALONG_STYLE.foundationSituation`.

This task only adds. The prompts it replaces are deleted in Tasks 5 and 7, when their last caller goes.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/utils/prompts.test.ts`:

```ts
import {
  SCENARIO_PROMPT,
  SCENARIO_REGISTERS,
  SCENARIO_GROW_INSTRUCTION,
  FOUNDATION_SITUATION_PROMPT,
  buildScenarioPrompt,
  INTENSITY_LEVEL_LABELS,
} from "../../../src/core/utils/prompts";

describe("the Scenario prompt", () => {
  it("has a register text for every intensity and for none", () => {
    for (const level of [...INTENSITY_LEVEL_LABELS, "unset" as const]) {
      expect(SCENARIO_REGISTERS[level].length).toBeGreaterThan(0);
      expect(buildScenarioPrompt(level)).toBe(
        `${SCENARIO_PROMPT}\n\n${SCENARIO_REGISTERS[level]}`,
      );
    }
  });

  it("has no newline inside a sentence", () => {
    for (const text of [SCENARIO_PROMPT, FOUNDATION_SITUATION_PROMPT]) {
      for (const line of text.split("\n")) {
        expect(line).not.toMatch(/[a-z,]$/);
      }
    }
  });

  it("exports the grow instruction", () => {
    expect(SCENARIO_GROW_INSTRUCTION).toContain("critique");
  });
});
```

Run: `npx vitest run tests/core/utils/prompts.test.ts`
Expected: FAIL, the imports do not exist.

- [ ] **Step 2: Add the prompts**

In `src/core/utils/prompts.ts`, after `normalizeRegisterKey`, add:

```ts
export const SCENARIO_PROMPT = `You are the Scenario Engine. A writer gives you a few sentences about a story they want, and you build the conditions it can grow from: pressures, the people and places under them, and how things stand between them. You never write a plot, an arc, a goal or an ending. Another model will continue this story from a blank page, and it acts on whatever it is shown: told that something will happen, it writes it happening at once, or as already done. So everything you record says only what is so when the story opens.

The context block above the conversation gives TURN, the drafts under [POOL], the cast under [LIVE], and [THREADS]. Answer by TURN.

TURN: SKETCH. The writer's message is the seed. Answer in order:
1. Quote the phrase in the seed the writer is most drawn to.
2. What must be true of the world for that to be so? Write one SITUATION per pressure, as many as the REGISTER note says. Each reads "what is happening; what keeps it from settling", and stops there.
3. Who stands where in those pressures? Write a CHARACTER or FACTION for each position, with at least two of them on different sides of one pressure.
4. Where does a pressure become visible? Write a LOCATION for each such place. Write a SYSTEM or TOPIC only where a pressure cannot be stated without one.
5. What stands between particular elements, or bears on one alone? Write a THREAD for each.

TURN: STEER. The writer's last message asks for a change. Make that change with the commands below and no other. If the message asks for nothing to be changed, answer it in prose and write no command.

TURN: GROW. Read [PREVIOUS CRITIQUE]. Write the commands that answer it and no others.

On every turn, for each thing the writer says they want, answer in order:
1. Is it already so when the story opens? YES: record it as fact, in a summary or a THREAD's state. NO: continue.
2. It is something to come. Record what is true now that makes it possible, in a summary, a SITUATION, or a THREAD's state. Then write the thing itself in the wish segment of the THREAD whose cast it concerns, and nowhere else.

COMMANDS, one per line:
[CREATE <TYPE> "<Name>" | summary of one to three sentences]
[REVISE "<Name>" | new summary]
[RENAME "<Old>" → "<New>"]
[DELETE "<Name>"]
[THREAD "<Title>" | "<A>", "<B>" | state | latent | wish]
[CRITIQUE | which element has nothing pressing on it, and which pressure has no one under it]
<TYPE> is CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION or TOPIC.
A THREAD names one to four elements and always has all five segments. state is how things stand now, and it is shown to the story model. latent is what is true now and hidden, owed or unspoken; it is private. wish is what the writer wants to come about; it is private. Leave latent or wish empty between its bars when there is none. A THREAD whose title is already under [THREADS] rewrites that Thread.
Only drafts under [POOL] may be revised, renamed or deleted. Never recreate a name under [TOMBSTONES]. If [REJECTED LAST TURN] is present, write each rejected command again as its repair says.

REPLY SHAPE:
- Two or three sentences of prose first: what you took from the writer's message and, for anything to come, what you recorded in its place.
- Then the commands.
- Then one CRITIQUE.
- Then one question, the one whose answer would change the most.

EXAMPLE. Seed: "A lock-keeper on a dying canal. Her brother already sold his half of the lock house to the barge company. I want her to end up flooding the cut to stop them."
The phrase is "a dying canal": the trade has gone and the company wants the water. Her brother has sold his half before the story opens, so that is recorded as fact. Flooding the cut is to come, so what is recorded is that she alone holds the sluice keys, and the flooding goes in the wish.
[CREATE SITUATION "The Company's Offer" | The barge company is buying the lock houses along the cut to close it and take the water for its mills; every keeper who sells makes the next refusal cost more.]
[CREATE CHARACTER "Hesper Vane" | Keeps Tolland Lock as her mother did. Rope-scarred palms, and a ring of sluice keys on her belt that she counts by touch.]
[CREATE CHARACTER "Corin Vane" | Her brother. Clean boots on a towpath. Carries the company's survey book under his arm.]
[CREATE LOCATION "Tolland Lock House" | Damp plaster and coal smoke; one kitchen and two owners. The sluice wheel stands in the yard where anyone on the towpath can see who turns it.]
[THREAD "Half the House" | "Hesper Vane", "Corin Vane" | Corin Vane has sold his half of Tolland Lock House to the barge company. Hesper Vane holds the only set of sluice keys. | Corin Vane has not told Hesper Vane that the company has already paid him. | Hesper Vane floods the cut to stop the company.]
[CRITIQUE | The Company's Offer has no one who speaks for the company at the lock. Tolland Lock House has no one on the towpath to see the sluice wheel turned.]
Does Corin still sleep at the lock house, or has he moved to company lodgings?`;

export const SCENARIO_REGISTERS: Record<RegisterKey, string> = {
  unset: `REGISTER, not yet set: You do not know how much pressure this world is under. On a SKETCH turn write no command. Ask the one question that settles it: can these people walk away, and is comfort the default or the exception?`,
  Cozy: `REGISTER, Cozy: Two pressures at most, and none is required. A pressure here is friction of preference or circumstance: two people who want the same quiet corner, a habit that no longer fits. Nothing threatens anyone, nobody is malicious, and nothing is lost for good. If the seed has no friction in it, write the SITUATIONs as the routines and attachments that keep this world turning.`,
  Grounded: `REGISTER, Grounded: Two or three pressures at the scale of a life: money, time, obligation, a relationship being worn down. Each is a real obstacle with a way through, and no one is ruined by it.`,
  Gritty: `REGISTER, Gritty: Three pressures with stakes that last. Each sets two things someone values against each other, where walking away is possible and costs something real. Ground each in a person, not a spectacle.`,
  Noir: `REGISTER, Noir: Three pressures that trap. The world is rigged: each pressure has hooks in everyone under it, and leaving means losing what they have built. No position on the board is clean.`,
  Nightmare: `REGISTER, Nightmare: Three or four pressures from a system that is hostile, each pressing from a different direction. Safety is assured for no one, and every shelter is held by something that wants a price.`,
};

export function buildScenarioPrompt(level: RegisterKey): string {
  return `${SCENARIO_PROMPT}\n\n${SCENARIO_REGISTERS[level]}`;
}

/** The user turn an empty send stands for. Without a turn addressed to it the
 *  model has nothing to answer. */
export const SCENARIO_GROW_INSTRUCTION = `Grow the sketch: answer your last critique with commands, then critique again.`;

export const FOUNDATION_SITUATION_PROMPT = `Write the story's Situation: one or two sentences in the present tense, saying what is happening when the story opens and which two things someone values cannot both be kept. Name people and places as the World does. Say nothing of what anyone will choose, what will happen, or how it ends.

"The barge company is buying the lock houses along the Tolland cut to close it; Hesper Vane keeps the last working lock, and her brother has sold his half of the house."
"A ranger three years into a coastal posting keeps every routine of belonging there, and the town still calls her the new one."

Write the sentences on one line. No preamble.`;
```

In `XIALONG_STYLE`, add two keys (the old ones are removed later):

```ts
  scenario: "[ Style: chat, world-builder, collaborative, direct ]",
  foundationSituation: "[ Style: premise, situational, present-tense, direct ]",
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run tests/core/utils/prompts.test.ts`
Expected: PASS.

```bash
git add src/core/utils/prompts.ts tests/core/utils/prompts.test.ts
git commit -m "feat(prompts): the Scenario chat's prompt, registers and the Situation line"
```

---

### Task 3: The five-segment `THREAD` and what the handler does with it

**Files:**

- Modify: `src/core/utils/crucible-command-parser.ts`
- Modify: `src/core/store/effects/handlers/forge-chat.ts`
- Test: `tests/core/utils/crucible-command-parser.test.ts`, `tests/core/store/effects/handlers/forge-chat.test.ts`

**Interfaces:**

- Consumes: `threadWishSet` (Task 1).
- Produces: `ThreadCommand.wish: string`; `THREAD_REPAIR: string` exported from the parser; `executeForgeCommand` exported from the handler with its existing signature `(cmd, chatId, assistantMessageId, getState, dispatch, opts: { reviseOnly: boolean }) => ForgeActionRecord`.

- [ ] **Step 1: Write the failing parser tests**

In `tests/core/utils/crucible-command-parser.test.ts`, delete the cases that assert two-, three- and four-segment `THREAD` forms (the "serializes THREAD with and without a state" case, and the cases under "a THREAD command survives serialize → parse" that use fewer than five segments). Add:

```ts
describe("THREAD has exactly five segments", () => {
  const full =
    '[THREAD "Half the House" | "Hesper Vane", "Corin Vane" | He sold his half. | He was paid already. | She floods the cut.]';

  it("parses state, latent and wish by position", () => {
    expect(parseCommands(full)).toEqual([
      {
        kind: "THREAD",
        title: "Half the House",
        memberNames: ["Hesper Vane", "Corin Vane"],
        state: "He sold his half.",
        latent: "He was paid already.",
        wish: "She floods the cut.",
      },
    ]);
  });

  it("accepts empty latent and wish, and one member", () => {
    const [cmd] = parseCommands(
      '[THREAD "The Keys" | "Hesper Vane" | She holds them. | | ]',
    );
    expect(cmd).toMatchObject({
      memberNames: ["Hesper Vane"],
      state: "She holds them.",
      latent: "",
      wish: "",
    });
  });

  it.each([
    '[THREAD "T" | "A", "B" | state | private]',
    '[THREAD "T" | "A", "B" | state]',
    '[THREAD "T" | "A", "B"]',
  ])("does not parse a shorter form: %s", (line) => {
    expect(parseCommands(line)).toEqual([]);
    expect(walkForgeLines(line)).toEqual([{ kind: "unrecognized", raw: line }]);
  });

  it("round-trips through the serializer with any segment empty", () => {
    for (const [state, latent, wish] of [
      ["s", "l", "w"],
      ["s", "", "w"],
      ["s", "l", ""],
      ["", "", "w"],
      ["s", "", ""],
    ]) {
      const cmd = {
        kind: "THREAD" as const,
        title: "T",
        memberNames: ["A", "B"],
        state,
        latent,
        wish,
      };
      expect(parseCommands(serializeForgeCommand(cmd))).toEqual([cmd]);
    }
  });
});
```

Add `walkForgeLines` to the file's import if it is not there. In the existing `redactThreadPrivateNotes` cases, rewrite each input and expectation to the five-segment form, expecting both private segments emptied: input `… | they share the apiary | ${SENTINEL} | ${SENTINEL}]`, output `[THREAD "The Split Hive" | "Ines", "Pell" | they share the apiary | |]`. (That function is deleted in Task 6; until then it must stay correct.)

Run: `npx vitest run tests/core/utils/crucible-command-parser.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement the grammar**

In `src/core/utils/crucible-command-parser.ts`:

Update the header comment's THREAD line to `[THREAD "<Title>" | "<A>", "<B>" | state | latent | wish]`.

Add `wish` to `ThreadCommand`:

```ts
/** What the writer wants to come about — private, and never a fact. */
wish: string;
```

Add, above `parseCommandAt`:

```ts
/** What a THREAD that did not parse is told. Position is meaning in this
 *  command, so a short one is never guessed at: read as four segments, a wish
 *  would land in `latent` and be written into an entry as fact on conclusion. */
export const THREAD_REPAIR =
  'a THREAD needs all five segments: [THREAD "Title" | "A", "B" | state | latent | wish]; leave latent or wish empty between its bars when there is none';
```

Replace the whole `threadMatch` block (the comment above it, the three-regex chain and the `if (threadMatch) { … }` body) with:

```ts
const threadMatch = line.match(
  /^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\|([^|]*?)\|([^|]*?)\|([^|\]]*?)\]?\s*$/,
);
if (threadMatch) {
  const memberNames: string[] = [];
  const nameRe = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(threadMatch[2])) !== null) {
    memberNames.push(m[1].trim());
  }
  if (memberNames.length > 0) {
    return {
      command: {
        kind: "THREAD",
        title: threadMatch[1].trim(),
        memberNames,
        state: threadMatch[3].trim(),
        latent: threadMatch[4].trim(),
        wish: threadMatch[5].trim(),
      },
      consumed: 0,
    };
  }
}
```

Replace the `THREAD` case of `serializeForgeCommand` with:

```ts
    case "THREAD": {
      const members = cmd.memberNames.map((n) => `"${n}"`).join(", ");
      // Always all five segments: position is meaning, so an empty one keeps
      // its bars.
      const tail = [cmd.state, cmd.latent, cmd.wish]
        .map((s) => (s ? ` ${s} ` : " "))
        .join("|")
        .trimEnd();
      return `[THREAD "${cmd.title}" | ${members} |${tail}]`;
    }
```

In `redactThreadPrivateNotes`, change the guard and the rewrite to cover both private segments:

```ts
if (command?.kind !== "THREAD" || (!command.latent && !command.wish)) {
  return line;
}
return serializeForgeCommand({ ...command, latent: "", wish: "" });
```

Run: `npx vitest run tests/core/utils/crucible-command-parser.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing handler tests**

Append to `tests/core/store/effects/handlers/forge-chat.test.ts`:

```ts
import { executeForgeCommand } from "../../../../../src/core/store/effects/handlers/forge-chat";
import {
  threadCreated,
  threadLedgerUpdated,
  threadWishSet,
} from "../../../../../src/core/store/slices/world";
import { FieldID } from "../../../../../src/config/field-definitions";
import type { RootState } from "../../../../../src/core/store/types";

describe("a THREAD command, applied", () => {
  const entity = (id: string, name: string) => ({
    id,
    name,
    summary: "",
    categoryId: FieldID.DramatisPersonae,
    lifecycle: "draft" as const,
  });
  const stateWith = (threads: unknown[]) =>
    ({
      world: {
        threads,
        entitiesById: {
          h: entity("h", "Hesper Vane"),
          c: entity("c", "Corin Vane"),
        },
        entityIds: ["h", "c"],
      },
      forge: { tombstonesByChatId: {} },
    }) as unknown as RootState;
  const cmd = {
    kind: "THREAD" as const,
    title: "Half the House",
    memberNames: ["Hesper Vane", "Corin Vane"],
    state: "He sold his half.",
    latent: "He was paid already.",
    wish: "She floods the cut.",
  };
  const run = (state: RootState, command: typeof cmd) => {
    const dispatch = vi.fn();
    const record = executeForgeCommand(
      command,
      "chat",
      "msg",
      () => state,
      dispatch,
      {
        reviseOnly: false,
      },
    );
    return { dispatch, record };
  };

  it("creates a Thread carrying its wish", () => {
    const { dispatch, record } = run(stateWith([]), cmd);
    expect(record.status).toBe("applied");
    const created = dispatch.mock.calls[0][0];
    expect(created.type).toBe(threadCreated.type);
    expect(created.payload.thread).toMatchObject({
      title: "Half the House",
      state: "He sold his half.",
      latent: "He was paid already.",
      wish: "She floods the cut.",
      entityIds: ["h", "c"],
    });
  });

  it("creates a Thread with one member", () => {
    const { record } = run(stateWith([]), {
      ...cmd,
      memberNames: ["Hesper Vane"],
    });
    expect(record.status).toBe("applied");
  });

  it("rejects a Thread none of whose members is known", () => {
    const { dispatch, record } = run(stateWith([]), {
      ...cmd,
      memberNames: ["Nobody"],
    });
    expect(record).toMatchObject({
      status: "rejected",
      reason: "no known members",
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  const existing = {
    id: "t1",
    title: "half the house",
    state: "old state",
    latent: "old private",
    wish: "old wish",
    entityIds: ["h", "c"],
    status: "open",
  };

  it("rewrites the open Thread with the same title", () => {
    const { dispatch, record } = run(stateWith([existing]), cmd);
    expect(record.status).toBe("applied");
    expect(dispatch).toHaveBeenCalledWith(
      threadLedgerUpdated({
        threadId: "t1",
        state: "He sold his half.",
        latent: "He was paid already.",
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      threadWishSet({ threadId: "t1", wish: "She floods the cut." }),
    );
  });

  it("keeps the stored private notes and wish when the rewrite leaves them empty", () => {
    const { dispatch } = run(stateWith([existing]), {
      ...cmd,
      latent: "",
      wish: "",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      threadLedgerUpdated({
        threadId: "t1",
        state: "He sold his half.",
        latent: "old private",
      }),
    );
  });

  it("does not rewrite a concluded Thread", () => {
    const { dispatch, record } = run(
      stateWith([{ ...existing, status: "concluded" }]),
      cmd,
    );
    expect(record).toMatchObject({ status: "rejected", reason: "concluded" });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

Add `vi` to the file's vitest import if absent. Run: `npx vitest run tests/core/store/effects/handlers/forge-chat.test.ts`
Expected: FAIL, `executeForgeCommand` is not exported.

- [ ] **Step 4: Implement the handler**

In `src/core/store/effects/handlers/forge-chat.ts`:

Export the function: `export function executeForgeCommand(`.

Add `threadLedgerUpdated` and `threadWishSet` to the import from `../../slices/world`, and `THREAD_REPAIR` to the import from the parser.

Replace the whole `case "THREAD": { … }` with:

```ts
    case "THREAD": {
      const state = getState();
      const existing = state.world.threads.find(
        (t) => t.title.toLowerCase() === cmd.title.toLowerCase(),
      );
      if (existing) {
        if (existing.status === "concluded") {
          return {
            kind: "THREAD",
            status: "rejected",
            name: cmd.title,
            reason: "concluded",
          };
        }
        // A rewrite replaces what it supplies. An empty segment means "no
        // change", never "erase": the model re-emits a Thread to move its
        // state, and must not be able to wipe the private half by omission.
        dispatch(
          threadLedgerUpdated({
            threadId: existing.id,
            state: cmd.state || existing.state,
            latent: cmd.latent || existing.latent,
          }),
        );
        if (cmd.wish) {
          dispatch(threadWishSet({ threadId: existing.id, wish: cmd.wish }));
        }
        return { kind: "THREAD", status: "applied", name: existing.title };
      }
      const memberIds = cmd.memberNames
        .map((name) => findEntityByName(state, name)?.id)
        .filter((id): id is string => !!id);
      if (memberIds.length === 0) {
        return {
          kind: "THREAD",
          status: "rejected",
          name: cmd.title,
          reason: "no known members",
        };
      }
      // No status: `threadCreated` defaults it (world.ts).
      const thread: ThreadDraft = {
        id: api.v1.uuid(),
        title: cmd.title,
        state: cmd.state,
        latent: cmd.latent,
        wish: cmd.wish,
        entityIds: memberIds,
      };
      dispatch(threadCreated({ thread }));
      return { kind: "THREAD", status: "applied", name: cmd.title };
    }
```

In `buildForgeSegments`, give an unparsed `THREAD` its repair. Replace the `action:` object in the `unrecognized` branch with:

```ts
        action: {
          kind: "UNKNOWN",
          status: "unrecognized",
          reason: /^\[\s*THREAD\b/i.test(tok.raw) ? THREAD_REPAIR : tok.raw,
        },
```

- [ ] **Step 5: Run, fix the fallout, commit**

Run: `npm run test`
Expected: the new cases PASS. Existing cases in `forge-chat.test.ts` and `forge-pipeline.test.ts` that feed two-to-four-segment `THREAD` text, or that expect "needs ≥2 members" or "duplicate" for a Thread, now fail: rewrite their inputs to five segments, expect `"no known members"` where no member resolves, and delete the duplicate-title rejection case (a same-title `THREAD` is now a rewrite, pinned above).

```bash
git add -A src tests
git commit -m "feat(scenario): THREAD has five segments, rewrites by title, and takes one member"
```

---

### Task 4: The Scenario chat type, and loading stories that predate it

**Files:**

- Create: `src/core/chat-types/scenario.ts`
- Delete: `src/core/chat-types/brainstorm.ts`, `src/core/chat-types/forge.ts`
- Modify: `src/core/chat-types/index.ts`, `src/core/chat-types/types.ts:82-94`
- Modify: `src/core/store/slices/chat.ts:9-24`
- Modify: `src/core/store/index.ts` (the `PERSISTED_DATA_LOADED` branch of `rootReducer`)
- Modify: `src/core/store/effects/forge-chat-actions.ts`
- Test: create `tests/core/chat-types/scenario.test.ts`; delete `tests/core/chat-types/brainstorm.test.ts`, `forge.test.ts`, `forge-spec-extensions.test.ts`; modify `registry.test.ts`, `header-control-kinds.test.ts`, `tests/core/store/slices/chat.test.ts`, `tests/core/persist-loaded.test.ts`

**Interfaces:**

- Consumes: `buildScenarioPrompt`, `normalizeRegisterKey` (Task 2).
- Produces: `scenarioSpec` (id `"scenario"`); `KNOWN_CHAT_TYPES: readonly string[]`, `makeDefaultScenario(): Chat`, `keepKnownChats(chat: ChatSliceState): ChatSliceState` from `slices/chat.ts`; `forgeChatContinueRequested(payload: { chatId: string })` with `advancePhase` gone and `forgeChatDiscussRequested` deleted.

- [ ] **Step 1: Write the failing tests**

Create `tests/core/chat-types/scenario.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { scenarioSpec } from "../../../src/core/chat-types/scenario";
import { forgeChatContinueRequested } from "../../../src/core/store/effects/forge-chat-actions";
import { buildScenarioPrompt } from "../../../src/core/utils/prompts";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";

const chatWith = (messages: Chat["messages"]): Chat => ({
  id: "c1",
  type: "scenario",
  title: "Scenario 1",
  messages,
  seed: { kind: "blank" },
});
const ctxFor = (level: string | null) => {
  const dispatch = vi.fn();
  const getState = () =>
    ({
      foundation: { intensity: level ? { level, description: "" } : null },
      runtime: { activeRequest: null, queue: [] },
      world: { entitiesById: {} },
    }) as unknown as RootState;
  return { dispatch, getState };
};

describe("the Scenario chat type", () => {
  it("reads its register from the Foundation's intensity", () => {
    expect(scenarioSpec.systemPromptFor(chatWith([]), ctxFor("Noir"))).toBe(
      buildScenarioPrompt("Noir"),
    );
    expect(scenarioSpec.systemPromptFor(chatWith([]), ctxFor(null))).toBe(
      buildScenarioPrompt("unset"),
    );
  });

  it("adds the writer's message and asks for a turn", () => {
    const ctx = ctxFor("Cozy");
    expect(
      scenarioSpec.handleSend!(chatWith([]), "  a lock-keeper  ", ctx),
    ).toBe(true);
    expect(ctx.dispatch.mock.calls[0][0].payload.message).toMatchObject({
      role: "user",
      content: "a lock-keeper",
    });
    expect(ctx.dispatch).toHaveBeenLastCalledWith(
      forgeChatContinueRequested({ chatId: "c1" }),
    );
  });

  it("asks for a turn with no message on an empty send into a chat with a sketch", () => {
    const ctx = ctxFor("Cozy");
    const chat = chatWith([
      { id: "u", role: "user", content: "seed" },
      { id: "a", role: "assistant", content: "sketch" },
    ]);
    scenarioSpec.handleSend!(chat, "   ", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledWith(
      forgeChatContinueRequested({ chatId: "c1" }),
    );
  });

  it("does nothing on an empty send into an empty chat", () => {
    const ctx = ctxFor("Cozy");
    expect(scenarioSpec.handleSend!(chatWith([]), "", ctx)).toBe(true);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("does nothing while a turn is queued or running", () => {
    const ctx = ctxFor("Cozy");
    const busy = () =>
      ({
        ...ctx.getState(),
        runtime: { activeRequest: { type: "forgeChat" }, queue: [] },
      }) as unknown as RootState;
    scenarioSpec.handleSend!(chatWith([]), "seed", { ...ctx, getState: busy });
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});
```

In `tests/core/store/slices/chat.test.ts` add:

```ts
describe("chats from before the Scenario chat", () => {
  const chat = (id: string, type: string) => ({
    id,
    type,
    title: id,
    messages: [],
    seed: { kind: "blank" as const },
  });

  it("drops chat types that no longer exist and keeps the rest", () => {
    const kept = keepKnownChats({
      chats: [
        chat("b", "brainstorm"),
        chat("s", "scenario"),
        chat("f", "forge"),
      ],
      activeChatId: "f",
    });
    expect(kept.chats.map((c) => c.id)).toEqual(["s"]);
    expect(kept.activeChatId).toBe("s");
  });

  it("seeds a Scenario chat when nothing survives", () => {
    const kept = keepKnownChats({
      chats: [chat("b", "brainstorm")],
      activeChatId: "b",
    });
    expect(kept.chats).toHaveLength(1);
    expect(kept.chats[0].type).toBe("scenario");
    expect(kept.activeChatId).toBe(kept.chats[0].id);
  });
});
```

In `tests/core/persist-loaded.test.ts` add, using that file's existing way of calling `rootReducer` with `persistedDataLoaded`:

```ts
it("returns drafts of a dropped chat to the World", () => {
  const draft = {
    id: "e1",
    name: "Hesper Vane",
    summary: "",
    categoryId: FieldID.DramatisPersonae,
    lifecycle: "draft" as const,
    sourceChatId: "old-forge",
  };
  const next = rootReducer(
    undefined,
    persistedDataLoaded({
      chat: {
        chats: [
          {
            id: "old-forge",
            type: "forge",
            title: "Forge",
            messages: [],
            seed: { kind: "blank" },
          },
        ],
        activeChatId: "old-forge",
      },
      world: { threads: [], entitiesById: { e1: draft }, entityIds: ["e1"] },
    }),
  );
  expect(next.chat.chats.every((c) => c.type === "scenario")).toBe(true);
  expect(next.world.entitiesById.e1.sourceChatId).toBeUndefined();
});
```

In `registry.test.ts`, replace the registration and forge-lookup cases with one asserting `Object.keys(CHAT_TYPE_REGISTRY).sort()` equals `["refine", "scenario", "summary"]` and equals `[...KNOWN_CHAT_TYPES].sort()`. In `header-control-kinds.test.ts`, the expected set becomes `sessionsButton`, `newChatButton`, `label`, `backButton`, `scrubIndicator`. Delete the three test files listed above.

Run: `npx vitest run tests/core/chat-types tests/core/store/slices/chat.test.ts tests/core/persist-loaded.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement the spec**

Create `src/core/chat-types/scenario.ts`:

```ts
import type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  SpecCtx,
} from "./types";
import { buildScenarioPrompt, normalizeRegisterKey } from "../utils/prompts";
import { forgeChatContinueRequested } from "../store/effects/forge-chat-actions";
import { messageAdded } from "../store/slices/chat";

/** The one chat a story is built in. A reply is prose plus commands; the
 *  commands are applied to draft entities and Threads when the turn completes
 *  (handlers/forge-chat.ts). Three kinds of turn, told apart by the transcript
 *  (`scenarioTurn` in forge-chat-strategy.ts): the first message is the seed,
 *  a later message steers, and an empty send grows the sketch. */
export const scenarioSpec: ChatTypeSpec = {
  id: "scenario",
  displayName: "Scenario",
  lifecycle: "save",

  inputPlaceholder:
    "Say what you want to see, steer the sketch, or send empty to grow it…",
  sendLabel: "Send",
  showClearButton: false,

  initialize(_seed: ChatSeed, _ctx: SpecCtx) {
    return { title: "Scenario", initialMessages: [] };
  },

  systemPromptFor(_chat: Chat, ctx: SpecCtx): string {
    return buildScenarioPrompt(
      normalizeRegisterKey(ctx.getState().foundation.intensity?.level),
    );
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return chat.messages;
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "scrub", kind: "scrubIndicator" },
      { id: "new", kind: "newChatButton" },
      { id: "sessions", kind: "sessionsButton" },
    ];
  },

  inlineEntityIdsFor(message, chat, ctx) {
    if (message.role !== "assistant") return [];
    return Object.values(ctx.getState().world.entitiesById)
      .filter(
        (e) =>
          e.sourceChatId === chat.id &&
          e.lifecycle === "draft" &&
          e.lastAffectingMessageId === message.id,
      )
      .map((e) => e.id);
  },

  handleSend(chat, content, ctx) {
    // Refuse while a turn or a reference scrub is queued or running: a second
    // send would only stack another empty assistant turn.
    const rt = ctx.getState().runtime;
    const isTurn = (t: string) => t === "forgeChat" || t === "forgeCleanup";
    if (
      (rt.activeRequest && isTurn(rt.activeRequest.type)) ||
      rt.queue.some((r) => isTurn(r.type))
    ) {
      return true;
    }

    const trimmed = content.trim();
    // An empty send grows the sketch. With nothing said yet there is nothing
    // to grow, and a turn would have no seed to answer.
    if (trimmed.length === 0 && chat.messages.length === 0) return true;
    if (trimmed.length > 0) {
      ctx.dispatch(
        messageAdded({
          chatId: chat.id,
          message: { id: api.v1.uuid(), role: "user", content: trimmed },
        }),
      );
    }
    ctx.dispatch(forgeChatContinueRequested({ chatId: chat.id }));
    return true;
  },
};
```

Replace `src/core/chat-types/index.ts`'s imports and registry:

```ts
import type { ChatTypeSpec } from "./types";
import { scenarioSpec } from "./scenario";
import { summarySpec } from "./summary";
import { refineSpec } from "./refine";

export const CHAT_TYPE_REGISTRY: Record<string, ChatTypeSpec> = {
  scenario: scenarioSpec,
  summary: summarySpec,
  refine: refineSpec,
};
```

In `src/core/chat-types/types.ts`, cut `HeaderControl["kind"]` down to `"sessionsButton" | "newChatButton" | "label" | "backButton" | "scrubIndicator"`.

Replace `src/core/store/effects/forge-chat-actions.ts`'s body (keep its header comment, changing `forge.ts` to `scenario.ts`) with the one action:

```ts
export interface ForgeChatContinueRequestedPayload {
  chatId: string;
}

const FORGE_CHAT_CONTINUE_REQUESTED = "forgeChat/continueRequested";
export const forgeChatContinueRequested = (
  payload: ForgeChatContinueRequestedPayload,
) => ({
  type: FORGE_CHAT_CONTINUE_REQUESTED as typeof FORGE_CHAT_CONTINUE_REQUESTED,
  payload,
});
forgeChatContinueRequested.type = FORGE_CHAT_CONTINUE_REQUESTED;
```

- [ ] **Step 3: Implement the slice default and the load filter**

In `src/core/store/slices/chat.ts`, replace `makeDefaultBrainstorm` and `seedChat` with:

```ts
/** Every chat type the registry holds (`chat-types/index.ts`; a test keeps the
 *  two in step). Named here, not imported, because the registry imports this
 *  slice. */
export const KNOWN_CHAT_TYPES: readonly string[] = [
  "scenario",
  "summary",
  "refine",
];

export function makeDefaultScenario(): Chat {
  return {
    id: api.v1.uuid(),
    type: "scenario",
    title: "Scenario 1",
    messages: [],
    seed: { kind: "blank" },
  };
}

/** A stored chat list with every chat of a type that no longer exists removed.
 *  A chat whose type has no spec cannot be rendered at all, so a story saved
 *  before the Scenario chat would otherwise open on an error. Nothing is
 *  converted: there is always at least one chat, and an active one. */
export function keepKnownChats(state: ChatSliceState): ChatSliceState {
  const kept = state.chats.filter((c) => KNOWN_CHAT_TYPES.includes(c.type));
  const chats = kept.length > 0 ? kept : [makeDefaultScenario()];
  const activeChatId = chats.some((c) => c.id === state.activeChatId)
    ? state.activeChatId
    : chats[chats.length - 1].id;
  return { chats, activeChatId };
}

const seedChat = makeDefaultScenario();
```

In `src/core/store/index.ts`, in the `PERSISTED_DATA_LOADED` branch, replace the `return { … }` with:

```ts
const chat = data.chat ? keepKnownChats(data.chat) : current.chat;
const loadedWorld = data.world ?? current.world;
// A draft made in a chat that no longer exists is hidden from the World
// (it is shown inline in its chat) and so would be unreachable. Cut the
// tie and it is an ordinary draft again.
const chatIds = new Set(chat.chats.map((c) => c.id));
const entitiesById = Object.fromEntries(
  Object.entries(loadedWorld.entitiesById).map(([id, e]) => [
    id,
    e.sourceChatId && !chatIds.has(e.sourceChatId)
      ? { ...e, sourceChatId: undefined }
      : e,
  ]),
);

return {
  ...current,
  story: data.story ? { ...initialStoryState, ...data.story } : current.story,
  chat,
  world: { ...loadedWorld, entitiesById },
  foundation: data.foundation
    ? { ...initialFoundationState, ...data.foundation }
    : current.foundation,
};
```

Import `keepKnownChats` from `./slices/chat` there.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/core/chat-types tests/core/store/slices/chat.test.ts tests/core/persist-loaded.test.ts`
Expected: PASS. Other suites that import the deleted modules fail until Task 5; that is expected here and nowhere else.

```bash
git add -A src tests
git commit -m "feat(scenario): the Scenario chat type; stories from before it load onto a fresh one"
```

---

### Task 5: One turn strategy, one turn effect

**Files:**

- Modify: `src/core/utils/forge-chat-strategy.ts` (rewrite all but the cleanup strategy)
- Modify: `src/core/store/effects/forge-chat-effects.ts`
- Modify: `src/core/store/effects/chat-effects.ts:147-170`
- Modify: `src/core/store/slices/forge.ts`, `src/core/store/selectors/forge.ts`, `src/core/store/index.ts` (exports)
- Modify: `src/core/utils/prompts.ts` (delete `FORGE_PROMPT`, `FORGE_SKETCH_PROMPT`, `FORGE_EXPAND_PROMPT`, `FORGE_WEAVE_PROMPT`, `FORGE_DISCUSS_PROMPT`, `BRAINSTORM_FRAME`, `BRAINSTORM_CRITIC_FRAME`, `BRAINSTORM_REGISTERS`, `buildBrainstormPrompt`, `BrainstormMode`, and the `brainstorm`, `brainstormCritic`, `forge`, `forgeDiscuss` keys of `XIALONG_STYLE`)
- Test: rewrite `tests/core/utils/forge-chat-strategy.test.ts`, `tests/core/store/effects/forge-chat-effects.test.ts`; modify `tests/core/store/slices/forge.test.ts`, `tests/core/store/selectors/forge.test.ts`, `tests/core/store/effects/chat-effects.test.ts`, `tests/core/utils/prompts.test.ts`, `tests/core/utils/instruct-callsites.test.ts`

**Interfaces:**

- Consumes: `buildScenarioPrompt`, `SCENARIO_GROW_INSTRUCTION` (Task 2); `forgeChatContinueRequested({ chatId })` (Task 4); `parseCommands` (parser).
- Produces: `scenarioTurn(chat: Chat, assistantMessageId: string): "sketch" | "steer" | "grow"`; `extractLastCritique(messages: ChatMessage[]): string | null`; `formatRejections(messages: ChatMessage[]): string`; `buildScenarioTurnStrategy(getState: () => RootState, chat: Chat, assistantMessageId: string): GenerationStrategy`; `buildForgeCleanupStrategy` unchanged.

- [ ] **Step 1: Write the failing strategy tests**

Replace `tests/core/utils/forge-chat-strategy.test.ts`, keeping its existing imports of the test setup and whatever mocks it installs for `api.v1.config.get` and `api.v1.storyStorage.get`:

```ts
const msg = (
  id: string,
  role: "user" | "assistant",
  content: string,
  extra = {},
) => ({
  id,
  role,
  content,
  ...extra,
});
const chatOf = (messages: ReturnType<typeof msg>[]): Chat => ({
  id: "c1",
  type: "scenario",
  title: "Scenario 1",
  messages,
  seed: { kind: "blank" },
});

describe("which kind of turn this is", () => {
  it("is a sketch while no reply has been written", () => {
    expect(
      scenarioTurn(
        chatOf([msg("u", "user", "seed"), msg("p", "assistant", "")]),
        "p",
      ),
    ).toBe("sketch");
  });
  it("is a steer when the writer spoke last", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch"),
      msg("u2", "user", "make her older"),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("steer");
  });
  it("is a grow when the Engine spoke last", () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch"),
      msg("p", "assistant", ""),
    ]);
    expect(scenarioTurn(chat, "p")).toBe("grow");
  });
});

describe("the last critique", () => {
  it("is found wherever it sits in the last reply", () => {
    const messages = [
      msg(
        "a",
        "assistant",
        "prose\n[CRITIQUE | the lock has no witness]\nA question?",
      ),
    ];
    expect(extractLastCritique(messages)).toBe("the lock has no witness");
  });
  it("is null when the last reply has none", () => {
    expect(
      extractLastCritique([msg("a", "assistant", "just prose")]),
    ).toBeNull();
  });
});

describe("what the last turn had rejected", () => {
  it("lists each command that was not applied, with its reason", () => {
    const messages = [
      msg("a", "assistant", "x", {
        forgeSegments: [
          {
            kind: "action",
            action: { kind: "CREATE", status: "applied", name: "Ok" },
          },
          {
            kind: "action",
            action: {
              kind: "THREAD",
              status: "rejected",
              name: "T",
              reason: "no known members",
            },
          },
          {
            kind: "action",
            action: {
              kind: "UNKNOWN",
              status: "unrecognized",
              reason: "REPAIR",
            },
          },
        ],
      }),
    ];
    expect(formatRejections(messages)).toBe(
      '[REJECTED LAST TURN] (not applied; write each again as its repair says)\n- THREAD "T": no known members\n- REPAIR',
    );
  });
  it("is empty when everything was applied", () => {
    expect(
      formatRejections([msg("a", "assistant", "x", { forgeSegments: [] })]),
    ).toBe("");
  });
});

describe("a Scenario turn's messages", () => {
  const state = {
    foundation: {
      situation: "",
      worldState: "",
      intensity: { level: "Noir", description: "No clean exits." },
      contract: null,
      attg: "",
      style: "",
    },
    world: {
      entitiesById: {
        h: {
          id: "h",
          name: "Hesper Vane",
          summary: "Keeps the lock.",
          categoryId: FieldID.DramatisPersonae,
          lifecycle: "draft",
          sourceChatId: "c1",
        },
      },
      entityIds: ["h"],
      threads: [
        {
          id: "t",
          title: "The Keys",
          state: "She holds them.",
          latent: "ZZ-LATENT",
          wish: "ZZ-WISH",
          entityIds: ["h"],
          status: "open",
        },
      ],
    },
    forge: { tombstonesByChatId: {}, pendingScrubByChatId: {} },
  } as unknown as RootState;

  it("gives the turn, the pool and the Threads' state, and ends on the grow instruction", async () => {
    const chat = chatOf([
      msg("u", "user", "seed"),
      msg("a", "assistant", "sketch\n[CRITIQUE | no witness]"),
      msg("p", "assistant", ""),
    ]);
    const built = await buildScenarioTurnStrategy(() => state, chat, "p")
      .messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n---\n");
    expect(built.messages[0].content).toBe(buildScenarioPrompt("Noir"));
    expect(text).toContain("TURN: GROW");
    expect(text).toContain("Hesper Vane");
    expect(text).toContain("- The Keys | Hesper Vane | She holds them.");
    expect(text).toContain("[PREVIOUS CRITIQUE]\nno witness");
    expect(built.messages.at(-1)).toEqual({
      role: "user",
      content: SCENARIO_GROW_INSTRUCTION,
    });
  });

  it("reads a Thread's private halves from the transcript only, never the store", async () => {
    const chat = chatOf([msg("u", "user", "seed"), msg("p", "assistant", "")]);
    const built = await buildScenarioTurnStrategy(() => state, chat, "p")
      .messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n");
    expect(text).not.toContain("ZZ-LATENT");
    expect(text).not.toContain("ZZ-WISH");
    expect(text).toContain("TURN: SKETCH");
  });
});
```

Imports for that file: `scenarioTurn`, `extractLastCritique`, `formatRejections`, `buildScenarioTurnStrategy` from the strategy; `buildScenarioPrompt`, `SCENARIO_GROW_INSTRUCTION` from prompts; `FieldID`; types `Chat`, `RootState`. (The state uses `situation`; Task 7 makes that the real field name. `formatFoundationBlock` ignores keys it does not read, so the test is valid before and after.)

Run: `npx vitest run tests/core/utils/forge-chat-strategy.test.ts`
Expected: FAIL.

- [ ] **Step 2: Rewrite the strategy**

In `src/core/utils/forge-chat-strategy.ts`, replace everything from the header comment down to (not including) `export function buildForgeCleanupStrategy` with:

```ts
/**
 * Scenario turn strategy — the per-turn message factory for the Scenario chat,
 * plus the post-discard reference scrubber.
 *
 * A turn is: the Scenario system prompt (with the register), the Foundation
 * and Setting, a context block code computes fresh each turn (TURN, [POOL],
 * [LIVE], [THREADS], [TOMBSTONES], [REJECTED LAST TURN], [PREVIOUS CRITIQUE]),
 * then the chat's own transcript. Nothing here is frozen at session start: the
 * chat is long-lived and the Foundation changes under it.
 *
 * [THREADS] carries title, cast and state only. A Thread's private halves reach
 * this model the one way they may: as the commands in its own transcript.
 */

import type { Chat, ChatMessage } from "../chat-types/types";
import type {
  GenerationStrategy,
  RootState,
  WorldEntity,
} from "../store/types";
import {
  buildStoryEnginePrefix,
  formatFoundationBlock,
  formatSettingBlock,
} from "./context-builder";
import { buildModelParams } from "./config";
import {
  buildScenarioPrompt,
  normalizeRegisterKey,
  FORGE_CLEANUP_PROMPT,
  SCENARIO_GROW_INSTRUCTION,
} from "./prompts";
import { DULFS_CATEGORY_LABELS } from "./category-detect";
import { parseCommands } from "./crucible-command-parser";

export type ScenarioTurn = "sketch" | "steer" | "grow";

/** Which kind of turn the placeholder `assistantMessageId` is about to hold.
 *  Read from the transcript, so a retry after a prune asks the right thing. */
export function scenarioTurn(
  chat: Chat,
  assistantMessageId: string,
): ScenarioTurn {
  const prior = chat.messages.filter((m) => m.id !== assistantMessageId);
  const answered = prior.some(
    (m) => m.role === "assistant" && m.content.trim() !== "",
  );
  if (!answered) return "sketch";
  return prior[prior.length - 1]?.role === "user" ? "steer" : "grow";
}

function lastReply(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content.trim() !== "") return m;
  }
  return undefined;
}

/** The critique in the most recent reply, or null. Parsed with the command
 *  parser, so it is found wherever in the reply it sits. */
export function extractLastCritique(messages: ChatMessage[]): string | null {
  const reply = lastReply(messages);
  if (!reply) return null;
  const critiques = parseCommands(reply.content).filter(
    (c) => c.kind === "CRITIQUE",
  );
  const last = critiques[critiques.length - 1];
  return last?.kind === "CRITIQUE" ? last.text : null;
}

/** The commands the most recent reply wrote that were not applied, each with
 *  the reason. A rejection the model never sees is one it repeats. */
export function formatRejections(messages: ChatMessage[]): string {
  const lines = (lastReply(messages)?.forgeSegments ?? []).flatMap((s) => {
    if (s.kind !== "action" || s.action.status === "applied") return [];
    const { kind, name, reason } = s.action;
    return [
      kind === "UNKNOWN"
        ? `- ${reason ?? "unrecognized command"}`
        : `- ${kind}${name ? ` "${name}"` : ""}: ${reason ?? "rejected"}`,
    ];
  });
  if (lines.length === 0) return "";
  return [
    "[REJECTED LAST TURN] (not applied; write each again as its repair says)",
    ...lines,
  ].join("\n");
}

// --- Context block formatters ---

function formatEntityLine(e: WorldEntity): string {
  const label = DULFS_CATEGORY_LABELS[e.categoryId] ?? "Entity";
  return `- ${e.name} (${label})${e.summary ? ` — ${e.summary}` : ""}`;
}

function formatPool(state: RootState, chatId: string): string {
  const drafts = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "draft" && e.sourceChatId === chatId,
  );
  if (drafts.length === 0) return "";
  return [
    "[POOL] (drafts you may modify)",
    ...drafts.map(formatEntityLine),
  ].join("\n");
}

function formatLive(state: RootState): string {
  const live = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "live",
  );
  if (live.length === 0) return "";
  return [
    "[LIVE] (read-only; never modify or delete)",
    ...live.map(formatEntityLine),
  ].join("\n");
}

function formatThreads(state: RootState): string {
  const open = state.world.threads.filter((t) => t.status === "open");
  if (open.length === 0) return "";
  const lines = open.map((t) => {
    const cast = t.entityIds
      .map((id) => state.world.entitiesById[id]?.name)
      .filter((n): n is string => !!n)
      .join(", ");
    return `- ${t.title} | ${cast} | ${t.state.trim() || "(blank)"}`;
  });
  return ["[THREADS] (title | cast | state)", ...lines].join("\n");
}

function formatTombstones(state: RootState, chatId: string): string {
  const tombs = state.forge.tombstonesByChatId[chatId] ?? [];
  if (tombs.length === 0) return "";
  return [
    "[TOMBSTONES] (discarded; do not recreate)",
    ...tombs.map((t) => `- ${t.name} (${t.category})`),
  ].join("\n");
}

// --- Strategies ---

export function buildScenarioTurnStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
): GenerationStrategy {
  const factory = async () => {
    const state = getState();
    const turn = scenarioTurn(chat, assistantMessageId);
    const prior = chat.messages.filter((m) => m.id !== assistantMessageId);

    const premise = [formatFoundationBlock(state), await formatSettingBlock()]
      .filter((b) => b.length > 0)
      .join("\n\n");

    const critique = extractLastCritique(prior);
    // No truncation anywhere in this block: a summary cut short is a draft the
    // model revises from half its text.
    const blocks = [
      `TURN: ${turn.toUpperCase()}`,
      formatPool(state, chat.id),
      formatLive(state),
      formatThreads(state),
      formatTombstones(state, chat.id),
      formatRejections(prior),
      critique ? `[PREVIOUS CRITIQUE]\n${critique}` : "",
    ].filter((b) => b.length > 0);

    const messages: Message[] = [
      {
        role: "system",
        content: buildScenarioPrompt(
          normalizeRegisterKey(state.foundation.intensity?.level),
        ),
      },
      ...(premise ? [{ role: "system" as const, content: premise }] : []),
      { role: "assistant", content: blocks.join("\n\n") },
      ...prior.map((m) => ({ role: m.role, content: m.content })),
      ...(turn === "grow"
        ? [{ role: "user" as const, content: SCENARIO_GROW_INSTRUCTION }]
        : []),
    ];

    return {
      messages,
      // "instruct": a turn emits a strict bracket grammar, and every command
      // that misses it is a card the writer does not get. Observed the other
      // way round on the Forge: on the creative model a pass answered
      // conversationally and created nothing.
      params: await buildModelParams(
        { max_tokens: 1536, temperature: 0.9, min_p: 0.05 },
        "instruct",
      ),
    };
  };

  return {
    requestId: `scenario-${chat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "forgeChat",
      chatId: chat.id,
      messageId: assistantMessageId,
    },
    prefillBehavior: "trim",
    // No prefill: a reply opens with prose. Cut off by the token cap it stops
    // mid-command and the last action is lost, so it continues.
    continuation: { maxCalls: 4 },
  };
}
```

In `buildForgeCleanupStrategy` (kept), change `formatPool(state, chat.id)` nothing else; it still compiles against the new `formatPool`. `appendXialongStyleMessage` and `XIALONG_STYLE` are no longer imported here.

Run: `npx vitest run tests/core/utils/forge-chat-strategy.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing effect tests**

Replace `tests/core/store/effects/forge-chat-effects.test.ts`'s cases for discuss, continue-with-phase, new-session and session-closing with these, using the file's existing harness for registering the effects against a test store and reading dispatched actions:

- "a continue request adds one empty assistant turn and queues one `forgeChat` request whose id starts with `scenario-`".
- "a continue request while a `forgeChat` request is queued does nothing".
- "a continue request leads with the pending reference scrub" (keep the existing case; drop its phase assertions).
- "Cast All casts every draft of the chat and leaves the chat and its tombstones in place": after `forgeCastAllRequested({ chatId })`, the chat is still in `state.chat.chats` and `entityCastRequested` was dispatched once per draft.
- "Discard All tombstones and deletes every draft and leaves the chat in place".

Run: `npx vitest run tests/core/store/effects/forge-chat-effects.test.ts`
Expected: FAIL.

- [ ] **Step 4: Rewrite the effects**

In `src/core/store/effects/forge-chat-effects.ts`:

1. Header comment: describe three signals — `forgeChatContinueRequested` (queue the next Scenario turn), `entityDiscardRequested`, and Cast / Cast All / Discard All.
2. Imports: remove `buildForgeBriefing`, `chatCreated`, `chatDeleted`, `subModeChanged`, `selectForgeNextPhase`, `tombstonesClearedForChat`, `forgeNextPhaseCleared`, `buildForgeChatStrategy`, `buildForgeDiscussStrategy`, `ChatMessage`; add `buildScenarioTurnStrategy`. The re-export block becomes `forgeChatContinueRequested` and its payload type only.
3. Delete `forgeChatNewSessionRequested` and its payload type, `closeForgeSession`, the Discuss effect, the New Session effect and its `creatingSession` guard.
4. Replace the Continue effect with:

```ts
// ─── A Scenario turn (sketch, steer or grow — the strategy reads which) ─────
subscribeEffect(
  matchesAction(forgeChatContinueRequested),
  async (action, { getState: latest }) => {
    const { chatId } = action.payload;
    if (!findChat(latest(), chatId)) return;
    // No-op if a turn is already queued or running, so repeated sends cannot
    // stack empty turns and background generations.
    if (forgeRequestPending(latest())) return;

    // Lead with the deferred reference scrub, if any. Queued first, so it
    // has scrubbed the pool before this turn's JIT factory builds context.
    runPendingScrub(latest, dispatch, chatId);

    const assistantId = api.v1.uuid();
    dispatch(
      messageAdded({
        chatId,
        message: { id: assistantId, role: "assistant", content: "" },
      }),
    );
    const chat = findChat(latest(), chatId);
    if (!chat) return;

    const strategy = buildScenarioTurnStrategy(latest, chat, assistantId);
    dispatch(
      requestQueued({
        id: strategy.requestId,
        type: "forgeChat",
        targetId: assistantId,
      }),
    );
    dispatch(generationSubmitted(strategy));
  },
);
```

5. In the Cast All effect, delete the `closeForgeSession` call and its comment; the body is the loop alone, under the comment `// Casting does not end the session: the chat is the story's, and outlives any one batch of drafts.`
6. In the Discard All effect, replace the `closeForgeSession` call and comment with `dispatch(scrubCleared({ chatId }));` under `// Every draft is gone, so there is nothing left to scrub.`

In `src/core/store/effects/chat-effects.ts`, the retry branch: change `chat.type === "forge"` to `chat.type === "scenario"`, the dispatch to `forgeChatContinueRequested({ chatId })`, and rewrite the comment above it to say a Scenario turn is not an ordinary chat turn and that the strategy re-reads which kind of turn it is from the pruned transcript.

In `src/core/store/slices/forge.ts`, delete `pinnedNextPhaseByChatId` (type, initial state), `forgeNextPhasePinned`, `forgeNextPhaseCleared`. In `src/core/store/selectors/forge.ts`, delete `selectActiveForgeChatId`, `ForgePhase`, `nextForgePhase`, `selectForgeNextPhase`; reword the `isForgeDraft` comment to say "a Scenario chat's draft". In `src/core/store/index.ts`, remove the exports of everything deleted in this step.

Delete from `src/core/utils/prompts.ts` the constants and `XIALONG_STYLE` keys listed under **Files**. Then: `grep -rn "FORGE_PROMPT\|FORGE_SKETCH\|FORGE_EXPAND\|FORGE_WEAVE\|FORGE_DISCUSS\|BRAINSTORM_FRAME\|BRAINSTORM_CRITIC\|BRAINSTORM_REGISTERS\|buildBrainstormPrompt\|XIALONG_STYLE\.\(brainstorm\|brainstormCritic\|forge\|forgeDiscuss\)\b" src` must print nothing.

- [ ] **Step 5: Run, fix the fallout, commit**

Run: `npm run test`
Fix: `forge.test.ts` (slice, selectors) lose their phase cases; `chat-effects.test.ts`'s forge-retry case uses type `"scenario"` and expects `forgeChatContinueRequested({ chatId })`; `prompts.test.ts` loses cases about deleted constants; `instruct-callsites.test.ts` lists the callsites of `"instruct"` — update its expectation to the one Scenario turn callsite plus the cleanup. Expected after fixes: PASS, apart from UI source-scan tests that Task 6 owns (`brainstorm-cta-source`, `chat-actions`, `setup-model`, `tabs`).

```bash
git add -A src tests
git commit -m "feat(scenario): one turn strategy and one turn effect replace the Forge's phases and discuss"
```

---

### Task 6: The UI follows, and the transcript leaves the prefix

**Files:**

- Modify: `src/ui/panels/chat/ChatHeader.tsx`, `Sessions.tsx:124-138`, `Chat.tsx:93-94`, `ForgeCommitBar.tsx`, `chat-actions.ts`
- Rename: `src/ui/panels/setup/BrainstormCta.tsx` → `ScenarioCta.tsx`; modify `Setup.tsx`, `setup-model.ts`
- Delete: `src/ui/panels/forge/ForgeSection.tsx`; modify `src/ui/panels/Engine.tsx:11,35`, `src/core/keys.ts:34`
- Modify: `src/ui/App.tsx:64-80`
- Modify: `src/core/utils/context-builder.ts`, `src/core/utils/chat-strategy.ts:76-78,169-171`, `src/core/utils/forge-chat-strategy.ts` (cleanup strategy's `excludeChat`), `src/core/utils/crucible-command-parser.ts` (delete `redactThreadPrivateNotes`)
- Modify: `src/core/chat-types/summary.ts`, `src/core/chat-types/types.ts:54-58`, `src/core/store/slices/ui.ts:46-49`, `src/core/store/effects/chat-effects.ts:34-50`, `src/core/utils/prompts.ts` (delete `BRAINSTORM_SUMMARIZE_PROMPT`)
- Test: rename `tests/ui/brainstorm-cta-source.test.ts` → `scenario-cta-source.test.ts`; modify `tests/ui/chat-actions.test.ts`, `setup-model.test.ts`, `tabs.test.ts`, `thread-source.test.ts`, `tests/core/utils/context-builder.test.ts`, `chat-strategy.test.ts`, `crucible-command-parser.test.ts`, `tests/core/chat-types/summary.test.ts`, `tests/core/engine/private-notes-sinks.test.ts`

**Interfaces:**

- Consumes: `scenarioSpec`, `makeDefaultScenario` (Task 4).
- Produces: `nextScenarioTitle(chats)`, `hasScenarioContent(chats)`, `reusableScenarioId(chats, activeChatId)` in `chat-actions.ts`; `ScenarioCta`; `buildStoryEnginePrefix` without `excludeChat` or the `"brainstorm"` section.

- [ ] **Step 1: Write the failing sink test**

In `tests/core/engine/private-notes-sinks.test.ts`: change the fixture chat to `type: "scenario"` with no `subMode`, give its `THREAD` line five segments (`… | ${FORGE_STATE} | ${SENTINEL} | ${WISH_SENTINEL}]` with `const WISH_SENTINEL = "ZZ-WISH-SENTINEL-4410"`), add `wish: \`She leaves. ${WISH_SENTINEL}\`` to the stored Thread, and replace the assertions after the first positive control with:

```ts
// The chat's transcript no longer reaches this model at all.
expect(text).not.toContain(FORGE_STATE);
for (const message of built.messages) {
  expect(message.content).not.toContain(SENTINEL);
  expect(message.content).not.toContain(WISH_SENTINEL);
}
```

Rewrite the file's header comment: the transcript is no longer a sink; this test keeps it that way.

Run: `npx vitest run tests/core/engine/private-notes-sinks.test.ts`
Expected: FAIL on `not.toContain(FORGE_STATE)`.

- [ ] **Step 2: Take the transcript out of the prefix**

In `src/core/utils/context-builder.ts`: delete `formatBrainstormBlock`, `FORGE_BRIEFING_HEADER`, `buildForgeBriefing`, `getActiveChatTranscript`, the `"brainstorm"` member of `excludeSections`, the `excludeChat` option, and the `if (!excluded.has("brainstorm") && !options.excludeChat) { … }` block. Remove the imports this orphans (`redactThreadPrivateNotes`, `getChatTypeSpec`, `SpecCtx`, `activeSavedChat`). In the prefix's doc comment, drop "brainstorm" from MSG 1's contents and the sentence about Brainstorm mode.

Remove `excludeChat: true` from the two `buildStoryEnginePrefix` calls in `chat-strategy.ts` and the one in `buildForgeCleanupStrategy`.

Delete `redactThreadPrivateNotes` and its doc comment from the parser.

Run: `grep -rn "excludeChat\|formatBrainstormBlock\|buildForgeBriefing\|getActiveChatTranscript\|redactThreadPrivateNotes" src` — must print nothing.

Run: `npx vitest run tests/core/engine/private-notes-sinks.test.ts`
Expected: PASS. Then delete the tests of the removed functions from `context-builder.test.ts`, `chat-strategy.test.ts` and `crucible-command-parser.test.ts`.

- [ ] **Step 3: Remove the brainstorm summary**

`summary.ts`: delete the `fromChat` branch of `initialize`, `findChatById`, `transcriptToText`, and make `systemPromptFor` return `STORY_TEXT_SUMMARIZE_PROMPT`. Remove `{ kind: "fromChat"; sourceChatId: string }` from `ChatSeed` (`types.ts`) and from the payload type in `slices/ui.ts`; remove the `fromChat` arm of the seed comparison in `chat-effects.ts`. Delete `BRAINSTORM_SUMMARIZE_PROMPT`. Update `summary.test.ts` to match.

Then run `grep -rn "uiChatSummarizeRequested" src`. If the only hits are its definition and the effect, leave both in place and say so in the commit body: the spec keeps the story-text summary, and whether it still has a trigger is a question for the writer, not a deletion to make here.

- [ ] **Step 4: Chat header, sessions, commit bar**

`chat-actions.ts`: rename `nextBrainstormTitle` → `nextScenarioTitle` (counts `type === "scenario"`, returns `` `Scenario ${count + 1}` ``), `hasBrainstormContent` → `hasScenarioContent`, `reusableBrainstormId` → `reusableScenarioId`; each tests `"scenario"`. Reword their comments to match.

`ChatHeader.tsx`: delete the `subModeToggle`, `summarizeButton` and `phaseIndicator` cases, and `MODE_COWRITER`, `MODE_CRITIC`, `modeBtnStyle`, `FORGE_PHASES`, `phasePillStyle`, the `forgeNext` / `forgePoolEmpty` reads, and the imports they orphan (`subModeChanged`, `uiChatSummarizeRequested`, `forgeNextPhasePinned`, the two forge selectors if unused). In `newChatButton`, build the chat as:

```ts
const newChat: ChatT = {
  id: api.v1.uuid(),
  type: "scenario",
  title: nextScenarioTitle(store.getState().chat.chats),
  messages: [],
  seed: { kind: "blank" },
};
```

`Sessions.tsx`: the same object in `newChat` (with `nextScenarioTitle(chats)`).

`ForgeCommitBar.tsx`: remove the `onEnd` prop and both `props.onEnd()` calls; relabel the buttons `Cast drafts` and `Discard drafts`; rewrite the header comment: "Casts or discards every draft of this Scenario chat. Neither ends the session." In `Chat.tsx`, line 94 becomes `{chat.type === "scenario" && <ForgeCommitBar />}`.

Run `grep -n "Forge" src/ui/panels/chat/SendButton.tsx src/ui/panels/chat/ChatInput.tsx src/ui/panels/chat/Message.tsx`. For each hit that is a label the writer sees, replace "Forge Ahead" with "Grow" and "Forge" with "Scenario"; reword comments to match.

- [ ] **Step 5: Setup, Engine tab, App**

`git mv src/ui/panels/setup/BrainstormCta.tsx src/ui/panels/setup/ScenarioCta.tsx`; rename the component `ScenarioCta`; use `reusableScenarioId` / `nextScenarioTitle`; build the chat with `type: "scenario"` and no `subMode`; copy becomes — ready: title `Sketch the scenario`, body `Not sure where to start? Say what you want to see, and the Engine builds the pressures, people and places it can grow from.`; not ready: body `Pick a register above. The sketch is built at the pressure you set, so it is worth choosing before you start.` Update `Setup.tsx`'s import and JSX tag.

`setup-model.ts`: `hasBrainstormContent` → `hasScenarioContent`; rename `showBrainstormCta` → `showScenarioCta` and `brainstormStarted` → `scenarioStarted` throughout, including `Setup.tsx`'s read of it; reword comments.

`Engine.tsx`: delete the `ForgeSection` import and its `<ForgeSection />`. Delete `src/ui/panels/forge/ForgeSection.tsx` (and the directory if empty) and the `FORGE_GUIDANCE_UI` line in `keys.ts`.

`App.tsx`: in both effects, the condition becomes `type === "refine"` alone.

- [ ] **Step 6: Run, fix the source-scan tests, build, commit**

`git mv tests/ui/brainstorm-cta-source.test.ts tests/ui/scenario-cta-source.test.ts` and point it at the new path and names. Update `chat-actions.test.ts`, `setup-model.test.ts` and `tabs.test.ts` for the renames and for the chat tab no longer following a forge chat. In `thread-source.test.ts`, the case "names the World panel and the Forge, and nothing else" still holds (the creators are the World panel and `handlers/forge-chat.ts`); reword its title to "the Scenario chat".

Run: `npm run test && npm run build`
Expected: both PASS.

```bash
git add -A src tests
git commit -m "feat(scenario): the UI opens Scenario chats; the transcript leaves every other prefix"
```

---

### Task 7: Foundation — Shape goes, Intent becomes Situation

**Files:**

- Modify: `src/core/store/types.ts:106-110,180-208`, `src/core/store/slices/foundation.ts`, `src/core/store/index.ts`
- Modify: `src/core/store/effects/foundation-effects.ts`, `src/core/store/effects/handlers/foundation.ts`, `src/core/store/effects/bootstrap-effects.ts:38-44`
- Modify: `src/core/store/selectors/runtime.ts:25`, `src/core/utils/field-strategy-registry.ts:5,25`, `src/core/utils/context-builder.ts:56-109,319-338`, `src/core/utils/summary-strategy.ts:63-75,185-197`, `src/core/generation-journal.ts:155-161`
- Modify: `src/ui/panels/foundation/fields.ts`, `FieldCard.tsx`, `FieldEditor.tsx`, `src/ui/panels/import/ImportWizard.tsx`, `ImportFoundation.tsx`
- Modify: `src/core/utils/prompts.ts` (delete `CRUCIBLE_SHAPE_PROMPT`, `FOUNDATION_INTENT_PROMPT`, `XIALONG_STYLE.foundationShape`, `XIALONG_STYLE.foundationIntent`)
- Test: `tests/core/store/effects/handlers/foundation.test.ts`, `tests/ui/foundation-fields.test.ts`, `tests/core/utils/context-builder.test.ts`, `tests/core/persist-loaded.test.ts`, plus every fixture that builds a `foundation` object

**Interfaces:**

- Produces: `FoundationState` with `situation: string` and no `shape` / `intent`; `situationUpdated({ situation })`, `situationGenerationRequested()`; target `{ type: "foundation"; field: "situation" | "worldState" | "attg" | "style" | "contract" }`; `buildSituationStrategy`; `FoundationFieldId = "situation" | "contract" | "attg" | "style"`.

- [ ] **Step 1: Write the failing tests**

In `tests/core/utils/context-builder.test.ts` add:

```ts
describe("the Foundation block", () => {
  const foundation = {
    situation: "The company is buying the lock houses.",
    worldState: "",
    intensity: null,
    contract: null,
    attg: "",
    style: "",
    attgSyncEnabled: false,
    styleSyncEnabled: false,
  };
  it("carries the Situation and names no Shape or Intent", () => {
    const block = formatFoundationBlock({ foundation } as unknown as RootState);
    expect(block).toContain(
      "Situation: The company is buying the lock houses.",
    );
    expect(block).not.toMatch(/Shape:|Intent:/);
  });
});
```

In `tests/core/persist-loaded.test.ts` add:

```ts
it("drops a stored Shape and Intent", () => {
  const next = rootReducer(
    undefined,
    persistedDataLoaded({
      foundation: {
        ...initialFoundationState,
        attg: "kept",
        shape: { name: "Tragedy", description: "x" },
        intent: "a logline",
      } as unknown as FoundationState,
    }),
  );
  expect(next.foundation.attg).toBe("kept");
  expect(next.foundation).not.toHaveProperty("shape");
  expect(next.foundation).not.toHaveProperty("intent");
  expect(next.foundation.situation).toBe("");
});
```

In `tests/core/store/effects/handlers/foundation.test.ts`, replace the `shape` and `intent` cases with one: a completion for `field: "situation"` with text `"  The company is buying.  "` dispatches `situationUpdated({ situation: "The company is buying." })`.

Run those three files. Expected: FAIL.

- [ ] **Step 2: State and slice**

`types.ts`: delete `ShapeData`; in `FoundationState` replace `shape` and `intent` with `situation: string;`; the foundation target's `field` union becomes `"situation" | "worldState" | "attg" | "style" | "contract"`.

`slices/foundation.ts`: initial state `situation: ""` (no `shape`, `intent`); delete `shapeUpdated`, `shapeGenerationRequested`; rename `intentUpdated` → `situationUpdated` (payload `{ situation: string }`) and `intentGenerationRequested` → `situationGenerationRequested`; add:

```ts
/** A stored Foundation narrowed to the fields this build has. Shape and Intent
 *  were removed; left in the object they would be saved back for ever. */
export function pickFoundation(
  stored: Partial<FoundationState>,
): FoundationState {
  const next = { ...initialFoundationState };
  for (const key of Object.keys(next) as (keyof FoundationState)[]) {
    if (stored[key] !== undefined) {
      (next as Record<keyof FoundationState, unknown>)[key] = stored[key];
    }
  }
  return next;
}
```

`store/index.ts`: the load branch uses `foundation: data.foundation ? pickFoundation(data.foundation) : current.foundation`; update the re-exports for the renamed and deleted actions.

- [ ] **Step 3: Generation**

`foundation-effects.ts`:

- Delete `createShapeFactory` and its doc comment, the `shape` entry of `factoryMap`, the `shapeGenerationRequested` subscription, and `CRUCIBLE_SHAPE_PROMPT` from the imports.
- Rename `createIntentFactory` → `createSituationFactory`, `buildIntentStrategy` → `buildSituationStrategy`, `intentGenerationRequested` → `situationGenerationRequested`, and every `"intent"` field literal → `"situation"`. Every `"shape" | "intent" | …` union loses `"shape"` and has `"situation"`.
- Replace the body of `createSituationFactory` with:

```ts
/**
 * Situation: reads setting, the World and the story so far, and excludes the
 * Foundation. The World's Situational Dynamics are in the prefix already; the
 * open Threads' `state` is added here, because how things stand between the
 * cast is half of what a Situation says.
 */
const createSituationFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const [prefix, storyContext] = await Promise.all([
      buildStoryEnginePrefix(getState, { excludeSections: ["foundation"] }),
      api.v1.buildContext({ suppressScriptHooks: "self" }),
    ]);

    const messages: Message[] = [
      ...prefix,
      ...storyContext.slice(1), // drop NAI's story-writing system prompt
    ];

    const { foundation, world } = getState();
    if (foundation.intensity) {
      messages.push({
        role: "system" as const,
        content: `Intensity: ${foundation.intensity.level} — ${foundation.intensity.description}`,
      });
    }
    const standing = world.threads
      .filter((t) => t.status === "open" && t.state.trim() !== "")
      .map((t) => `- ${t.title}: ${t.state.trim()}`);
    if (standing.length > 0) {
      messages.push({
        role: "system" as const,
        content: `[THREADS]\n${standing.join("\n")}`,
      });
    }

    messages.push({
      role: "system" as const,
      content: FOUNDATION_SITUATION_PROMPT,
    });
    await appendXialongStyleMessage(
      messages,
      XIALONG_STYLE.foundationSituation,
    );

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 120,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>", "\n"],
      }),
    };
  };
```

- In the world-state, contract, ATTG and style factories, each `const { shape, intent, … } = getState().foundation;` loses `shape` and reads `situation`; delete each `if (shape) anchors.push(…)` line; each `if (intent) anchors.push(\`Intent: ${intent}\`)` becomes `if (situation) anchors.push(\`Situation: ${situation}\`)`. Fix the doc comments that mention shape or intent.

`handlers/foundation.ts`: delete `parseShape`, the `"shape"` case and the `ShapeData` / `shapeUpdated` imports; the `"intent"` case becomes `case "situation": { ctx.dispatch(situationUpdated({ situation: text })); break; }`.

`bootstrap-effects.ts:38-44`: drop `shape` and its anchor line; `intent` → `situation`, label `Situation:`.

`selectors/runtime.ts:25` and `field-strategy-registry.ts`: `"shape"` removed, `intent` → `situation` (`situation: (gs, opts) => buildSituationStrategy(gs, opts)`).

`context-builder.ts`: in `formatFoundationBlock`, delete the Shape line and write `if (situation) parts.push(\`Situation: ${situation}\`);`. In `buildXialongNarrativeStyleBlock`, delete the shape-name block, read `const { situation } = state.foundation ?? {};`and set`const context = (situation ?? "").toLowerCase();`; fix its doc comment.

`summary-strategy.ts`: at both sites delete the `=== STORY SHAPE ===` block and turn the intent block into `=== STORY SITUATION ===\n${foundation.situation}` guarded by `foundation.situation`.

`generation-journal.ts:155-161`: the regex and its comment list `Intensity:|Situation:|World State:|Story Contract:`.

`prompts.ts`: delete `CRUCIBLE_SHAPE_PROMPT`, `FOUNDATION_INTENT_PROMPT`, and the two old `XIALONG_STYLE` keys.

- [ ] **Step 4: UI**

`fields.ts`: header comment says four card-fields; `FoundationFieldId = "situation" | "contract" | "attg" | "style"`; delete the Shape descriptor, and the `titled`, `titlePlaceholder` members of `FieldDescriptor` if nothing else sets them (then remove the title input they drove in `FieldEditor.tsx` and the Shape special case in `FieldCard.tsx`; keep `hasRefine`). The Intent descriptor becomes:

```ts
  {
    id: "situation",
    label: "Situation",
    hasRefine: true,
    cardLabel: () => "Situation",
    display: (s) => s.foundation.situation,
    seed: (s) => ({ title: "", content: s.foundation.situation }),
    commit: ({ content }) =>
      store.dispatch(situationUpdated({ situation: content })),
    generate: () => store.dispatch(situationGenerationRequested()),
    refineSource: (s) => s.foundation.situation,
    placeholder:
      "What is happening when the story opens, and what cannot both be kept?",
  },
```

`ImportWizard.tsx`: delete the `shapeGenerationRequested` dispatch and import; `intentGenerationRequested` → `situationGenerationRequested`; fix the two comments. `ImportFoundation.tsx`: delete the Shape button; the Intent button dispatches `situationGenerationRequested()` and reads `Situation`; the label reads `Story → Situation + Contract`; fix the comments.

- [ ] **Step 5: Verify nothing is left, run, build, commit**

Run: `grep -rnw "shape\|ShapeData\|intent" src --include=*.ts --include=*.tsx | grep -v "src/core/engine/\|engine-loop.ts\|slices/world.ts"` — every remaining hit must be the ordinary English word in a comment about something else (the engine's `intent` queue is excluded by the filter).

Run: `npm run test`. Fixtures across `tests/` that build `foundation: { shape: null, intent: "", … }` still pass (they are cast through `unknown`); update the ones that assert on Shape or Intent text: `foundation-fields.test.ts`, `foundation-contract.test.ts`, `bootstrap-effects.test.ts`, `summary-strategy.test.ts`, `runtime.test.ts`, `types.test.ts`, `autosave.test.ts`, `queue-entry.test.ts`. In `private-notes-sinks.test.ts` replace the fixture's `shape: null, intent: ""` with `situation: ""`.

Run: `npm run build`. Expected: PASS.

```bash
git add -A src tests
git commit -m "feat(foundation): Shape is removed and Intent becomes a present-tense Situation"
```

---

### Task 8: Chat paging

**Files:**

- Create: `src/ui/panels/chat/paging.ts`
- Modify: `src/ui/panels/chat/Chat.tsx`
- Test: create `tests/ui/chat-paging.test.ts`

**Interfaces:**

- Produces: `PAGE_SIZE = 25`; `pageWindow(total: number, back: number): { start: number; end: number; back: number; hasOlder: boolean; hasNewer: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/chat-paging.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PAGE_SIZE, pageWindow } from "../../src/ui/panels/chat/paging";

describe("the chat's message window", () => {
  it("shows everything when the chat fits on a page", () => {
    expect(pageWindow(10, 0)).toEqual({
      start: 0,
      end: 10,
      back: 0,
      hasOlder: false,
      hasNewer: false,
    });
  });

  it("shows the newest page by default", () => {
    expect(pageWindow(60, 0)).toMatchObject({
      start: 35,
      end: 60,
      hasOlder: true,
      hasNewer: false,
    });
  });

  it("pages back one page at a time, and the oldest page may be short", () => {
    expect(pageWindow(60, 1)).toMatchObject({
      start: 10,
      end: 35,
      hasOlder: true,
      hasNewer: true,
    });
    expect(pageWindow(60, 2)).toMatchObject({
      start: 0,
      end: 10,
      hasOlder: false,
      hasNewer: true,
    });
  });

  it("clamps a position the chat no longer reaches", () => {
    // Paged three back, then a retry pruned the chat to 30 messages.
    expect(pageWindow(30, 3)).toMatchObject({ start: 0, end: 5, back: 1 });
    expect(pageWindow(5, 3)).toMatchObject({ start: 0, end: 5, back: 0 });
    expect(pageWindow(0, 2)).toMatchObject({ start: 0, end: 0, back: 0 });
  });

  it("never shows nothing for a chat that has messages", () => {
    for (let total = 1; total <= 80; total++) {
      for (let back = 0; back <= 5; back++) {
        const w = pageWindow(total, back);
        expect(w.end - w.start).toBeGreaterThan(0);
        expect(w.end - w.start).toBeLessThanOrEqual(PAGE_SIZE);
      }
    }
  });
});

describe("Chat.tsx and the window", () => {
  const source = readFileSync("src/ui/panels/chat/Chat.tsx", "utf8");

  it("returns to the newest page when a message is sent", () => {
    expect(source).toMatch(/matchesAction\(uiChatSubmitUserMessage\)/);
  });

  it("keeps the window out of the store", () => {
    expect(source).not.toMatch(/dispatch\([^)]*[Pp]age/);
  });

  it("mounts both load-more buttons and lets display pick", () => {
    expect(source).not.toMatch(/hasOlder\s*&&|hasNewer\s*&&/);
    expect(source.match(/display:\s*w\.has(Older|Newer)/g)).toHaveLength(2);
  });
});
```

Run: `npx vitest run tests/ui/chat-paging.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement the window**

Create `src/ui/panels/chat/paging.ts`:

```ts
// The slice of a chat the list renders. Pure, so it is testable headless.
//
// This is VIEW state: where the writer is looking. It never enters the store
// and nothing that builds a prompt reads it — a model is always sent the whole
// transcript, whatever page is on screen.

export const PAGE_SIZE = 25;

export type PageWindow = {
  /** Index of the first message shown, inclusive. */
  start: number;
  /** Index after the last message shown. */
  end: number;
  /** `back` after clamping: how many pages before the newest this is. */
  back: number;
  hasOlder: boolean;
  hasNewer: boolean;
};

/** The window `back` pages before the newest, over a chat of `total` messages.
 *  Pages are counted from the end, so the newest page is always full and the
 *  oldest holds the remainder. `back` is clamped: a chat can shrink under a
 *  writer who has paged back (a retry prunes it), and the window must never
 *  come up empty over a chat that has messages. */
export function pageWindow(total: number, back: number): PageWindow {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clamped = Math.min(Math.max(0, back), pages - 1);
  const end = total - clamped * PAGE_SIZE;
  const start = Math.max(0, end - PAGE_SIZE);
  return {
    start,
    end,
    back: clamped,
    hasOlder: start > 0,
    hasNewer: clamped > 0,
  };
}
```

Run: `npx vitest run tests/ui/chat-paging.test.ts`
Expected: the first `describe` PASSES; the second still FAILS.

- [ ] **Step 3: Use it in the list**

In `src/ui/panels/chat/Chat.tsx`: add imports `import { matchesAction } from "nai-store";`, `uiChatSubmitUserMessage` to the import from `../../../core/store`, `T` to the import from `../../style`, and `import { pageWindow } from "./paging";`. Delete the module-level `contentKey`. Replace `MessageList` with:

```tsx
const loadMoreStyle = {
  alignSelf: "center",
  padding: "4px 12px",
  fontSize: "0.8em",
  background: T.bg2,
  border: "none",
  cursor: "pointer",
  color: T.text,
} as const;

function MessageList() {
  // Where the writer is looking: pages back from the newest, for one chat.
  // Held with the chat's id so switching chats starts at the newest page
  // without an effect to reset it.
  const [page, setPage] = useState({ chatId: "", back: 0 });

  // Sending always returns to the end — including an empty send, which grows
  // the sketch. Both go through this one action.
  useEffect(
    () =>
      store.subscribeEffect(matchesAction(uiChatSubmitUserMessage), () =>
        setPage((p) => (p.back === 0 ? p : { ...p, back: 0 })),
      ),
    [],
  );

  // Re-render on a change to what is SHOWN: identity, length, and the content
  // length of the messages in the window. Keyed over the window, not the whole
  // chat, so the cost of a streaming token does not grow with the transcript.
  useSlice((s: RootState) => {
    const c = activeSavedChat(s.chat);
    if (!c) return "";
    const back = page.chatId === c.id ? page.back : 0;
    const w = pageWindow(c.messages.length, back);
    return (
      `${c.id}::${c.messages.length}::` +
      c.messages
        .slice(w.start, w.end)
        .map((m) => `${m.id}:${m.content.length}`)
        .join(",")
    );
  });

  const chat = activeSavedChat(store.getState().chat);
  if (!chat) return null;
  const w = pageWindow(
    chat.messages.length,
    page.chatId === chat.id ? page.back : 0,
  );
  const go = (back: number) => setPage({ chatId: chat.id, back });

  // A `column-reverse` scroller: the first child sits at the bottom and the
  // scroll stays pinned there as new turns arrive, with no DOM scroll access.
  // Messages are reversed so the newest shown is the first message child.
  //
  // Keyed by INDEX, not message id: this renderer's keyed reconciliation
  // mishandles the insert-at-front that reversing causes on each new message.
  //
  // Both load-more buttons are always mounted and toggled with `display`: this
  // list re-renders from store subscriptions, and a conditionally rendered
  // element is left behind by a render that did not start in a JSX event.
  const reversed = chat.messages.slice(w.start, w.end).reverse();
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column-reverse",
        justifyContent: "flex-start",
        gap: "10px",
        padding: SP.md,
      }}
    >
      <button
        style={{ ...loadMoreStyle, display: w.hasNewer ? "block" : "none" }}
        onClick={() => go(w.back - 1)}
      >
        Load newer
      </button>
      <div
        style={{
          display: "flex",
          flexDirection: "column-reverse",
          gap: "10px",
        }}
      >
        {reversed.map((m, i) => (
          <Message key={i} chatId={chat.id} chat={chat} message={m} />
        ))}
      </div>
      <button
        style={{ ...loadMoreStyle, display: w.hasOlder ? "block" : "none" }}
        onClick={() => go(w.back + 1)}
      >
        Load older
      </button>
    </div>
  );
}
```

Leave `idKey` and the `Chat` shell as they are.

- [ ] **Step 4: Run, build, commit**

Run: `npx vitest run tests/ui/chat-paging.test.ts && npm run test && npm run build`
Expected: PASS. If `tests/ui/text-input-events.test.ts` or another source scan objects to `Chat.tsx`, the scan is right: fix the component, not the test.

```bash
git add src/ui/panels/chat/paging.ts src/ui/panels/chat/Chat.tsx tests/ui/chat-paging.test.ts
git commit -m "feat(chat): show 25 messages at a time, page with load-more, snap to the end on send"
```

- [ ] **Step 5: Measure, in NovelAI (manual; report the result, do not guess it)**

Load the built script into a story whose Scenario chat has 300 or more messages. Send a message and note whether the UI stalls while the reply streams. `idKey` in the `Chat` shell still joins every message id on each store update; if a stall remains, replace its body with `c.id + "::" + c.messages.length + ":" + (c.messages.at(-1)?.id ?? "")`, re-run the suite, and commit that as its own change. If no long chat is available, say so in the hand-off instead of claiming the lockup is fixed.

---

### Task 9: The wish in the Thread edit pane

**Files:**

- Modify: `src/ui/panels/world/ThreadEditPane.tsx:120-131,172-186,286-296`
- Test: `tests/ui/thread-source.test.ts`

**Interfaces:**

- Consumes: `threadWishSet` (Task 1).

- [ ] **Step 1: Write the failing test**

In `tests/ui/thread-source.test.ts`, under "the edit pane keeps the private half private", add (using the file's existing constant holding the pane's source text):

```ts
it("saves the wish through its own action, never the ledger's", () => {
  expect(pane).toMatch(
    /threadWishSet\(\{\s*threadId,\s*wish: wish\.value\.trim\(\)\s*\}\)/,
  );
  expect(pane).not.toMatch(/threadLedgerUpdated\(\{[^}]*wish/);
});

it("says who reads the wish", () => {
  expect(pane).toContain("Never shown to any model.");
});
```

Run: `npx vitest run tests/ui/thread-source.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

Import `threadWishSet` beside `threadLedgerUpdated`. After `const latent = useDraftField(…)` add `const wish = useDraftField(thread?.wish ?? "");` and add `wish: thread?.wish ?? "",` to the `seeded` object. In `onSave`, after the ledger block:

```ts
if (wish.value !== seeded.wish) {
  store.dispatch(threadWishSet({ threadId, wish: wish.value.trim() }));
}
```

After the private-notes `<textarea>`, before the Members comment:

```tsx
      {/* The writer's wish — read by no model at all. */}
      <span style={sectionLabel}>What you want to come of this</span>
      <span style={{ fontSize: "0.75em", color: T.textDisabled }}>
        Never shown to any model. A model told that something will happen writes
        it happening, so the Engine records the conditions for it and keeps the
        wish itself here.
      </span>
      <textarea
        placeholder="What would you like to see happen?"
        value={wish.value}
        onInput={(e) => wish.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
      />
```

- [ ] **Step 3: Run and commit**

Run: `npm run test && npm run build`
Expected: PASS.

```bash
git add src/ui/panels/world/ThreadEditPane.tsx tests/ui/thread-source.test.ts
git commit -m "feat(threads): the edit pane shows and saves a Thread's wish"
```

---

### Task 10: The probe

**Files:**

- Create: `tools/scenario-probe.naiscript`
- Create: `tests/tools/scenario-probe.test.ts`

**Interfaces:**

- Consumes: `SCENARIO_PROMPT`, `SCENARIO_REGISTERS` (Task 2).

- [ ] **Step 1: Write the drift test**

Create `tests/tools/scenario-probe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SCENARIO_PROMPT,
  SCENARIO_REGISTERS,
} from "../../src/core/utils/prompts";

/** The probe is a standalone script and cannot import from `src/`, so it
 *  carries its own copy of the prompt it measures. A probe measuring last
 *  month's prompt is worse than no probe. */
describe("tools/scenario-probe.naiscript measures the shipped prompt", () => {
  const probe = readFileSync("tools/scenario-probe.naiscript", "utf8");

  it.each([
    ["SCENARIO_PROMPT", SCENARIO_PROMPT],
    ["REGISTER", SCENARIO_REGISTERS.Gritty],
  ])("carries %s verbatim", (name, prompt) => {
    expect(probe).toContain(`const ${name} = ${JSON.stringify(prompt)};`);
  });
});
```

Run: `npx vitest run tests/tools/scenario-probe.test.ts`
Expected: FAIL, no such file.

- [ ] **Step 2: Write the probe**

Create `tools/scenario-probe.naiscript`. Generate the two constant lines with:

```bash
npx tsx -e 'import("./src/core/utils/prompts.ts").then((p) => { console.log("const SCENARIO_PROMPT = " + JSON.stringify(p.SCENARIO_PROMPT) + ";"); console.log("const REGISTER = " + JSON.stringify(p.SCENARIO_REGISTERS.Gritty) + ";"); })'
```

(if `tsx` is not installed, write a three-line vitest test that prints the same two lines, run it once, and delete it) and paste them where marked:

```js
/*---
compatibilityVersion: naiscript-1.0
id: 6d0e7c1b-2a54-4f0e-9b7d-3c5a8e21f4a9
name: Scenario Probe
version: 0.1.0
description: How often does a Scenario sketch keep a thing to come out of everything the story model is shown, at twenty runs per fixture?
memoryLimit: 8
---*/

// These two constants are copies of the shipped prompt and its Gritty register
// in src/core/utils/prompts.ts; tests/tools/scenario-probe.test.ts fails if
// they drift.
<<paste the two generated lines here>>

// 60 generations against a 2048-token-per-240s output bucket: it takes a while
// and will pause for budget. Read every count with its denominator.
const RUNS = 20;
const MODEL = "glm-4-6";
const PARAMS = { model: MODEL, max_tokens: 1536, temperature: 0.9, min_p: 0.05 };

// Fixtures use a glassworks and an observatory: unlike the prompt's canal, so
// no fixture is a copy of the example the prompt carries. Each thing to come
// carries an invented noun that nothing else in the seed uses.
const SEEDS = {
  ToCome:
    "A glassblower's widow runs the furnace with her late husband's apprentice. I want the apprentice to eventually smash the vessel they call the Quillane.",
  AlreadySo:
    "A glassblower's widow runs the furnace with her late husband's apprentice. Last winter the apprentice smashed the vessel they called the Quillane, and she has not spoken of it.",
  TwoWishes:
    "Two astronomers share one telescope on a mountain. I want the younger to end up publishing the Vessarine survey under her own name, and I want the older to finally leave the mountain.",
};

const messages = (seed) => [
  { role: "system", content: `${SCENARIO_PROMPT}\n\n${REGISTER}` },
  { role: "assistant", content: "TURN: SKETCH" },
  { role: "user", content: seed },
];

// Mirrors the five-segment THREAD regex in src/core/utils/crucible-command-parser.ts.
const THREAD = /^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\|([^|]*?)\|([^|]*?)\|([^|\]]*?)\]?\s*$/;
const CREATE = /^\[\s*CREATE\s+[A-Z]+\s+"([^"]+)"\s*\|\s*(.+?)\]?\s*$/;

// Everything the story model could be shown: every summary, and every state.
// Everything private: every latent and wish.
const read = (text) => {
  const shown = [];
  const wishes = [];
  let threads = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    const t = THREAD.exec(line);
    if (t) {
      threads++;
      shown.push(t[3]);
      wishes.push(t[5]);
      continue;
    }
    const c = CREATE.exec(line);
    if (c) shown.push(c[2]);
  }
  return { shown: shown.join("\n"), wishes: wishes.join("\n"), threads };
};

// Each fixture states its contract in one sentence; `holds` is that sentence.
const FIXTURES = [
  {
    name: "ToCome",
    contract: "a thing to come is in a wish and in nothing the story model is shown",
    seed: SEEDS.ToCome,
    holds: (text) => {
      const r = read(text);
      return /Quillane/.test(r.wishes) && !/smash/i.test(r.shown);
    },
  },
  {
    name: "AlreadySo",
    contract: "a thing already so is shown as fact and is in no wish",
    seed: SEEDS.AlreadySo,
    holds: (text) => {
      const r = read(text);
      return /Quillane/.test(r.shown) && !/Quillane/.test(r.wishes);
    },
  },
  {
    name: "TwoWishes",
    contract: "two things to come are each in a wish and neither is shown",
    seed: SEEDS.TwoWishes,
    holds: (text) => {
      const r = read(text);
      return (
        /Vessarine/.test(r.wishes) &&
        /leave/i.test(r.wishes) &&
        !/publish/i.test(r.shown) &&
        !/leaves? the mountain|left the mountain/i.test(r.shown)
      );
    },
  },
];

let report = "";

function log(line) {
  report += line + "\n";
  api.v1.log(line);
  void api.v1.ui.updateParts([{ id: "report", text: report }]);
}

async function runFixture(fixture) {
  let failing = 0;
  let firstFailure = "";
  for (let run = 0; run < RUNS; run++) {
    // One at a time: concurrent script generations are refused.
    const response = await api.v1.generate(messages(fixture.seed), PARAMS);
    const text = response.choices?.[0]?.text ?? "";
    if (!fixture.holds(text)) {
      failing++;
      if (!firstFailure) firstFailure = text;
    }
  }
  log(`${fixture.name}: ${failing} failing runs of ${RUNS} — ${fixture.contract}`);
  if (firstFailure) log(`  first failing output:\n${firstFailure}`);
}

async function runAll() {
  report = "";
  log(`Scenario probe — ${RUNS} runs per fixture on ${MODEL}`);
  for (const fixture of FIXTURES) await runFixture(fixture);
  log("done");
}

api.v1.ui.register([
  api.v1.ui.extension.scriptPanel({
    name: "Scenario Probe",
    content: [
      api.v1.ui.part.column({
        content: [
          api.v1.ui.part.button({
            text: "Run",
            callback: () => void runAll(),
            disabledWhileCallbackRunning: true,
          }),
          api.v1.ui.part.text({
            id: "report",
            text: "Press Run. Report each line as N failing runs of 20.",
            noTemplate: true,
            style: { whiteSpace: "pre-wrap", userSelect: "text" },
          }),
        ],
      }),
    ],
  }),
]);
```

The probe is the one place `updateParts` appears, as in `review-probe.naiscript`: it is a standalone tool, not `src/`.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run tests/tools/scenario-probe.test.ts`
Expected: PASS.

```bash
git add tools/scenario-probe.naiscript tests/tools/scenario-probe.test.ts
git commit -m "test(scenario): a probe for whether a sketch keeps a thing to come private"
```

- [ ] **Step 4: Run it, in NovelAI (manual; the writer runs it or it is reported as not run)**

Three counts come back, each "N failing runs of 20". Read the first failing output of each by hand: the sentinel catches a leaked noun or verb, not a paraphrase that avoids both. A failing fixture is fixed by the procedure in `external/Prompt Engineering Principles.md` ("Fixing a failing prompt"), starting from the failing run's own text, and every change to `SCENARIO_PROMPT` is followed by regenerating the probe's constants. Do not report the prompt as measured until these counts exist.

---

### Task 11: Docs, changelog, final verification

**Files:**

- Modify: `CLAUDE.md`, `CHANGELOG.md`

- [ ] **Step 1: `CLAUDE.md`**

- **Project:** replace the pipeline sentence with: "NAI Story Engine is a NovelAI script (.naiscript) that builds a Scenario — pressures, the entities under them and how things stand between them — from a few sentences, and keeps it true as the story is written. It authors conditions, never plots, arcs or goals: a model shown a destination writes the arrival."
- **State:** `slices/chat.ts` holds "Chat messages (Scenario, refine and summary sessions)"; `slices/foundation.ts` holds "Situation, intensity, contract, ATTG, style fields".
- **Threads:** add `wish` to the field list and this paragraph after the `latent` one: "**`wish` is what the writer wants to come about, and no generation reads it.** It is not a fact, so unlike `latent` it is never folded into `established` on conclusion. It is written by the Scenario chat's `THREAD` command and the Thread edit pane only; `latent-privacy.test.ts` holds its allow-list and `private-notes-sinks.test.ts` its sentinel." In the `latent` paragraph, replace the two sentences about the Forge's command staying in its chat and `formatBrainstormBlock` / `redactThreadPrivateNotes` with: "The Scenario chat's `[THREAD … | state | latent | wish]` command stays in its own transcript, and that transcript enters no other generation's prefix."
- **Threads, review bullet:** note that a Thread may have one member when the Scenario chat or the writer makes it, and that the review still admits only two or more.
- **Add a section "Scenario chat"** after Threads, stating: one chat type (`scenario`) on the command mechanism in `handlers/forge-chat.ts`; three turn kinds read from the transcript by `scenarioTurn`; a `THREAD` has exactly five segments and a short one is rejected with `THREAD_REPAIR`, because position is meaning; a same-title `THREAD` rewrites and an empty segment never erases; internal names keep "forge" for the mechanism.
- **Generation pipeline:** the context layering line drops "Story Prompt" wording about brainstorm if present, and add: "The chat transcript is not part of the prefix."
- **Memory quick-ref lines in `CLAUDE.md` do not exist; nothing else to change there.**

- [ ] **Step 2: `CHANGELOG.md`**

In the existing `[0.15.0]` section (the one the writer keeps; if a `[0.16.0]` section still sits above it, leave it and say so in the hand-off — merging it is the writer's call):

- **Added:** "Scenario chat: say what you want to see and the Engine sketches the pressures, people, places and Threads it can grow from. Later messages steer the sketch; an empty send grows it." / "A Thread can hold what you want to come of it. No model is ever shown it." / "Long chats show 25 messages at a time, with Load older and Load newer."
- **Changed:** "A Thread may have a single member." / "Foundation's Intent is now Situation: what is happening as the story opens, with no outcome named." / "Casting or discarding drafts no longer ends the chat."
- **Removed:** "Brainstorm and Forge chats, the Critic mode and Summarize — the Scenario chat replaces them. Existing Brainstorm and Forge sessions are not carried over." / "Foundation's Shape."

- [ ] **Step 3: Verify everything**

```bash
npm run format
git status --short        # only files this plan touched may be modified
npm run test
npm run build
grep -rn "updateParts" src   # must print nothing
```

If `npm run format` rewrites a file this plan did not touch, the formatter is wrong: run `npm ci` and format again; do not commit that diff.

- [ ] **Step 4: Commit**

```bash
git add -A CLAUDE.md CHANGELOG.md src tests
git commit -m "docs(scenario): CLAUDE.md and the 0.15.0 notes describe the Scenario chat"
```

Hand-off must state, each on its own line: whether Task 8 Step 5 (long-chat measurement) was done and what it showed; whether Task 10 Step 4 (the probe) was run and its three counts; and whether `uiChatSummarizeRequested` still has a trigger (Task 6 Step 3).
