# Scenario Chat Plan and Build Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Scenario chat into a Plan mode (conversation on the Creative model, builds nothing) and a Build mode (GLM, thinks out loud then writes commands), and render Build replies as collapsed pills.

**Architecture:** The mode lives in the chat's existing `subMode` field and is stamped on each assistant message. A Plan turn has its own message factory but targets the ordinary `chat` request type, so the existing `chatHandler` streams and commits it and never parses commands. A Build turn is the existing `forgeChat` request with a new prompt and context. Pills are a pure projection of the stored `forgeSegments` (or of a provisional stream parse while the reply is arriving), rendered by one new component.

**Tech Stack:** TypeScript, Preact JSX (NovelAI script runtime), nai-store, vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-scenario-plan-build-design.md` (amends `docs/superpowers/specs/2026-10-07-scenario-chat-design.md`).

## Global Constraints

- Target version stays `0.15.0`. Never stage or edit `project.yaml`; it carries the user's uncommitted edit.
- Never stage the untracked dotfiles in the repo root, `.claude/`, `.idea`, `.vscode`, or `external/script-types.d.ts`. Stage files by explicit path.
- Do not edit anything under `.claude/skills/`.
- All prompts are exported constants in `src/core/utils/prompts.ts`.
- `tests/core/engine/latent-privacy.test.ts` allow-lists (`latent`, `WISH_ALLOWED`) are not to be extended. A new file must not name the identifier `latent`. In prompts and UI labels the segment is called `private`.
- The chat transcript enters no other generation's prefix.
- `enable_thinking` is not used anywhere.
- No `any`. No `updateParts`. Text entry binds `onInput`. Never swap a component type at a fixed position: mount every variant and toggle `display`.
- Internal names keep "forge" (`forgeChat`, `forgeSegments`, `forge-chat-*.ts`).
- `npm run build` cannot run in the sandbox (no network). Verify with `npm run test` and `npx tsc --noEmit`. Do not disable the sandbox.
- Format with `npm run format` only if its `preformat` guard passes; if it rewrites files you did not touch, do not commit that diff.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Working tree starts with uncommitted changes to `src/core/utils/prompts.ts`, `tests/core/utils/prompts.test.ts`, `tools/scenario-probe.naiscript`, `tests/tools/scenario-probe.test.ts` and `CHANGELOG.md` (the 2026-10-07 small-sketch edit and probe fixes). Task 1 commits them as they are so later tasks start clean.

## Review Focus

1. **Rejections are lost when a Plan reply follows a Build reply.** `formatRejections` reads the last assistant reply; with two modes that is often a Plan reply with no segments. Expected: the next Build turn still sees what the last Build reply had rejected. Pinned in Task 3.
2. **A Plan reply that contains a bracketed command.** Xialong may imitate the commands it sees in the transcript. Expected: nothing is applied, no segments are stored, the text shows as written. Pinned in Task 4.
3. **Retry with the toggle on the other mode.** Expected: a reply is re-run in the mode that wrote it. Pinned in Task 4.
4. **A Build reply that is all thinking.** Expected: one thinking pill, nothing applied, and the reply is absent from later context. Pinned in Tasks 3 and 5.
5. **A Message instance reused for another message while pills are open** (the list is keyed by index and pages). Expected: the reused instance shows everything collapsed. Pinned in Task 5 by a source test on the reset key.

---

### Task 1: Commit the carried-over work; drop CRITIQUE; give action records a body and messages a mode

**Files:**

- Modify: `src/core/chat-types/types.ts`
- Modify: `src/core/utils/crucible-command-parser.ts`
- Modify: `src/core/store/effects/handlers/forge-chat.ts`
- Modify: `src/core/generation-journal.ts:255-256`, `src/core/utils/tag-parser.ts:30`
- Test: `tests/core/utils/crucible-command-parser.test.ts`, `tests/core/utils/command-parser.test.ts`, `tests/core/store/effects/handlers/forge-pipeline.test.ts`

**Interfaces:**

- Produces: `PillPart { label: string; text: string }`; `ForgeActionRecord.body?: PillPart[]`; `ChatMessage.mode?: "plan" | "build"`; `commandBody(cmd: ParsedCommand): PillPart[]` exported from the parser. `ForgeActionRecord.kind` no longer includes `"CRITIQUE"` and the record has no `text` field. `ParsedCommand` has no `CRITIQUE` member.

- [ ] **Step 1: Commit the carried-over working tree**

```bash
git add src/core/utils/prompts.ts tests/core/utils/prompts.test.ts tools/scenario-probe.naiscript tests/tools/scenario-probe.test.ts CHANGELOG.md
git commit -m "fix(scenario): a sketch opens with one pressure; the probe waits for budget and matches events, not nouns"
```

- [ ] **Step 2: Write the failing parser tests**

Add to `tests/core/utils/crucible-command-parser.test.ts`:

```ts
import {
  commandBody,
  parseCommands,
  parseForgeStream,
  walkForgeLines,
} from "../../../src/core/utils/crucible-command-parser";

describe("CRITIQUE is no longer a command", () => {
  it("reads a critique line as prose", () => {
    const line = "[CRITIQUE | The lock has no one on the towpath.]";
    expect(parseCommands(line)).toEqual([]);
    expect(walkForgeLines(line)).toEqual([{ kind: "prose", text: line }]);
  });
});

describe("commandBody", () => {
  const one = (text: string) => commandBody(parseCommands(text)[0]);

  it("gives a CREATE its type and summary", () => {
    expect(
      one('[CREATE CHARACTER "Hesper Vane" | Keeps Tolland Lock.]'),
    ).toEqual([
      { label: "Type", text: "CHARACTER" },
      { label: "Summary", text: "Keeps Tolland Lock." },
    ]);
  });

  it("gives a REVISE its summary", () => {
    expect(one('[REVISE "Hesper Vane" | Keeps the last lock.]')).toEqual([
      { label: "Summary", text: "Keeps the last lock." },
    ]);
  });

  it("gives a THREAD its cast and each segment that is not empty", () => {
    expect(
      one(
        '[THREAD "Half the House" | "Hesper Vane", "Corin Vane" | He sold his half. | | She floods the cut.]',
      ),
    ).toEqual([
      { label: "Cast", text: "Hesper Vane, Corin Vane" },
      { label: "State", text: "He sold his half." },
      { label: "Wish", text: "She floods the cut." },
    ]);
  });

  it("gives RENAME and DELETE nothing", () => {
    expect(one('[DELETE "The Mill"]')).toEqual([]);
    expect(one('[RENAME "Corin" → "Corin Vane"]')).toEqual([]);
  });

  it("is carried on a streamed action", () => {
    const { segments } = parseForgeStream(
      '[CREATE LOCATION "Tolland Lock House" | Damp plaster.]',
    );
    expect(segments[0]).toMatchObject({
      kind: "action",
      action: {
        body: [
          { label: "Type", text: "LOCATION" },
          { label: "Summary", text: "Damp plaster." },
        ],
      },
    });
  });
});
```

Merge the import with the file's existing import from the same module.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/core/utils/crucible-command-parser.test.ts`
Expected: FAIL, `commandBody` is not exported.

- [ ] **Step 4: Change the types**

In `src/core/chat-types/types.ts`:

```ts
/** One labelled part of what a command carried, shown when its pill is opened. */
export interface PillPart {
  label: string;
  text: string;
}

export interface ForgeActionRecord {
  kind: "CREATE" | "REVISE" | "DELETE" | "RENAME" | "THREAD" | "UNKNOWN";
  status: "applied" | "rejected" | "unrecognized";
  /** CREATE element type, e.g. "SYSTEM". */
  elementType?: string;
  /** Entity / thread / old name. */
  name?: string;
  /** RENAME target name. */
  newName?: string;
  /** Rejection or unrecognized detail (reason, or the raw line). */
  reason?: string;
  /** What the command carried, for display. Absent on records stored before
   *  pills existed. */
  body?: PillPart[];
}
```

Add to `ChatMessage`, after `forgeSegments`:

```ts
  /** Which Scenario mode wrote this assistant message. Absent on messages
   *  from before the modes existed, which render as plain text. */
  mode?: "plan" | "build";
```

- [ ] **Step 5: Change the parser**

In `src/core/utils/crucible-command-parser.ts`:

1. Delete `CritiqueCommand`, its member of the `ParsedCommand` union, the `"CRITIQUE"` entry of `KNOWN_COMMAND_VERBS`, the `critiqueMatch` block in `parseCommandAt`, the `case "CRITIQUE"` in `describeForgeCommand` and in `serializeForgeCommand`, and `CRITIQUE|` from the regex in `isCommandLine`. Remove the `[CRITIQUE | text]` line from the header comment.
2. Add, above `describeForgeCommand`:

```ts
/** What a command carried, as labelled parts for its pill. Empty segments are
 *  left out; RENAME and DELETE carry nothing beyond their label. */
export function commandBody(cmd: ParsedCommand): PillPart[] {
  const parts = (pairs: [string, string][]): PillPart[] =>
    pairs
      .filter(([, text]) => text.trim() !== "")
      .map(([label, text]) => ({ label, text: text.trim() }));
  switch (cmd.kind) {
    case "CREATE":
      return parts([
        ["Type", cmd.elementType.toUpperCase()],
        ["Summary", cmd.content],
      ]);
    case "REVISE":
      return parts([["Summary", cmd.content]]);
    case "THREAD":
      return parts([
        ["Cast", cmd.memberNames.join(", ")],
        ["State", cmd.state],
        ["Private", cmd.latent],
        ["Wish", cmd.wish],
      ]);
    default:
      return [];
  }
}
```

Import `PillPart` alongside the file's existing type import from `../chat-types/types`.

3. In `describeForgeCommand`, add `body: commandBody(cmd)` to the records returned for `CREATE`, `REVISE` and `THREAD`.

- [ ] **Step 6: Change the handler, journal and tag parser**

In `src/core/store/effects/handlers/forge-chat.ts`:

- In `executeForgeCommand`'s `reviseOnly` branch, replace `cmd.kind === "CRITIQUE" || cmd.kind === "DONE"` with `cmd.kind === "DONE"`.
- Delete the `case "CRITIQUE":` arm that returns `{ kind: "CRITIQUE", status: "applied", text: cmd.text }`.
- In `buildForgeSegments`, replace `segments.push({ kind: "action", action });` with:

```ts
segments.push({
  kind: "action",
  action: { ...action, body: commandBody(tok.command) },
});
```

and import `commandBody` from the parser.

In `src/core/generation-journal.ts` delete the `case "CRITIQUE":` arm (two lines). In `src/core/utils/tag-parser.ts` delete the `CRITIQUE: "🔍",` entry.

- [ ] **Step 7: Fix the tests that named CRITIQUE**

Run: `npx tsc --noEmit` and `npm run test`. In `tests/core/utils/command-parser.test.ts`, `tests/core/utils/crucible-command-parser.test.ts` and `tests/core/store/effects/handlers/forge-pipeline.test.ts`, delete every test whose subject is parsing, serializing or executing a `CRITIQUE`, and remove `CRITIQUE` lines from fixtures of other tests where the assertion counts commands or segments (adjust the expected count by the number removed). Leave `tests/core/utils/forge-chat-strategy.test.ts` and `tests/core/chat-types/scenario.test.ts` failing to type-check only if they do; they are rewritten in Tasks 3 and 4. If they fail, mark the affected `describe` blocks `describe.skip` with the comment `// rewritten in Task 3` or `// rewritten in Task 4`.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc exits 0; all tests pass (skipped blocks aside).

- [ ] **Step 9: Commit**

```bash
git add src/core/chat-types/types.ts src/core/utils/crucible-command-parser.ts src/core/store/effects/handlers/forge-chat.ts src/core/generation-journal.ts src/core/utils/tag-parser.ts tests/core/utils tests/core/store/effects/handlers/forge-pipeline.test.ts tests/core/chat-types/scenario.test.ts
git commit -m "refactor(scenario): CRITIQUE is gone; an action record carries what its command said"
```

---

### Task 2: The Plan and Build prompts

**Files:**

- Modify: `src/core/utils/prompts.ts`
- Test: `tests/core/utils/prompts.test.ts`

**Interfaces:**

- Produces: `SCENARIO_PLAN_PROMPT`, `SCENARIO_PLAN_REGISTERS: Record<RegisterKey, string>`, `buildScenarioPlanPrompt(level: RegisterKey): string`, `SCENARIO_BUILD_PROMPT`, `SCENARIO_BUILD_REGISTERS: Record<RegisterKey, string>`, `buildScenarioBuildPrompt(level: RegisterKey): string`, `SCENARIO_BUILD_INSTRUCTION`, `XIALONG_STYLE.scenarioPlan`.
- The old `SCENARIO_PROMPT`, `SCENARIO_REGISTERS`, `buildScenarioPrompt` and `SCENARIO_GROW_INSTRUCTION` stay exported until Task 7.

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/utils/prompts.test.ts`:

```ts
import {
  INTENSITY_LEVEL_LABELS,
  SCENARIO_BUILD_INSTRUCTION,
  SCENARIO_BUILD_PROMPT,
  SCENARIO_BUILD_REGISTERS,
  SCENARIO_PLAN_PROMPT,
  SCENARIO_PLAN_REGISTERS,
  XIALONG_STYLE,
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
} from "../../../src/core/utils/prompts";

describe("the Scenario Plan prompt", () => {
  it("talks and writes no commands", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain("You are talking, not building.");
    expect(SCENARIO_PLAN_PROMPT).not.toMatch(/\[(CREATE|REVISE|THREAD)\b/);
  });

  it("works backwards from an ending and proposes none", () => {
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "what must already be true on the first page for that to be possible?",
    );
    expect(SCENARIO_PLAN_PROMPT).toContain(
      "Do not propose plots, scenes in sequence or endings of your own.",
    );
  });

  it("has a register for every intensity and for none", () => {
    for (const level of [...INTENSITY_LEVEL_LABELS, "unset"] as const) {
      expect(buildScenarioPlanPrompt(level)).toBe(
        `${SCENARIO_PLAN_PROMPT}\n\n${SCENARIO_PLAN_REGISTERS[level]}`,
      );
    }
  });

  it("has a Xialong chat style", () => {
    expect(XIALONG_STYLE.scenarioPlan).toMatch(/^\[ Style: .*chat.* \]$/);
  });
});

describe("the Scenario Build prompt", () => {
  it("thinks out loud before the commands", () => {
    const think = SCENARIO_BUILD_PROMPT.indexOf("Think out loud first");
    const commands = SCENARIO_BUILD_PROMPT.indexOf("COMMANDS:");
    expect(think).toBeGreaterThan(-1);
    expect(commands).toBeGreaterThan(think);
  });

  it("builds only what the conversation supports", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "Build only what the conversation supports.",
    );
  });

  it("has no critique and names the hidden segment private", () => {
    expect(SCENARIO_BUILD_PROMPT).not.toContain("CRITIQUE");
    expect(SCENARIO_BUILD_PROMPT).toContain("| state | private | wish]");
    expect(SCENARIO_BUILD_PROMPT).not.toContain("latent");
  });

  it("tells the model to correct a rejected command", () => {
    expect(SCENARIO_BUILD_PROMPT).toContain(
      "If [REJECTED LAST TURN] is present, correct each command as its line says; where the line says a thing cannot be done, do not write that command again.",
    );
  });

  it("treats the register as a ceiling", () => {
    for (const level of [...INTENSITY_LEVEL_LABELS, "unset"] as const) {
      expect(SCENARIO_BUILD_REGISTERS[level]).toMatch(/at most/);
      expect(buildScenarioBuildPrompt(level)).toBe(
        `${SCENARIO_BUILD_PROMPT}\n\n${SCENARIO_BUILD_REGISTERS[level]}`,
      );
    }
  });

  it("exports the instruction an empty send stands for", () => {
    expect(SCENARIO_BUILD_INSTRUCTION).toBe("Build what we have discussed.");
  });
});
```

Merge the import with the existing one.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/utils/prompts.test.ts`
Expected: FAIL, the new exports do not exist.

- [ ] **Step 3: Add the prompts**

In `src/core/utils/prompts.ts`, after `SCENARIO_GROW_INSTRUCTION`:

```ts
// ── Scenario chat: Plan talks, Build records ────────────────────────────────

export const SCENARIO_PLAN_PROMPT = `You are a sharp creative collaborator helping a writer work out a scenario: the pressures on a world, the people and places under them, and how things stand between them when the story opens. You are enthusiastic about ideas that work and honest about ideas that do not yet.

You are talking, not building. Another turn records what the two of you settle on, so write no bracketed commands and no lists of entries.

The writer may talk about anything, including where they want the story to go. When they describe an arc, an ending or a turn, take it seriously and work backwards from it: what must already be true on the first page for that to be possible? Who holds what, who owes whom, what cannot both be kept? Offer that, as specifics. Do not propose plots, scenes in sequence or endings of your own.

When the material is thin, find the fork: the one decision about this world that everything else follows from, and name it.
When it has a shape but no texture, add one specific thing: a person, a place, a habit, a debt.
When it is developed, follow an implication through to something the writer has not thought of.

The context block lists what has been built so far under [POOL], [LIVE] and [THREADS]. Refer to those by name, and do not read them back.

Offer something concrete, then ask the one question whose answer would change the most. Two to four sentences. No lists. Talk like a collaborator, think like a writer.`;

export const SCENARIO_PLAN_REGISTERS: Record<RegisterKey, string> = {
  unset: `REGISTER, not yet set: You do not know how much pressure this world is under. Add no danger the writer has not asked for. If the conversation has not shown whether these people can walk away, that is the question to ask.`,
  Cozy: `REGISTER, Cozy: Comfort is the default and no one is in peril. What keeps this world turning is warmth, routine and lived-in texture, so offer the regular, the habit, the corner of the room. Never add conflict or danger the writer has not asked for.`,
  Grounded: `REGISTER, Grounded: Pressure at the scale of a life: money, time, obligation, a relationship being worn down. Every obstacle has a way through, and no one is ruined by it.`,
  Gritty: `REGISTER, Gritty: Stakes that last. Offer binds that set two things someone values against each other, where walking away is possible and costs something real. Ground each in a person, not a spectacle.`,
  Noir: `REGISTER, Noir: The world is rigged. Offer pressures with hooks in everyone under them, where leaving means losing what they have built and no position is clean.`,
  Nightmare: `REGISTER, Nightmare: The system is hostile and safety is assured for no one. Offer pressures from different directions, and shelters held by something that wants a price.`,
};

export function buildScenarioPlanPrompt(level: RegisterKey): string {
  return `${SCENARIO_PLAN_PROMPT}\n\n${SCENARIO_PLAN_REGISTERS[level]}`;
}

export const SCENARIO_BUILD_PROMPT = `You are the Scenario Engine's builder. A writer and a collaborator have been talking about a story. You record what they settled on as the conditions the story can grow from: pressures, the people and places under them, and how things stand between them. You never record a plot, an arc, a goal or an ending. Another model will continue this story from a blank page, and it acts on whatever it is shown: told that something will happen, it writes it happening at once, or as already done. So everything you record says only what is so when the story opens.

The context block above the conversation lists the drafts under [POOL], the cast under [LIVE], and [THREADS]. The writer's last message says what to build.

Think out loud first, in plain sentences, answering in order:
1. What did the conversation settle? Name each person, place, pressure and standing between people that the writer raised or agreed to. Leave out what the collaborator offered and the writer did not take up.
2. Which of those is already under [POOL], [LIVE] or [THREADS]? Those need no command unless later talk changed them.
3. For each thing the writer wants, is it already so when the story opens? YES: it is recorded as fact, in a summary or a THREAD's state. NO: it is something to come. What is true now that makes it possible? That is what is recorded, and the thing itself goes in the wish segment of the THREAD whose cast it concerns, and nowhere else.

Then write the commands, one per line, and stop.

Build only what the conversation supports. Write nothing the conversation did not raise: no extra people to fill a town, no place nobody mentioned. If there is nothing new to record, say so and write no command.

COMMANDS:
[CREATE <TYPE> "<Name>" | summary of one to three sentences]
[REVISE "<Name>" | new summary]
[RENAME "<Old>" → "<New>"]
[DELETE "<Name>"]
[THREAD "<Title>" | "<A>", "<B>" | state | private | wish]
<TYPE> is CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION or TOPIC.
A SITUATION is a pressure. Its summary reads "what is happening; what keeps it from settling", and stops there. The REGISTER note gives the most SITUATIONs the whole scenario may hold, so count the ones under [POOL] and [LIVE] before writing another.
A THREAD names one to four elements and always has all five segments. state is how things stand now, and it is shown to the story model. private is what is true now and hidden, owed or unspoken; the story model never sees it. wish is what the writer wants to come about; the story model never sees it. Leave private or wish empty between its bars when there is none. A THREAD whose title is already under [THREADS] rewrites that Thread's state, private and wish: a segment left empty keeps what is stored, and the cast does not change.
Only drafts under [POOL] may be revised, renamed or deleted. Never recreate a name under [TOMBSTONES]. If [REJECTED LAST TURN] is present, correct each command as its line says; where the line says a thing cannot be done, do not write that command again.

EXAMPLE. The conversation settled on Hesper Vane, a lock-keeper on a dying canal; her brother Corin, who has already sold his half of the lock house to the barge company; and that the writer wants her to end up flooding the cut to stop them. Nothing is built yet.
Settled: Hesper Vane, Corin Vane, the lock house, and the company buying up the cut. None of it is under [POOL]. Corin's sale has happened, so it is fact. The flooding is to come: what is true now is that Hesper alone holds the sluice keys, so that is recorded and the flooding goes in the wish.
[CREATE SITUATION "The Company's Offer" | The barge company is buying the lock houses along the cut to close it and take the water for its mills; every keeper who sells makes the next refusal cost more.]
[CREATE CHARACTER "Hesper Vane" | Keeps Tolland Lock as her mother did. Rope-scarred palms, and a ring of sluice keys on her belt that she counts by touch.]
[CREATE CHARACTER "Corin Vane" | Her brother. Clean boots on a towpath. Carries the company's survey book under his arm.]
[CREATE LOCATION "Tolland Lock House" | Damp plaster and coal smoke; one kitchen and two owners. The sluice wheel stands in the yard where anyone on the towpath can see who turns it.]
[THREAD "Half the House" | "Hesper Vane", "Corin Vane" | Corin Vane has sold his half of Tolland Lock House to the barge company. Hesper Vane holds the only set of sluice keys. | Corin Vane has not told Hesper Vane that the company has already paid him. | Hesper Vane floods the cut to stop the company.]`;

export const SCENARIO_BUILD_REGISTERS: Record<RegisterKey, string> = {
  unset: `REGISTER, not yet set: Record things at the pressure the conversation implies, with three pressures at most in the whole scenario. Add no danger the writer has not asked for.`,
  Cozy: `REGISTER, Cozy: Two pressures at most in the whole scenario, and none is required. A pressure here is friction of preference or circumstance: two people who want the same quiet corner, a habit that no longer fits. Nothing threatens anyone, nobody is malicious, and nothing is lost for good.`,
  Grounded: `REGISTER, Grounded: Three pressures at most in the whole scenario, each at the scale of a life: money, time, obligation, a relationship being worn down. Each is a real obstacle with a way through, and no one is ruined by it.`,
  Gritty: `REGISTER, Gritty: Three pressures at most in the whole scenario, with stakes that last. Each sets two things someone values against each other, where walking away is possible and costs something real.`,
  Noir: `REGISTER, Noir: Three pressures at most in the whole scenario, and they trap. Each has hooks in everyone under it, and leaving means losing what they have built. No position on the board is clean.`,
  Nightmare: `REGISTER, Nightmare: Four pressures at most in the whole scenario, from a system that is hostile, each pressing from a different direction. Safety is assured for no one.`,
};

export function buildScenarioBuildPrompt(level: RegisterKey): string {
  return `${SCENARIO_BUILD_PROMPT}\n\n${SCENARIO_BUILD_REGISTERS[level]}`;
}

/** The user turn an empty Build send stands for. */
export const SCENARIO_BUILD_INSTRUCTION = `Build what we have discussed.`;
```

Add to the `XIALONG_STYLE` object:

```ts
  scenarioPlan: "[ Style: chat, creative-partner, generative, direct ]",
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/core/utils/prompts.test.ts tests/core/engine/latent-privacy.test.ts && npx tsc --noEmit`
Expected: PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/prompts.ts tests/core/utils/prompts.test.ts
git commit -m "feat(scenario): Plan and Build prompts"
```

---

### Task 3: Plan and Build strategies

**Files:**

- Modify: `src/core/utils/forge-chat-strategy.ts`
- Test: `tests/core/utils/forge-chat-strategy.test.ts`

**Interfaces:**

- Consumes: `buildScenarioPlanPrompt`, `buildScenarioBuildPrompt`, `SCENARIO_BUILD_INSTRUCTION`, `XIALONG_STYLE.scenarioPlan` (Task 2); `ChatMessage.mode` (Task 1); `isXialongMode`, `buildModelParams` from `./config`; `parseCommands`, `serializeForgeCommand` from the parser.
- Produces:
  - `scenarioConversation(messages: ChatMessage[], placeholderId?: string): Message[]`
  - `buildScenarioBuildStrategy(getState: () => RootState, queuedChat: Chat, assistantMessageId: string): GenerationStrategy` (target type `forgeChat`, request id `scenario-<chatId>-<messageId>`)
  - `buildScenarioPlanStrategy(getState: () => RootState, queuedChat: Chat, assistantMessageId: string): Promise<GenerationStrategy>` (target type `chat`, request id `chat-<chatId>-<messageId>`)
  - `formatRejections(messages: ChatMessage[]): string` (unchanged signature)
- Removes: `scenarioTurn`, `ScenarioTurn`, `extractLastCritique`, `buildScenarioTurnStrategy`.

- [ ] **Step 1: Write the failing tests**

In `tests/core/utils/forge-chat-strategy.test.ts`, keep `makeState`, `msg`, `chatOf` and every test of `buildForgeCleanupStrategy`. Delete every test of `scenarioTurn`, `extractLastCritique` and `buildScenarioTurnStrategy`, and the `applied`/`sketched` helpers if nothing else uses them. Replace the imports of the removed names and add:

```ts
import {
  buildForgeCleanupStrategy,
  buildScenarioBuildStrategy,
  buildScenarioPlanStrategy,
  formatRejections,
  scenarioConversation,
} from "../../../src/core/utils/forge-chat-strategy";
import {
  FORGE_CLEANUP_PROMPT,
  SCENARIO_BUILD_INSTRUCTION,
  XIALONG_STYLE,
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
} from "../../../src/core/utils/prompts";

const BUILT =
  'So the sale is fact and the flooding is to come.\n[CREATE CHARACTER "Hesper Vane" | Keeps Tolland Lock.]\nAnd one thread.\n[THREAD "Half the House" | "Hesper Vane" | He sold his half. | He was paid. | She floods the cut.]';

const run = async (strategy: {
  messageFactory?: () => Promise<{ messages: Message[] }>;
}) => (await strategy.messageFactory!()).messages;

describe("the conversation a Scenario turn is shown", () => {
  it("reduces a Build reply to its commands", () => {
    const out = scenarioConversation([
      msg("u1", "user", "A lock-keeper."),
      msg("a1", "assistant", BUILT, { mode: "build" }),
    ]);
    expect(out[1]).toEqual({
      role: "assistant",
      content:
        '[CREATE CHARACTER "Hesper Vane" | Keeps Tolland Lock.]\n[THREAD "Half the House" | "Hesper Vane" | He sold his half. | He was paid. | She floods the cut.]',
    });
    expect(JSON.stringify(out)).not.toContain("the flooding is to come");
  });

  it("leaves out a Build reply that wrote no command", () => {
    const out = scenarioConversation([
      msg("u1", "user", "A lock-keeper."),
      msg("a1", "assistant", "Nothing new to record.", { mode: "build" }),
    ]);
    expect(out).toEqual([{ role: "user", content: "A lock-keeper." }]);
  });

  it("keeps Plan replies and older replies whole", () => {
    const out = scenarioConversation([
      msg("a1", "assistant", "What does she owe him?", { mode: "plan" }),
      msg("a2", "assistant", 'An old reply [CREATE CHARACTER "X" | y]'),
    ]);
    expect(out.map((m) => m.content)).toEqual([
      "What does she owe him?",
      'An old reply [CREATE CHARACTER "X" | y]',
    ]);
  });

  it("drops the placeholder, scrubs and empty messages", () => {
    const out = scenarioConversation(
      [
        msg("u1", "user", "A lock-keeper."),
        msg("s1", "assistant", '[REVISE "X" | y]', { messageKind: "cleanup" }),
        msg("e1", "assistant", "  "),
        msg("p1", "assistant", "", { mode: "build" }),
      ],
      "p1",
    );
    expect(out).toEqual([{ role: "user", content: "A lock-keeper." }]);
  });
});

describe("rejections survive a Plan reply", () => {
  it("reads the last reply that has segments, not the last reply", () => {
    const rejected = {
      forgeSegments: [
        {
          kind: "action",
          action: {
            kind: "THREAD",
            status: "rejected",
            name: "T",
            reason: "Name a known element.",
          },
        },
      ],
    };
    const text = formatRejections([
      msg("a1", "assistant", "[THREAD …]", { mode: "build", ...rejected }),
      msg("u1", "user", "Hm."),
      msg("a2", "assistant", "What about the mills?", { mode: "plan" }),
    ] as never);
    expect(text).toContain('- THREAD "T": Name a known element.');
  });
});

describe("a Build turn", () => {
  const chat = chatOf([
    msg("u1", "user", "A lock-keeper on a dying canal."),
    msg("a1", "assistant", "What does she owe her brother?", { mode: "plan" }),
    msg("p1", "assistant", "", { mode: "build" }),
  ]);

  it("opens with the Build prompt at the story's register", async () => {
    const state = makeState({
      chat: { chats: [chat], activeChatId: "c1", refineChat: null },
    } as never);
    const messages = await run(
      buildScenarioBuildStrategy(() => state, chat, "p1"),
    );
    expect(messages[0]).toEqual({
      role: "system",
      content: buildScenarioBuildPrompt("unset"),
    });
  });

  it("stands an empty send on the fixed instruction", async () => {
    const state = makeState({
      chat: { chats: [chat], activeChatId: "c1", refineChat: null },
    } as never);
    const messages = await run(
      buildScenarioBuildStrategy(() => state, chat, "p1"),
    );
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: SCENARIO_BUILD_INSTRUCTION,
    });
  });

  it("lets the writer's own last message direct the build", async () => {
    const directed = chatOf([
      ...chat.messages.slice(0, 2),
      msg("u2", "user", "Just the two of them for now."),
      msg("p1", "assistant", "", { mode: "build" }),
    ]);
    const state = makeState({
      chat: { chats: [directed], activeChatId: "c1", refineChat: null },
    } as never);
    const messages = await run(
      buildScenarioBuildStrategy(() => state, directed, "p1"),
    );
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "Just the two of them for now.",
    });
  });

  it("has no TURN line and no critique block", async () => {
    const state = makeState({
      chat: { chats: [chat], activeChatId: "c1", refineChat: null },
    } as never);
    const text = JSON.stringify(
      await run(buildScenarioBuildStrategy(() => state, chat, "p1")),
    );
    expect(text).not.toContain("TURN:");
    expect(text).not.toContain("PREVIOUS CRITIQUE");
  });

  it("targets the command handler", () => {
    const s = buildScenarioBuildStrategy(() => makeState(), chat, "p1");
    expect(s.target).toEqual({
      type: "forgeChat",
      chatId: "c1",
      messageId: "p1",
    });
    expect(s.requestId).toBe("scenario-c1-p1");
  });
});

describe("a Plan turn", () => {
  const chat = chatOf([
    msg("u1", "user", "A lock-keeper on a dying canal."),
    msg("a1", "assistant", BUILT, { mode: "build" }),
    msg("u2", "user", "What about the mills?"),
    msg("p1", "assistant", "", { mode: "plan" }),
  ]);
  const state = () =>
    makeState({
      chat: { chats: [chat], activeChatId: "c1", refineChat: null },
    } as never);

  it("opens with the Plan prompt and targets the ordinary chat handler", async () => {
    const s = await buildScenarioPlanStrategy(state, chat, "p1");
    expect(s.target).toEqual({ type: "chat", chatId: "c1", messageId: "p1" });
    expect(s.requestId).toBe("chat-c1-p1");
    expect((await run(s))[0]).toEqual({
      role: "system",
      content: buildScenarioPlanPrompt("unset"),
    });
  });

  it("sees what Build wrote as commands, never its thinking, tombstones or rejections", async () => {
    const text = JSON.stringify(
      await run(await buildScenarioPlanStrategy(state, chat, "p1")),
    );
    expect(text).toContain("Hesper Vane");
    expect(text).not.toContain("the flooding is to come");
    expect(text).not.toContain("[TOMBSTONES]");
    expect(text).not.toContain("[REJECTED LAST TURN]");
  });

  it("ends on the writer's message when the creative model is GLM", async () => {
    const messages = await run(
      await buildScenarioPlanStrategy(state, chat, "p1"),
    );
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "What about the mills?",
    });
  });

  describe("on Xialong", () => {
    useCreativeModel("xialong-v1");
    it("prefills the chat style and stops at the next style block", async () => {
      const s = await buildScenarioPlanStrategy(state, chat, "p1");
      expect(s.assistantPrefill).toBe(XIALONG_STYLE.scenarioPlan);
      const built = await s.messageFactory!();
      expect(built.messages[built.messages.length - 1]).toEqual({
        role: "assistant",
        content: XIALONG_STYLE.scenarioPlan,
      });
      expect(built.params?.stop).toEqual(["</think>", "\n[ Style"]);
    });
  });
});
```

Read `tests/helpers/creative-model.ts` first and call `useCreativeModel` the way its other callers do; adjust the argument if its signature differs.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/utils/forge-chat-strategy.test.ts`
Expected: FAIL, the new exports do not exist.

- [ ] **Step 3: Rewrite the strategy module**

In `src/core/utils/forge-chat-strategy.ts`:

1. Replace the header comment's second paragraph with:

```ts
 * Two kinds of turn share one chat. A Plan turn is a conversation: the Plan
 * prompt, the Foundation and Setting, what is built so far, and the transcript;
 * it targets the ordinary chat handler and applies nothing. A Build turn is the
 * Build prompt, the same premise, a context block code computes fresh each turn
 * ([POOL], [LIVE], [THREADS], [TOMBSTONES], [REJECTED LAST TURN]), then the
 * transcript; its reply is thinking and commands. Neither turn is shown the
 * thinking of an earlier Build reply (`scenarioConversation`).
```

2. Delete `ScenarioTurn`, `scenarioTurn`, `extractLastCritique`. Change the imports from `./prompts` to `buildScenarioBuildPrompt, buildScenarioPlanPrompt, normalizeRegisterKey, FORGE_CLEANUP_PROMPT, SCENARIO_BUILD_INSTRUCTION, XIALONG_STYLE`, from `./config` to `buildModelParams, isXialongMode`, and from the parser to `parseCommands, serializeForgeCommand`.

3. Below `conversation`, add:

```ts
/** The conversation as a later turn is shown it. A Build reply is reduced to
 *  the commands it wrote: its thinking is GLM's reasoning, which should steer
 *  neither the next Build nor the voice Plan answers in. One that wrote no
 *  command has nothing left and is left out. */
export function scenarioConversation(
  messages: ChatMessage[],
  placeholderId?: string,
): Message[] {
  return conversation(messages, placeholderId).flatMap((m) => {
    if (m.role === "assistant" && m.mode === "build") {
      const commands = parseCommands(m.content)
        .map(serializeForgeCommand)
        .join("\n");
      return commands ? [{ role: m.role, content: commands }] : [];
    }
    return [{ role: m.role, content: m.content }];
  });
}
```

4. In `formatRejections`, replace the two lines that pick the last reply with:

```ts
  // The last reply that was read for commands, not the last reply: a Plan
  // reply after a Build has no segments, and the rejection must outlive it.
  const built = replies(messages).filter((m) => m.forgeSegments);
  const lines = (built[built.length - 1]?.forgeSegments ?? []).flatMap((s) => {
```

5. Replace `buildScenarioTurnStrategy` with:

```ts
async function premiseOf(state: RootState): Promise<Message[]> {
  const premise = [formatFoundationBlock(state), await formatSettingBlock()]
    .filter((b) => b.length > 0)
    .join("\n\n");
  return premise ? [{ role: "system", content: premise }] : [];
}

function contextBlock(blocks: string[]): Message[] {
  const present = blocks.filter((b) => b.length > 0);
  return present.length > 0
    ? [{ role: "assistant", content: present.join("\n\n") }]
    : [];
}

export function buildScenarioBuildStrategy(
  getState: () => RootState,
  queuedChat: Chat,
  assistantMessageId: string,
): GenerationStrategy {
  const factory = async () => {
    const state = getState();
    // The chat as it stands now: a scrub queued ahead of this turn, or a
    // message pruned while it waited, changed it after the strategy was built.
    const chat =
      state.chat.chats.find((c) => c.id === queuedChat.id) ?? queuedChat;
    const prior = conversation(chat.messages, assistantMessageId);
    // The writer's own last message directs the build. Anything else at the
    // tail is an empty send, which stands for the fixed instruction.
    const directed = prior[prior.length - 1]?.role === "user";

    const messages: Message[] = [
      {
        role: "system",
        content: buildScenarioBuildPrompt(
          normalizeRegisterKey(state.foundation.intensity?.level),
        ),
      },
      ...(await premiseOf(state)),
      // No truncation anywhere in this block: a summary cut short is a draft
      // the model revises from half its text.
      ...contextBlock([
        formatPool(state, chat.id),
        formatLive(state),
        formatThreads(state),
        formatTombstones(state, chat.id),
        formatRejections(prior),
      ]),
      ...scenarioConversation(chat.messages, assistantMessageId),
      ...(directed
        ? []
        : [{ role: "user" as const, content: SCENARIO_BUILD_INSTRUCTION }]),
    ];

    return {
      messages,
      // "instruct": a Build turn emits a strict bracket grammar, and every
      // command that misses it is an entry the writer does not get.
      // 1024 per call, not the whole 2048 bucket: a generation is refused
      // until the bucket holds max_tokens, and the continuation below carries
      // a reply that runs past one call.
      params: await buildModelParams(
        { max_tokens: 1024, temperature: 0.9, min_p: 0.05 },
        "instruct",
      ),
    };
  };

  return {
    requestId: `scenario-${queuedChat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "forgeChat",
      chatId: queuedChat.id,
      messageId: assistantMessageId,
    },
    prefillBehavior: "trim",
    // No prefill: a reply opens with thinking. Cut off by the token cap it
    // stops mid-command and the last action is lost, so it continues.
    continuation: { maxCalls: 4 },
  };
}

/** A Plan turn: a conversation on the creative model. It targets the ordinary
 *  chat handler, which commits the text and never reads it for commands. */
export async function buildScenarioPlanStrategy(
  getState: () => RootState,
  queuedChat: Chat,
  assistantMessageId: string,
): Promise<GenerationStrategy> {
  const xialong = await isXialongMode();
  const prefill = xialong ? XIALONG_STYLE.scenarioPlan : undefined;

  const factory = async () => {
    const state = getState();
    const chat =
      state.chat.chats.find((c) => c.id === queuedChat.id) ?? queuedChat;
    const messages: Message[] = [
      {
        role: "system",
        content: buildScenarioPlanPrompt(
          normalizeRegisterKey(state.foundation.intensity?.level),
        ),
      },
      ...(await premiseOf(state)),
      ...contextBlock([
        formatPool(state, chat.id),
        formatLive(state),
        formatThreads(state),
      ]),
      ...scenarioConversation(chat.messages, assistantMessageId),
      ...(prefill ? [{ role: "assistant" as const, content: prefill }] : []),
    ];
    return {
      messages,
      // Small first call so it clears the token bucket; the continuation
      // below extends a reply that runs long.
      params: await buildModelParams({
        max_tokens: 512,
        temperature: 1.0,
        ...(xialong ? { stop: ["</think>", "\n[ Style"] } : {}),
      }),
    };
  };

  return {
    requestId: `chat-${queuedChat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "chat",
      chatId: queuedChat.id,
      messageId: assistantMessageId,
    },
    prefillBehavior: "trim",
    assistantPrefill: prefill,
    // Xialong sometimes returns an empty think block and nothing else; a
    // reply under this floor is re-rolled. "Cut the prologue." is a real one.
    minResponseLength: xialong ? 4 : undefined,
    continuation: { maxCalls: 5 },
  };
}
```

If `buildModelParams`'s first parameter type rejects `stop`, read its signature in `src/core/utils/config.ts` and pass `stop` the way `chat-strategy.ts` supplies it (returned from the factory beside the model params).

6. Fix the two callers that still import `buildScenarioTurnStrategy`/`buildScenarioPrompt` so the tree type-checks: in `src/core/store/effects/forge-chat-effects.ts` rename the import and call to `buildScenarioBuildStrategy`; in `src/core/chat-types/scenario.ts` change `systemPromptFor` to return `buildScenarioBuildPrompt(...)`. Both files are finished in Task 4.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc exits 0. Tests pass, except any in `tests/core/chat-types/scenario.test.ts` and `tests/core/store/effects/forge-chat-effects.test.ts` that assert the old prompt or turn kinds: mark those `it.skip` with `// rewritten in Task 4`.

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/forge-chat-strategy.ts src/core/store/effects/forge-chat-effects.ts src/core/chat-types/scenario.ts tests/core/utils/forge-chat-strategy.test.ts tests/core/chat-types/scenario.test.ts tests/core/store/effects/forge-chat-effects.test.ts
git commit -m "feat(scenario): Plan and Build strategies; later turns see a Build reply as its commands"
```

---

### Task 4: The mode on the chat, the send table, the Plan effect and retry

**Files:**

- Modify: `src/core/chat-types/types.ts` (`HeaderControl.kind`, `ChatTypeSpec.inputPlaceholderFor`)
- Modify: `src/core/chat-types/scenario.ts`
- Modify: `src/core/store/effects/forge-chat-actions.ts`
- Modify: `src/core/store/effects/forge-chat-effects.ts`
- Modify: `src/core/store/effects/chat-effects.ts` (retry)
- Test: `tests/core/chat-types/scenario.test.ts`, `tests/core/store/effects/forge-chat-effects.test.ts`, `tests/core/store/effects/chat-effects.test.ts`

**Interfaces:**

- Consumes: `buildScenarioBuildStrategy`, `buildScenarioPlanStrategy` (Task 3); `subModeChanged` from `slices/chat`.
- Produces:
  - `type ScenarioMode = "plan" | "build"` and `scenarioMode(chat: Chat): ScenarioMode` exported from `chat-types/scenario.ts`
  - `scenarioPlanRequested({ chatId })` exported from `forge-chat-actions.ts` (action type `"forgeChat/planRequested"`)
  - `HeaderControl.kind` gains `"modeToggle"`; `ChatTypeSpec.inputPlaceholderFor?(chat: Chat): string`

- [ ] **Step 1: Write the failing spec tests**

In `tests/core/chat-types/scenario.test.ts`, delete the tests of the old prompt and of "asks for a turn"/"grows" behaviour (and any `describe.skip`/`it.skip` left by earlier tasks), keep the tests of `inlineEntityIdsFor` and the busy guard, and add:

```ts
import {
  scenarioMode,
  scenarioSpec,
} from "../../../src/core/chat-types/scenario";
import {
  forgeChatContinueRequested,
  scenarioPlanRequested,
} from "../../../src/core/store/effects/forge-chat-actions";

const inMode = (
  subMode: string | undefined,
  messages: Chat["messages"] = [],
) => ({
  ...chatWith(messages),
  subMode,
});
const said = [{ id: "u1", role: "user" as const, content: "A lock-keeper." }];

describe("the Scenario chat's mode", () => {
  it("is plan unless the chat says build", () => {
    expect(scenarioMode(inMode(undefined))).toBe("plan");
    expect(scenarioMode(inMode("cowriter"))).toBe("plan");
    expect(scenarioMode(inMode("build"))).toBe("build");
  });

  it("starts a new chat in plan and offers the toggle first", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.initialize({ kind: "blank" }, ctx).subMode).toBe(
      "plan",
    );
    expect(scenarioSpec.headerControls(inMode("plan"), ctx)[0].kind).toBe(
      "modeToggle",
    );
  });

  it("words its placeholder for the mode", () => {
    expect(scenarioSpec.inputPlaceholderFor!(inMode("plan"))).toBe(
      "Talk the scenario through…",
    );
    expect(scenarioSpec.inputPlaceholderFor!(inMode("build"))).toBe(
      "Say what to build, or send empty to build what you've discussed…",
    );
  });
});

describe("sending in the Scenario chat", () => {
  const lastCall = (ctx: ReturnType<typeof ctxFor>) =>
    ctx.dispatch.mock.calls[ctx.dispatch.mock.calls.length - 1]?.[0];

  it("plan, text: adds the message and asks for a Plan turn", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.handleSend!(inMode("plan"), "  hello  ", ctx)).toBe(
      true,
    );
    expect(ctx.dispatch.mock.calls[0][0].payload.message).toMatchObject({
      role: "user",
      content: "hello",
    });
    expect(lastCall(ctx)).toEqual(scenarioPlanRequested({ chatId: "c1" }));
  });

  it("plan, empty: does nothing", () => {
    const ctx = ctxFor(null);
    expect(scenarioSpec.handleSend!(inMode("plan", said), "  ", ctx)).toBe(
      true,
    );
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("build, text: adds the message and asks for a Build turn", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build"), "just the sisters", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(2);
    expect(lastCall(ctx)).toEqual(forgeChatContinueRequested({ chatId: "c1" }));
  });

  it("build, empty, something said: asks for a Build turn and adds no message", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build", said), "", ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(lastCall(ctx)).toEqual(forgeChatContinueRequested({ chatId: "c1" }));
  });

  it("build, empty, nothing said: does nothing", () => {
    const ctx = ctxFor(null);
    scenarioSpec.handleSend!(inMode("build"), "", ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("refuses while a Plan turn for this chat is queued", () => {
    const dispatch = vi.fn();
    const getState = () =>
      ({
        foundation: { intensity: null },
        runtime: {
          activeRequest: { id: "chat-c1-a9", type: "chat", status: "running" },
          queue: [],
        },
        world: { entitiesById: {} },
      }) as unknown as RootState;
    scenarioSpec.handleSend!(inMode("plan"), "hello", { dispatch, getState });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

Match the `status` value in the last test to a real non-cancelled `RequestStatus` from `src/core/store/types.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/chat-types/scenario.test.ts`
Expected: FAIL, `scenarioMode` and `scenarioPlanRequested` do not exist.

- [ ] **Step 3: Types and action**

In `src/core/chat-types/types.ts`, add `| "modeToggle"` to `HeaderControl.kind`, and to `ChatTypeSpec`, beside `inputPlaceholder`:

```ts
  /** A placeholder that depends on the chat (its mode). Wins over
   *  `inputPlaceholder` when present. */
  inputPlaceholderFor?(chat: Chat): string;
```

In `src/core/store/effects/forge-chat-actions.ts`, append:

```ts
export interface ScenarioPlanRequestedPayload {
  chatId: string;
}

const SCENARIO_PLAN_REQUESTED = "forgeChat/planRequested";
export const scenarioPlanRequested = (
  payload: ScenarioPlanRequestedPayload,
) => ({
  type: SCENARIO_PLAN_REQUESTED as typeof SCENARIO_PLAN_REQUESTED,
  payload,
});
scenarioPlanRequested.type = SCENARIO_PLAN_REQUESTED;
```

- [ ] **Step 4: The chat type**

Replace the body of `src/core/chat-types/scenario.ts` from the doc comment down with:

```ts
export type ScenarioMode = "plan" | "build";

const MODES: readonly ScenarioMode[] = ["plan", "build"] as const;

/** The mode a send in this chat runs in. Anything but "build" is plan, so a
 *  chat saved before the modes existed opens talking, not building. */
export function scenarioMode(chat: Chat): ScenarioMode {
  return chat.subMode === "build" ? "build" : "plan";
}

/** The one chat a story is built in, in two modes. Plan is a conversation on
 *  the creative model and applies nothing. Build reads that conversation and
 *  writes commands, applied to draft entities and Threads when the turn
 *  completes (handlers/forge-chat.ts). The mode in force when the writer sends
 *  decides the turn. */
export const scenarioSpec: ChatTypeSpec<ScenarioMode> = {
  id: "scenario",
  displayName: "Scenario",
  lifecycle: "save",
  subModes: MODES,
  defaultSubMode: "plan",

  sendLabel: "Send",
  showClearButton: false,

  inputPlaceholderFor(chat: Chat): string {
    return scenarioMode(chat) === "build"
      ? "Say what to build, or send empty to build what you've discussed…"
      : "Talk the scenario through…";
  },

  initialize(_seed: ChatSeed, _ctx: SpecCtx) {
    return { title: "Scenario", initialMessages: [], subMode: "plan" };
  },

  systemPromptFor(chat: Chat, ctx: SpecCtx): string {
    const level = normalizeRegisterKey(
      ctx.getState().foundation.intensity?.level,
    );
    return scenarioMode(chat) === "build"
      ? buildScenarioBuildPrompt(level)
      : buildScenarioPlanPrompt(level);
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return chat.messages;
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "mode", kind: "modeToggle" },
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
    // Refuse while any turn for this chat, or a reference scrub, is queued or
    // running: a second send would only stack another empty assistant turn.
    const rt = ctx.getState().runtime;
    const busy = [rt.activeRequest, ...rt.queue].some(
      (r) =>
        !!r &&
        r.status !== "cancelled" &&
        (r.type === "forgeChat" ||
          r.type === "forgeCleanup" ||
          r.id.startsWith(`chat-${chat.id}-`)),
    );
    if (busy) return true;

    const mode = scenarioMode(chat);
    const trimmed = content.trim();
    // Plan is a conversation and needs something said. An empty Build send
    // means "build what we've discussed", which needs a discussion.
    if (
      trimmed.length === 0 &&
      (mode === "plan" || chat.messages.length === 0)
    ) {
      return true;
    }
    if (trimmed.length > 0) {
      ctx.dispatch(
        messageAdded({
          chatId: chat.id,
          message: { id: api.v1.uuid(), role: "user", content: trimmed },
        }),
      );
    }
    ctx.dispatch(
      mode === "plan"
        ? scenarioPlanRequested({ chatId: chat.id })
        : forgeChatContinueRequested({ chatId: chat.id }),
    );
    return true;
  },
};
```

Update the imports: `buildScenarioBuildPrompt, buildScenarioPlanPrompt, normalizeRegisterKey` from prompts; `forgeChatContinueRequested, scenarioPlanRequested` from the actions module. If the existing busy-guard test builds a runtime whose requests lack `status` or `id`, give them both in the test. If `chat-types/index.ts` types the registry in a way `ChatTypeSpec<ScenarioMode>` does not fit, follow how `brainstormSpec` was registered at `git show 98a2fe4^:src/core/chat-types/index.ts`.

- [ ] **Step 5: Run the spec tests**

Run: `npx vitest run tests/core/chat-types/scenario.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing effect tests**

Read `tests/core/store/effects/forge-chat-effects.test.ts` and `tests/core/store/effects/chat-effects.test.ts` for their harness (how a store is built and effects registered). Delete or un-skip tests left skipped by Task 3. Add, in the harness's own style:

In `forge-chat-effects.test.ts`:

- "a Build turn's placeholder is marked build": dispatch `forgeChatContinueRequested({ chatId })` on a chat with one user message; assert the last message is `{ role: "assistant", content: "", mode: "build" }` and a request of type `forgeChat` is queued.
- "a Plan turn's placeholder is marked plan and is queued as an ordinary chat request": dispatch `scenarioPlanRequested({ chatId })`; assert the last message is `{ role: "assistant", content: "", mode: "plan" }`, and the queued request has `type: "chat"`, `id: "chat-<chatId>-<placeholderId>"`.
- "a Plan turn is refused while a Build turn is pending": queue a `forgeChat` request first; dispatch `scenarioPlanRequested`; assert no message was added.
- "a Plan reply with a command line applies nothing": run `chatHandler.completion` (from `src/core/store/effects/handlers/chat.ts`) with `accumulatedText: 'Try this.\n[CREATE CHARACTER "Hesper Vane" | Keeps the lock.]'` against the test store for the Plan placeholder; assert `world.entityIds` is still empty, the message's `content` is that text, and its `forgeSegments` is `undefined`.

In `chat-effects.test.ts`:

- "retry re-runs a Plan reply as Plan with the toggle on Build": a scenario chat with `subMode: "build"` and messages `[user, assistant(mode: "plan")]`; dispatch `uiChatRetryGeneration({ chatId, messageId: <assistant id> })`; assert the new placeholder has `mode: "plan"`.
- "retry re-runs a Build reply as Build with the toggle on Plan": the mirror case, asserting `mode: "build"`.
- "retry of a reply from before the modes re-runs as Build": assistant message with no `mode`; assert `mode: "build"`.

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run tests/core/store/effects/forge-chat-effects.test.ts tests/core/store/effects/chat-effects.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 8: The effects**

In `src/core/store/effects/forge-chat-effects.ts`:

1. Import `scenarioPlanRequested` beside `forgeChatContinueRequested` and re-export it. Import `buildScenarioPlanStrategy`.
2. In the `forgeChatContinueRequested` effect, add `mode: "build"` to the placeholder message, and change its heading comment to `// ─── A Build turn ───`.
3. Make `forgeRequestPending` take the chat id and also count a pending Plan turn for that chat:

```ts
function scenarioRequestPending(state: RootState, chatId: string): boolean {
  return [state.runtime.activeRequest, ...state.runtime.queue].some(
    (r) =>
      !!r &&
      r.status !== "cancelled" &&
      (r.type === "forgeChat" ||
        r.type === "forgeCleanup" ||
        r.id.startsWith(`chat-${chatId}-`)),
  );
}
```

Replace every use of `forgeRequestPending(latest())` with `scenarioRequestPending(latest(), chatId)` (use the chat id in scope at each call site) and delete the old function. If the old function did not skip cancelled requests and an existing test depends on that, keep the old semantics for the two forge types and say so in the report.

4. Add the Plan effect after the Build effect:

```ts
// ─── A Plan turn ────────────────────────────────────────────────────────────
subscribeEffect(
  matchesAction(scenarioPlanRequested),
  async (action, { getState: latest }) => {
    const { chatId } = action.payload;
    if (!findChat(latest(), chatId)) return;
    if (scenarioRequestPending(latest(), chatId)) return;

    const assistantId = api.v1.uuid();
    dispatch(
      messageAdded({
        chatId,
        message: {
          id: assistantId,
          role: "assistant",
          content: "",
          mode: "plan",
        },
      }),
    );
    const chat = findChat(latest(), chatId);
    if (!chat) return;

    const strategy = await buildScenarioPlanStrategy(latest, chat, assistantId);
    dispatch(
      requestQueued({
        id: strategy.requestId,
        type: "chat",
        targetId: assistantId,
      }),
    );
    dispatch(generationSubmitted(strategy));
  },
);
```

5. Update the file's header comment: "Three signals" becomes four, and item 1 reads "forgeChatContinueRequested → queue a Build turn…"; add "scenarioPlanRequested → queue a Plan turn: an assistant placeholder and an ordinary chat generation. Nothing it writes is applied."

In `src/core/store/effects/chat-effects.ts`, in the retry effect, read the target's mode before pruning and route on it:

```ts
const { chatId, messageId } = action.payload;
// Read before the prune removes it: a reply is re-run in the mode that
// wrote it, whatever the toggle says now.
const retried = findChat(latest(), chatId)?.messages.find(
  (m) => m.id === messageId,
);
dispatch(messagesPrunedAfter({ chatId, id: messageId }));
const chat = findChat(latest(), chatId);
if (!chat) return;
// A Scenario turn is not an ordinary chat turn: `buildChatStrategy`
// knows refine and the saved-chat path only. A Build reply retried
// through it would have its commands written as text and never applied;
// a Plan reply would lose its context. Each has its own request.
if (chat.type === "scenario") {
  dispatch(
    retried?.mode === "plan"
      ? scenarioPlanRequested({ chatId })
      : forgeChatContinueRequested({ chatId }),
  );
  return;
}
```

Import `scenarioPlanRequested` from `./forge-chat-actions`.

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc exits 0; all tests pass with nothing skipped.

- [ ] **Step 10: Commit**

```bash
git add src/core/chat-types/types.ts src/core/chat-types/scenario.ts src/core/store/effects/forge-chat-actions.ts src/core/store/effects/forge-chat-effects.ts src/core/store/effects/chat-effects.ts tests/core/chat-types/scenario.test.ts tests/core/store/effects/forge-chat-effects.test.ts tests/core/store/effects/chat-effects.test.ts
git commit -m "feat(scenario): the mode on the chat decides the turn; retry re-runs a reply in the mode that wrote it"
```

---

### Task 5: Pills

**Files:**

- Create: `src/core/chat-types/pills.ts`
- Create: `src/ui/panels/chat/BuildPills.tsx`
- Modify: `src/ui/panels/chat/Message.tsx`
- Test: `tests/core/chat-types/pills.test.ts` (create), `tests/ui/build-pills-source.test.ts` (create)

**Interfaces:**

- Consumes: `ForgeSegment`, `ForgeActionRecord`, `PillPart`, `ChatMessage.mode` (Task 1); `parseForgeStream` from the parser.
- Produces:
  - `interface Pill { label: string; tone: "thinking" | "applied" | "rejected"; body: PillPart[] }`
  - `pillLabel(action: ForgeActionRecord): string`
  - `pillsFor(segments: ForgeSegment[], tail?: string, streaming?: boolean): Pill[]`
  - `<BuildPills pills={Pill[]} resetKey={string} hidden={boolean} />`

- [ ] **Step 1: Write the failing model tests**

Create `tests/core/chat-types/pills.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pillLabel, pillsFor } from "../../../src/core/chat-types/pills";
import type {
  ForgeActionRecord,
  ForgeSegment,
} from "../../../src/core/chat-types/types";

const act = (action: Partial<ForgeActionRecord>): ForgeSegment => ({
  kind: "action",
  action: { kind: "CREATE", status: "applied", ...action },
});
const prose = (text: string): ForgeSegment => ({ kind: "prose", text });

describe("pillLabel", () => {
  it.each([
    [{ kind: "CREATE", name: "Jimmy" }, 'create | "Jimmy"'],
    [{ kind: "REVISE", name: "Corin Vane" }, 'revise | "Corin Vane"'],
    [{ kind: "DELETE", name: "The Mill" }, 'delete | "The Mill"'],
    [{ kind: "THREAD", name: "Half the House" }, 'thread | "Half the House"'],
    [
      { kind: "RENAME", name: "Corin", newName: "Corin Vane" },
      'rename | "Corin" → "Corin Vane"',
    ],
    [{ kind: "UNKNOWN" }, "unrecognised"],
  ] as const)("labels %o", (action, label) => {
    expect(pillLabel({ status: "applied", ...action })).toBe(label);
  });
});

describe("pillsFor", () => {
  it("turns every run of text into a thinking pill where it sits", () => {
    const pills = pillsFor([
      prose("The sale is fact."),
      act({ name: "Hesper Vane" }),
      prose("One thread."),
      act({ kind: "THREAD", name: "Half the House" }),
      prose("Done."),
    ]);
    expect(pills.map((p) => p.label)).toEqual([
      "thinking",
      'create | "Hesper Vane"',
      "thinking",
      'thread | "Half the House"',
      "thinking",
    ]);
    expect(pills[0]).toMatchObject({
      tone: "thinking",
      body: [{ label: "", text: "The sale is fact." }],
    });
  });

  it("joins adjacent text into one pill and makes none for whitespace", () => {
    const pills = pillsFor([prose("One."), prose("  "), prose("Two.")]);
    expect(pills).toHaveLength(1);
    expect(pills[0].body[0].text).toBe("One.\nTwo.");
  });

  it("carries a command's body", () => {
    const body = [{ label: "Summary", text: "Keeps the lock." }];
    expect(pillsFor([act({ name: "Hesper Vane", body })])[0]).toEqual({
      label: 'create | "Hesper Vane"',
      tone: "applied",
      body,
    });
  });

  it("marks a rejected command and leads its body with the reason", () => {
    const pill = pillsFor([
      act({
        kind: "THREAD",
        name: "T",
        status: "rejected",
        reason: "Name a known element.",
        body: [{ label: "State", text: "x" }],
      }),
    ])[0];
    expect(pill.tone).toBe("rejected");
    expect(pill.body).toEqual([
      { label: "Not applied", text: "Name a known element." },
      { label: "State", text: "x" },
    ]);
  });

  it("marks an unrecognised line rejected", () => {
    const pill = pillsFor([
      {
        kind: "action",
        action: {
          kind: "UNKNOWN",
          status: "unrecognized",
          reason: "[THREAD x]",
        },
      },
    ])[0];
    expect(pill).toMatchObject({ label: "unrecognised", tone: "rejected" });
  });

  it("is one thinking pill for a reply that is all thinking", () => {
    expect(pillsFor([prose("Nothing new to record.")])).toHaveLength(1);
  });

  it("takes the unfinished tail of a streaming reply as thinking", () => {
    const pills = pillsFor([act({ name: "A" })], "and now", true);
    expect(pills.map((p) => p.label)).toEqual(['create | "A"', "thinking"]);
  });

  it("reads thinking… until the first command arrives", () => {
    expect(pillsFor([], "", true).map((p) => p.label)).toEqual(["thinking…"]);
    expect(pillsFor([], "So", true).map((p) => p.label)).toEqual(["thinking…"]);
    expect(pillsFor([prose("So.")], "", false)[0].label).toBe("thinking");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/chat-types/pills.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the model**

Create `src/core/chat-types/pills.ts`:

```ts
import type { ForgeActionRecord, ForgeSegment, PillPart } from "./types";

/** One pill of a Build reply: a command, or a run of the model's thinking. */
export interface Pill {
  label: string;
  tone: "thinking" | "applied" | "rejected";
  /** Shown when the pill is opened. Empty means the pill does not open. */
  body: PillPart[];
}

const quoted = (s?: string): string => `"${s ?? ""}"`;

export function pillLabel(action: ForgeActionRecord): string {
  switch (action.kind) {
    case "RENAME":
      return `rename | ${quoted(action.name)} → ${quoted(action.newName)}`;
    case "UNKNOWN":
      return "unrecognised";
    default:
      return `${action.kind.toLowerCase()} | ${quoted(action.name)}`;
  }
}

/** A Build reply as pills, in the order it was written. Everything that is not
 *  a command is thinking, wherever it sits: this is positional, and no marker
 *  is looked for. `tail` is the unfinished text of a reply still arriving. */
export function pillsFor(
  segments: ForgeSegment[],
  tail = "",
  streaming = false,
): Pill[] {
  const pills: Pill[] = [];
  const think = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = pills[pills.length - 1];
    if (last?.tone === "thinking") {
      last.body[0].text += `\n${trimmed}`;
      return;
    }
    pills.push({
      label: "thinking",
      tone: "thinking",
      body: [{ label: "", text: trimmed }],
    });
  };

  for (const segment of segments) {
    if (segment.kind === "prose") {
      think(segment.text);
      continue;
    }
    const { action } = segment;
    const failed = action.status !== "applied";
    pills.push({
      label: pillLabel(action),
      tone: failed ? "rejected" : "applied",
      body: [
        ...(failed && action.reason
          ? [{ label: "Not applied", text: action.reason }]
          : []),
        ...(action.body ?? []),
      ],
    });
  }
  think(tail);

  if (streaming && pills.every((p) => p.tone === "thinking")) {
    if (pills.length === 0) {
      pills.push({ label: "thinking…", tone: "thinking", body: [] });
    } else {
      pills[0].label = "thinking…";
    }
  }
  return pills;
}
```

- [ ] **Step 4: Run the model tests**

Run: `npx vitest run tests/core/chat-types/pills.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing source test**

Create `tests/ui/build-pills-source.test.ts` (read `tests/ui/thread-source.test.ts` first and follow its style for source tests):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const pills = readFileSync("src/ui/panels/chat/BuildPills.tsx", "utf8");
const message = readFileSync("src/ui/panels/chat/Message.tsx", "utf8");

describe("BuildPills", () => {
  it("mounts every body and toggles its display", () => {
    expect(pills).toMatch(
      /display:\s*open\[i\]\s*&&\s*pill\.body\.length\s*>\s*0\s*\?\s*"block"\s*:\s*"none"/,
    );
    expect(pills).not.toMatch(/open\[i\]\s*&&\s*</);
  });

  it("collapses everything when its instance is reused for another message", () => {
    expect(pills).toMatch(
      /useEffect\(\(\) => \{\s*setOpen\(\{\}\);\s*\}, \[props\.resetKey\]\)/,
    );
  });

  it("captions the private and wish parts", () => {
    expect(pills).toContain("Never shown to the story model.");
  });
});

describe("Message", () => {
  it("mounts both the text and the pills, and shows one", () => {
    expect(message).toMatch(
      /<BuildPills[\s\S]*?hidden=\{!isBuild\}[\s\S]*?resetKey=\{message\.id\}/,
    );
    expect(message).toMatch(/display:\s*isBuild\s*\?\s*"none"\s*:\s*"block"/);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/ui/build-pills-source.test.ts`
Expected: FAIL, `BuildPills.tsx` does not exist.

- [ ] **Step 7: Write the component**

Create `src/ui/panels/chat/BuildPills.tsx`:

```tsx
// src/ui/panels/chat/BuildPills.tsx
import { T, SP } from "../../style";
import type { Pill } from "../../../core/chat-types/pills";

const TONE = {
  thinking: {
    color: T.text,
    opacity: 0.55,
    borderColor: "rgba(255,255,255,0.18)",
  },
  applied: { color: T.text, opacity: 1, borderColor: "rgba(255,255,255,0.3)" },
  rejected: { color: "#e6a23c", opacity: 1, borderColor: "#e6a23c" },
} as const;

const PRIVATE_PARTS = new Set(["Private", "Wish"]);

/** A Build reply as a wrapping row of pills, each opening its body under the
 *  row. Every body is mounted once and its `display` toggled: a pill opened
 *  and closed by swapping elements leaves stale ones behind in this renderer.
 *  `resetKey` collapses everything when the instance is reused for another
 *  message (the message list is keyed by index and pages). */
export function BuildPills(props: {
  pills: Pill[];
  resetKey: string;
  hidden: boolean;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  useEffect(() => {
    setOpen({});
  }, [props.resetKey]);

  return (
    <div
      style={{
        display: props.hidden ? "none" : "flex",
        flexDirection: "column",
        gap: SP.xs,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: SP.xs }}>
        {props.pills.map((pill, i) => (
          <button
            key={i}
            title={pill.body.length > 0 ? "Show what it said" : undefined}
            onClick={() => {
              if (pill.body.length === 0) return;
              setOpen((o) => ({ ...o, [i]: !o[i] }));
            }}
            style={{
              background: open[i] ? "rgba(255,255,255,0.08)" : "none",
              border: `1px solid ${TONE[pill.tone].borderColor}`,
              borderRadius: "10px",
              color: TONE[pill.tone].color,
              opacity: TONE[pill.tone].opacity,
              cursor: pill.body.length > 0 ? "pointer" : "default",
              fontFamily: T.fontDefault,
              fontSize: "0.75em",
              padding: "1px 7px",
              textDecoration:
                pill.tone === "rejected" ? "line-through" : "none",
            }}
          >
            [{pill.label}]
          </button>
        ))}
      </div>
      {props.pills.map((pill, i) => (
        <div
          key={i}
          style={{
            display: open[i] && pill.body.length > 0 ? "block" : "none",
            borderLeft: `2px solid ${TONE[pill.tone].borderColor}`,
            paddingLeft: SP.sm,
            fontSize: "0.85em",
            whiteSpace: "pre-wrap",
          }}
        >
          {pill.body.map((part, j) => (
            <div key={j} style={{ marginBottom: SP.xs }}>
              <span
                style={{
                  display: part.label ? "inline" : "none",
                  opacity: 0.6,
                }}
              >
                {part.label}:{" "}
              </span>
              {part.text}
              <div
                style={{
                  display: PRIVATE_PARTS.has(part.label) ? "block" : "none",
                  fontSize: "0.8em",
                  opacity: 0.5,
                }}
              >
                Never shown to the story model.
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

Check how `Message.tsx` and `ConfirmButton.tsx` obtain `useState`/`useEffect` (globals or an import) and do the same. If `T` has a warning colour token, use it in place of `#e6a23c`.

- [ ] **Step 8: Wire it into the message**

In `src/ui/panels/chat/Message.tsx`:

1. Import `BuildPills`, `pillsFor` (from `../../../core/chat-types/pills`) and `parseForgeStream` (from `../../../core/utils/crucible-command-parser`).
2. Beside `readContent`, add a selector helper:

```ts
function readMessage(
  s: RootState,
  chatId: string,
  id: string,
): ChatMessage | undefined {
  return s.chat.chats
    .find((c) => c.id === chatId)
    ?.messages.find((m) => m.id === id);
}
```

3. In `Message`, after `const content = live ?? committed;`:

```ts
// Read from the store, not the prop: the segments arrive when the turn
// completes, after this row was last handed its message. Both selectors
// return what the store holds (a stable reference or a primitive).
const mode = useSlice((s) => readMessage(s, chatId, message.id)?.mode);
const segments = useSlice(
  (s) => readMessage(s, chatId, message.id)?.forgeSegments,
);
const isBuild = message.role === "assistant" && mode === "build";
// Settled segments once the turn has completed; until then a provisional
// parse of the text so far, whose unfinished tail is thinking too.
const stream = isBuild && !segments ? parseForgeStream(content) : null;
const pills = !isBuild
  ? []
  : segments
    ? pillsFor(segments)
    : pillsFor(
        stream!.segments,
        stream!.pending.kind === "prose" ? stream!.pending.text : "",
        true,
      );
```

4. Replace the role label expression `{isUser ? "You" : "Assistant"}` with:

```tsx
{
  isUser
    ? "You"
    : mode === "build"
      ? "Build"
      : mode === "plan"
        ? "Plan"
        : "Assistant";
}
```

5. Replace `<div>{content || "…"}</div>` with:

```tsx
            <div style={{ display: isBuild ? "none" : "block" }}>
              {content || "…"}
            </div>
            <BuildPills
              pills={pills}
              hidden={!isBuild}
              resetKey={message.id}
            />
```

Leave the inline entity cards below the bubble as they are.

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc exits 0; all tests pass, including `tests/core/engine/latent-privacy.test.ts` (neither new file names `latent`).

- [ ] **Step 10: Commit**

```bash
git add src/core/chat-types/pills.ts src/ui/panels/chat/BuildPills.tsx src/ui/panels/chat/Message.tsx tests/core/chat-types/pills.test.ts tests/ui/build-pills-source.test.ts
git commit -m "feat(scenario): a Build reply renders as pills that open to show what each command said"
```

---

### Task 6: The Plan | Build toggle and the mode's placeholder

**Files:**

- Modify: `src/ui/panels/chat/ChatHeader.tsx`
- Modify: `src/ui/panels/chat/ChatInput.tsx`
- Test: `tests/ui/chat-mode-source.test.ts` (create), `tests/core/store/slices/chat.test.ts` (or wherever the chat slice is tested; find with `grep -rl subModeChanged tests`, create the test beside the other chat slice tests if none exists)

**Interfaces:**

- Consumes: `scenarioMode` (Task 4), `subModeChanged` (existing slice action), `HeaderControl.kind === "modeToggle"`, `inputPlaceholderFor` (Task 4).

- [ ] **Step 1: Write the failing tests**

Slice test (in the chat slice's test file, in its existing harness):

```ts
it("changes a chat's mode and generates nothing", () => {
  // Build a store with one scenario chat `c1` the way this file's other tests do.
  store.dispatch(subModeChanged({ id: "c1", subMode: "build" }));
  const chat = store.getState().chat.chats.find((c) => c.id === "c1")!;
  expect(chat.subMode).toBe("build");
  expect(chat.messages).toEqual([]);
  expect(store.getState().runtime.queue).toEqual([]);
});
```

Create `tests/ui/chat-mode-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const header = readFileSync("src/ui/panels/chat/ChatHeader.tsx", "utf8");
const input = readFileSync("src/ui/panels/chat/ChatInput.tsx", "utf8");

describe("the Plan | Build toggle", () => {
  it("re-renders when the mode changes", () => {
    expect(header).toMatch(/\$\{c\.subMode \?\? ""\}/);
  });

  it("renders both buttons always and sets the mode on click", () => {
    expect(header).toContain('case "modeToggle":');
    expect(header).toMatch(/\(\["plan", "build"\] as const\)\.map/);
    expect(header).toMatch(/subModeChanged\(\{ id: chat\.id, subMode: m \}\)/);
  });
});

describe("the chat input", () => {
  it("asks the chat type for a placeholder that fits the chat", () => {
    expect(input).toMatch(/spec\.inputPlaceholderFor\?\.\(chat\)/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/chat-mode-source.test.ts`
Expected: FAIL.

- [ ] **Step 3: The header**

In `src/ui/panels/chat/ChatHeader.tsx`:

1. Import `subModeChanged` from the same place `chatCreated` comes from (add it to `src/core/store/index.ts`'s chat exports if it is not re-exported) and `scenarioMode` from `../../../core/chat-types/scenario`.
2. Change the stamp selector to `` `${c.id}|${c.title}|${c.type}|${c.subMode ?? ""}` ``.
3. Add a case to the `controls.map` switch, before `newChatButton`:

```tsx
      case "modeToggle": {
        const mode = scenarioMode(chat);
        return (
          <div key={c.id} style={{ display: "flex" }}>
            {(["plan", "build"] as const).map((m) => (
              <button
                key={m}
                title={
                  m === "plan"
                    ? "Talk the scenario through. Builds nothing."
                    : "Record what you've discussed as drafts and Threads."
                }
                onClick={() =>
                  store.dispatch(subModeChanged({ id: chat.id, subMode: m }))
                }
                style={{
                  background: mode === m ? "rgba(255,255,255,0.12)" : "none",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: m === "plan" ? "6px 0 0 6px" : "0 6px 6px 0",
                  color: T.text,
                  opacity: mode === m ? 1 : 0.55,
                  cursor: "pointer",
                  fontFamily: T.fontDefault,
                  fontSize: "0.75em",
                  fontWeight: mode === m ? "bold" : "normal",
                  padding: "2px 8px",
                }}
              >
                {m === "plan" ? "Plan" : "Build"}
              </button>
            ))}
          </div>
        );
      }
```

- [ ] **Step 4: The input**

In `src/ui/panels/chat/ChatInput.tsx`, the component reads `chatId` and `chatType` from the store. Add a selector for the mode so the placeholder follows the toggle, and resolve the chat for the spec call:

```ts
const subMode = useSlice(
  (s) => s.chat.chats.find((c) => c.id === s.chat.activeChatId)?.subMode ?? "",
);
```

Place it beside the existing `chatId`/`chatType` selectors (before the early `return null`, since hooks must not be conditional). After `const spec = getChatTypeSpec(chatType);` add:

```ts
const chat = store.getState().chat.chats.find((c) => c.id === chatId);
const placeholder =
  (chat && spec.inputPlaceholderFor?.(chat)) ??
  spec.inputPlaceholder ??
  "Message…";
```

and change the textarea's `placeholder={spec.inputPlaceholder ?? "Message…"}` to `placeholder={placeholder}`. `subMode` exists only to re-render; reference it in a comment-free `void subMode;` only if `noUnusedLocals` flags it, otherwise fold it into the lookup (`chat` found via the selector's id).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc exits 0; all tests pass, including `tests/ui/text-input-events.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels/chat/ChatHeader.tsx src/ui/panels/chat/ChatInput.tsx src/core/store/index.ts tests/ui/chat-mode-source.test.ts tests/core/store
git commit -m "feat(scenario): a Plan | Build toggle in the chat header"
```

---

### Task 7: Rebuild the probe around Build; delete the old prompt

**Files:**

- Modify: `tools/scenario-probe.naiscript`
- Modify: `tests/tools/scenario-probe.test.ts`
- Modify: `src/core/utils/prompts.ts`, `tests/core/utils/prompts.test.ts`

**Interfaces:**

- Consumes: `SCENARIO_BUILD_PROMPT`, `SCENARIO_BUILD_REGISTERS.Gritty`, `SCENARIO_BUILD_INSTRUCTION`.
- Removes: `SCENARIO_PROMPT`, `SCENARIO_REGISTERS`, `buildScenarioPrompt`, `SCENARIO_GROW_INSTRUCTION`.

- [ ] **Step 1: Update the probe's tests first**

In `tests/tools/scenario-probe.test.ts`:

1. Import `SCENARIO_BUILD_INSTRUCTION, SCENARIO_BUILD_PROMPT, SCENARIO_BUILD_REGISTERS` and change the drift table to:

```ts
it.each([
  ["SCENARIO_BUILD_PROMPT", SCENARIO_BUILD_PROMPT],
  ["REGISTER", SCENARIO_BUILD_REGISTERS.Gritty],
  ["SCENARIO_BUILD_INSTRUCTION", SCENARIO_BUILD_INSTRUCTION],
])("carries %s verbatim", (name, prompt) => {
  expect(probe).toContain(`const ${name} = ${JSON.stringify(prompt)};`);
});
```

2. Extend the `Read` type with `created: { type: string; name: string }[]`, and add to the parser-parity `describe` a test that `read` returns each CREATE's type and name:

```ts
it("lists what a reply created, by type and name", () => {
  const r = read(
    '[CREATE CHARACTER "Odile Marsh" | Keeps the books.]\n[CREATE SITUATION "The Guild\'s Lien" | The guild holds the hides; nobody can pay.]',
  );
  expect(r.created).toEqual([
    { type: "CHARACTER", name: "Odile Marsh" },
    { type: "SITUATION", name: "The Guild's Lien" },
  ]);
});
```

3. Add tests of the over-building count, lifting `unasked` out of the probe the way `holds` is lifted (evaluate the slice between `// --- unasked:start ---` and `// --- unasked:end ---`):

```ts
describe("the probe's over-building count", () => {
  const probe = readFileSync("tools/scenario-probe.naiscript", "utf8");
  const source = probe
    .split("// --- unasked:start ---")[1]
    .split("// --- unasked:end ---")[0];
  const unasked = new Function(`${source}\nreturn unasked;`)() as (
    created: { type: string; name: string }[],
    conversation: string,
  ) => number;
  const talk = "Maud Tarn runs the furnace house with Wick.";

  it("does not count a person or place the conversation named", () => {
    expect(
      unasked(
        [
          { type: "CHARACTER", name: "Maud Tarn" },
          { type: "CHARACTER", name: "Wick" },
          { type: "LOCATION", name: "The Furnace House" },
        ],
        talk,
      ),
    ).toBe(0);
  });

  it("counts a person, place or faction nobody mentioned", () => {
    expect(
      unasked(
        [
          { type: "CHARACTER", name: "Master Valerius" },
          { type: "FACTION", name: "The Glaziers' Guild" },
        ],
        talk,
      ),
    ).toBe(2);
  });

  it("never counts a SITUATION, SYSTEM or TOPIC, whose names are always coined", () => {
    expect(
      unasked([{ type: "SITUATION", name: "The Unsigned Release" }], talk),
    ).toBe(0);
  });
});
```

4. Update the `holds` fixtures only if a fixture's seed text they rely on changes; the `FIRE`, `CATALOGUE` and `LEAVING` checks are unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/scenario-probe.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rebuild the probe**

In `tools/scenario-probe.naiscript`:

1. Bump the header `version` to `0.2.0` and the description to `How often does a Build turn keep a thing to come out of everything the story model is shown, and how much does it build that nobody asked for?`
2. Replace the two prompt constants with three, each written as `const NAME = <JSON.stringify of the shipped constant>;` on one line: `SCENARIO_BUILD_PROMPT`, `REGISTER` (the Gritty build register), `SCENARIO_BUILD_INSTRUCTION`. Generate them from `src/core/utils/prompts.ts`, do not retype them.
3. Set `max_tokens: 1024` in `PARAMS` and rewrite the comment above it: the shipped Build turn asks for 1024 per call and continues; the probe does not continue, so a reply cut off at 1024 shows up as a run with no THREAD.
4. Replace `SEEDS` and `messages` with conversations:

```js
// Each fixture is a short Plan conversation, written by hand, then an empty
// Build send. A glassworks and an observatory: unlike the prompt's canal, so
// no fixture is a copy of the example the prompt carries.
const TALKS = {
  ToCome: [
    {
      role: "user",
      content:
        "A glassblower's widow, Maud Tarn, runs the furnace house with her late husband's apprentice, Wick. I want it to end in what the town will call the Quillane Fire, when Wick burns the furnace house down.",
    },
    {
      role: "assistant",
      content:
        "Then page one needs what Wick already resents and what he already has his hands on. He banks the furnace alone at night and knows the flues better than Maud does. What does she owe him that she hasn't paid?",
    },
    {
      role: "user",
      content:
        "His indenture ended when her husband died and she never signed his release. She needs him and can't afford a journeyman's wage.",
    },
  ],
  AlreadySo: [
    {
      role: "user",
      content:
        "A glassblower's widow, Maud Tarn, runs the furnace house with her late husband's apprentice, Wick. Two winters ago Wick burned the furnace house down in what the town calls the Quillane Fire, and Maud rebuilt it without a word.",
    },
    {
      role: "assistant",
      content:
        "So the fire is history and the silence is the live thing. Everyone in town knows who set it, and she kept him on anyway. Has she ever asked him why?",
    },
    {
      role: "user",
      content:
        "Never. He still works for her and neither of them has spoken of it.",
    },
  ],
  TwoWishes: [
    {
      role: "user",
      content:
        "Two astronomers share one telescope on a mountain: Ilse Marrow, the younger, and Osric Hale. I want Ilse to end up publishing, under her own name, what she will call the Vessarine Catalogue, and I want Osric to finally leave for the post at Orrowmere.",
    },
    {
      role: "assistant",
      content:
        "Then what matters now is whose name is on the observing log, and why Osric is still on the mountain. Who do the plates belong to tonight?",
    },
    {
      role: "user",
      content:
        "The log is in his name by observatory rule, though she takes most of the plates. Orrowmere has written to him twice and he has not answered.",
    },
  ],
};

const messages = (talk) => [
  { role: "system", content: `${SCENARIO_BUILD_PROMPT}\n\n${REGISTER}` },
  ...talk,
  { role: "user", content: SCENARIO_BUILD_INSTRUCTION },
];
```

Each fixture's `seed` field becomes `talk: TALKS.<Name>`; `runFixture` calls `messages(fixture.talk)`.

5. Inside the `read` block, also collect creations. Change the `CREATE` regex to capture the type, and return `created`:

```js
const CREATE = /^\[\s*CREATE\s+([A-Z]+)\s+"([^"]+)"\s*\|\s*(.+?)\]?\s*$/;
// …in read():
const c = CREATE.exec(line);
if (c) {
  shown.push(c[2], c[3]);
  created.push({ type: c[1], name: c[2] });
}
// …and add `created` to the returned object.
```

6. After the `read` block add:

```js
// --- unasked:start ---
// People, places and factions the conversation never mentioned. A name counts
// as mentioned when any of its words of four letters or more appears in the
// talk. Situations, systems and topics are left out: the model coins their
// names, so a name the talk lacks says nothing.
const NAMED_TYPES = new Set(["CHARACTER", "LOCATION", "FACTION"]);
const unasked = (created, conversation) => {
  const talk = conversation.toLowerCase();
  return created.filter(
    (c) =>
      NAMED_TYPES.has(c.type) &&
      !c.name
        .toLowerCase()
        .split(/[^a-z]+/)
        .some((w) => w.length >= 4 && talk.includes(w)),
  ).length;
};
// --- unasked:end ---
```

7. In `runFixture`, keep the budget wait, the Continue prompt, the per-run pass/FAIL line and the "not measured" count. Add two running totals over measured runs, `built` (sum of `r.created.length`) and `extra` (sum of `unasked(r.created, talkText)`, where `talkText` is the fixture's user and assistant contents joined by newlines), and track `worst` (the largest `unasked` of any run). Append to the fixture's summary line: `` ` — built ${(built / measured).toFixed(1)} per run, ${(extra / measured).toFixed(1)} unasked (worst ${worst})` `` where `measured = RUNS - threw`, guarding the division when `measured` is 0. Append `, ${n} unasked` to each per-run line.

- [ ] **Step 4: Run the probe tests**

Run: `npx vitest run tests/tools/scenario-probe.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete the old prompt**

In `src/core/utils/prompts.ts` delete `SCENARIO_PROMPT`, `SCENARIO_REGISTERS`, `buildScenarioPrompt` and `SCENARIO_GROW_INSTRUCTION`, and rewrite the "Register" comment at the top of the file to name `SCENARIO_PLAN_REGISTERS` / `SCENARIO_BUILD_REGISTERS` and their two builders. In `tests/core/utils/prompts.test.ts` delete the `describe` blocks that test the deleted exports. Run `grep -rn "SCENARIO_PROMPT\b\|SCENARIO_REGISTERS\b\|buildScenarioPrompt\b\|SCENARIO_GROW_INSTRUCTION" src tests tools` and fix any remaining reference.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc exits 0; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/scenario-probe.naiscript tests/tools/scenario-probe.test.ts src/core/utils/prompts.ts tests/core/utils/prompts.test.ts
git commit -m "test(scenario): the probe measures a Build turn over a Plan conversation, and counts what nobody asked for"
```

---

### Task 8: CLAUDE.md, the changelog, formatting

**Files:**

- Modify: `CLAUDE.md` (the "Scenario chat" section and the `slices/chat.ts` line)
- Modify: `CHANGELOG.md` (the `[0.15.0]` section only)

- [ ] **Step 1: Rewrite CLAUDE.md's Scenario chat section**

Replace the bullets of the **Scenario chat** section with these, keeping the bullets about deleting a chat and paging as they are:

```markdown
- **One chat type, `scenario`, in two modes** held in the chat's `subMode` (`scenarioMode` in `chat-types/scenario.ts`; anything but `"build"` is plan). The mode in force when the writer sends decides the turn, and each assistant message is stamped with the mode that wrote it (`ChatMessage.mode`). Internal names keep "forge" for the command mechanism (`forgeChatContinueRequested`, `forge-chat-effects.ts`); the product word is Scenario.
- **Plan talks and applies nothing.** It runs on the Creative model with its own message factory (`buildScenarioPlanStrategy`) but targets the ordinary `chat` request, so `chatHandler` commits the text and never reads it for commands — a bracketed command in a Plan reply is text. An empty send does nothing in Plan.
- **Build thinks out loud, then writes commands**, always on GLM (`buildScenarioBuildStrategy`, the `forgeChat` request). `enable_thinking` is not used: thinking output is reported lost and truncated in NovelAI. Instead thinking is positional — in a Build reply, everything that is not a recognised command line is thinking. An empty Build send stands for `SCENARIO_BUILD_INSTRUCTION`; the writer's own last message directs the build otherwise.
- **Later turns see a Build reply as its commands only** (`scenarioConversation`): the thinking is dropped, and a Build reply that wrote no command is left out. `formatRejections` reads the last reply that has segments, not the last reply, so a rejection outlives a Plan reply.
- **Retry re-runs a reply in the mode that wrote it**, whatever the toggle says; a reply from before the modes re-runs as Build.
- **A Build reply renders as pills** (`chat-types/pills.ts`, `ui/panels/chat/BuildPills.tsx`): `[thinking]`, `[create | "Name"]`, and so on, collapsed, each opening to show what its command said (`ForgeActionRecord.body`, built by `commandBody`). Open or closed is view state. Every pill body is mounted once and its `display` toggled.
- **A `THREAD` has exactly five segments**, `[THREAD "<Title>" | "<A>", "<B>" | state | private | wish]` (the prompt calls the fourth `private`; in code it is `latent`). Position is meaning, so a shorter command is never guessed at: it is not parsed, its pill carries `THREAD_REPAIR`, and the next Build turn's context lists what was rejected. A `THREAD` whose title matches an open Thread rewrites its state, private notes and wish — never its cast — and an empty segment never erases a stored value. A new `THREAD` naming anyone who is not a known entity is rejected whole. Every rejection reason is written as the repair (`REASON` in `handlers/forge-chat.ts`), because the next Build turn's `[REJECTED LAST TURN]` block shows it to the model. There is no `CRITIQUE` command.
- The Build prompt is measured with `tools/scenario-probe.naiscript` (twenty runs per fixture, in NovelAI; each fixture is a short Plan conversation and an empty Build send, and it also counts entities nobody asked for); `tests/tools/scenario-probe.test.ts` keeps its copy of the prompt in step. Plan's voice is not measured.
```

In the Threads section, the sentence about the Scenario chat's `[THREAD … | state | latent | wish]` command needs no change.

- [ ] **Step 2: Rewrite the changelog entry**

In `CHANGELOG.md`, replace the **Scenario chat.** bullet under `[0.15.0]` → Added with:

```markdown
- **Scenario chat, in two modes.** **Plan** is a conversation: say what you want to see and talk it through, arcs and endings included. It builds nothing, and runs on your Creative model, so on Xialong it has that voice. **Build** records what you settled on as drafts and Threads — the pressures on the world, the people and places under them, and how things stand between them — and only what the conversation raised. Send empty in Build to build what you've discussed, or say what to build. It records conditions, never a plot: ask for an ending and it writes what would make that ending possible, and keeps the ending itself as a private wish. A Build reply shows as a row of small pills (`[create | "Hesper Vane"]`); click one to see what it said. **Cast drafts** and **Discard drafts** leave the chat open.
```

Then read the rest of the `[0.15.0]` section and correct any bullet that describes behaviour this plan removed: an empty send "growing" a sketch, the chat opening with a question when Intensity is unset, a critique, or "Sketch the scenario" wording that implies the first message builds. Reword in place; add no bullet about anything a 0.14 writer never saw.

- [ ] **Step 3: Format and verify**

Run: `npm run format`
If it rewrites any file not touched by this plan, restore those files (`git checkout -- <file>`) and say so in the report.

Run: `npx tsc --noEmit && npm run test`
Expected: tsc exits 0; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git add -u src tests tools docs/superpowers/plans/2026-10-08-scenario-plan-build.md
git commit -m "docs(scenario): CLAUDE.md and the 0.15.0 notes describe Plan and Build"
```

Check `git status --short` first and confirm nothing under the Global Constraints' never-stage list is staged.
