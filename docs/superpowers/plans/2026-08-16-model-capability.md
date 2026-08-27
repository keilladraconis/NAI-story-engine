# Model Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each generation ask for the model that suits it — `glm-4-6` for instruction following, `xialong-v1` for prose — and switch the five existing extraction callsites over to instruct.

**Architecture:** One resolver, `resolveModel(capability)`, becomes the single answer to "which model, and is it Xialong." Both `buildModelParams` and `appendXialongStyleMessage` route through it, so a callsite that asks for `"instruct"` automatically stops receiving Xialong style guidance — the two cannot drift. `generation-engine` stops re-deriving the model for token counting and reads the one already resolved into `params`.

**Tech Stack:** TypeScript (strict), vitest, NovelAI script API.

## Global Constraints

- Phase 3 of 6 on branch `claude/story-engine-agentic-loop-ti2pgk`. Do **not** push; the parent session pushes.
- `project.yaml` version is `0.15.0` and was already bumped for this PR. **Do not bump it again.**
- CLAUDE.md is binding. Notably: no `any` casts around API interactions; no singletons; trust `external/script-types.d.ts`.
- Prompts live in `src/core/utils/prompts.ts`, never in `project.yaml`. `XIALONG_STYLE` blocks stay where they are.
- Baseline before this phase: **640 tests / 62 files**, `tsc` clean, `npx prettier --check .` clean.
- `npm run build` rewrites `project.yaml`'s `updatedAt`; run `git checkout -- external/ project.yaml` afterwards.
- Every commit ends with the `Co-Authored-By:` / `Claude-Session:` trailers.

## Background: why this is not a one-line addition

Design §8 describes phase 3 as "add the parameter to `buildModelParams()` with a `creative` default. Pure addition, no behaviour change." Two things the spec did not account for turned up in the callsite survey:

1. **`countUncachedInputTokens` resolves the model a second time.** `generation-engine.ts:220,232` calls `await getModel()` rather than using the model already sitting in `params`. Today that is harmless because every request uses the same model. The moment one callsite asks for `"instruct"`, cache accounting is measured against a model the request is not using — and phase 4's pacing reads that instrumentation.

2. **`appendXialongStyleMessage` gates on the global `xialong_mode`, not on this call's capability.** `createLorebookKeysFactory` (`lorebook-strategy.ts:241`) and all three summary factories (`summary-strategy.ts:107,145,203`) append a Xialong style block. Flipping them to instruct without changing that gate would send Xialong prose-style guidance to GLM — worse than either consistent choice.

So the resolver is shared rather than `buildModelParams` growing a parameter alone.

## File Structure

| file                                                   | responsibility                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/core/utils/config.ts` (modify)                    | `Capability`, `resolveModel`, capability-aware `buildModelParams` and `appendXialongStyleMessage` |
| `src/core/store/effects/generation-engine.ts` (modify) | count tokens against the resolved `params.model`                                                  |
| `src/core/utils/lorebook-strategy.ts` (modify)         | keys factories → instruct                                                                         |
| `src/core/utils/summary-strategy.ts` (modify)          | three summary factories → instruct                                                                |
| `src/core/utils/forge-chat-strategy.ts` (modify)       | cleanup strategy → instruct                                                                       |
| `tests/core/utils/model-capability.test.ts` (create)   | the resolver and both consumers                                                                   |
| `tests/core/utils/instruct-callsites.test.ts` (create) | the five flipped callsites, asserted through the real factories                                   |

---

### Task 1: The capability resolver

**Files:**

- Modify: `src/core/utils/config.ts`
- Test: `tests/core/utils/model-capability.test.ts`

**Interfaces:**

- Produces: `type Capability = "creative" | "instruct"`;
  `resolveModel(capability?: Capability): Promise<{ model: string; xialong: boolean }>`;
  `buildModelParams(base, capability?: Capability)`;
  `appendXialongStyleMessage(messages, styleBlock, capability?: Capability)`.
- All three default to `"creative"`, so every existing callsite keeps its current behaviour untouched.

- [ ] **Step 1: Write the failing test**

Create `tests/core/utils/model-capability.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveModel,
  buildModelParams,
  appendXialongStyleMessage,
} from "../../../src/core/utils/config";

/** xialong_mode is the only config key these functions read. */
function xialongMode(on: boolean) {
  vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
    key === "xialong_mode" ? on : undefined,
  );
}

describe("resolveModel", () => {
  beforeEach(() => vi.mocked(api.v1.config.get).mockReset());

  it("uses GLM for everything when Xialong Mode is off", async () => {
    xialongMode(false);
    expect(await resolveModel("creative")).toEqual({
      model: "glm-4-6",
      xialong: false,
    });
    expect(await resolveModel("instruct")).toEqual({
      model: "glm-4-6",
      xialong: false,
    });
  });

  it("uses Xialong for creative work when Xialong Mode is on", async () => {
    xialongMode(true);
    expect(await resolveModel("creative")).toEqual({
      model: "xialong-v1",
      xialong: true,
    });
  });

  it("keeps instruct work on GLM even when Xialong Mode is on", async () => {
    // This is the whole point: xialong_mode means "use Xialong for prose",
    // not "use Xialong for everything".
    xialongMode(true);
    expect(await resolveModel("instruct")).toEqual({
      model: "glm-4-6",
      xialong: false,
    });
  });

  it("defaults to creative", async () => {
    xialongMode(true);
    expect(await resolveModel()).toEqual(await resolveModel("creative"));
  });
});

describe("buildModelParams", () => {
  beforeEach(() => vi.mocked(api.v1.config.get).mockReset());

  it("applies the Xialong sampler shape only for creative work", async () => {
    xialongMode(true);
    const creative = await buildModelParams({ max_tokens: 10, min_p: 0.1 });
    expect(creative).toEqual({
      model: "xialong-v1",
      top_k: 250,
      top_p: 0.95,
      max_tokens: 10,
    });

    // Instruct keeps min_p and gains no Xialong sampler overrides.
    const instruct = await buildModelParams(
      { max_tokens: 10, min_p: 0.1 },
      "instruct",
    );
    expect(instruct).toEqual({
      model: "glm-4-6",
      max_tokens: 10,
      min_p: 0.1,
    });
  });

  it("is unchanged for existing callsites that pass no capability", async () => {
    xialongMode(false);
    expect(await buildModelParams({ max_tokens: 64 })).toEqual({
      model: "glm-4-6",
      max_tokens: 64,
    });
  });
});

describe("appendXialongStyleMessage", () => {
  beforeEach(() => vi.mocked(api.v1.config.get).mockReset());

  it("appends for creative work in Xialong Mode", async () => {
    xialongMode(true);
    const messages: Message[] = [];
    await appendXialongStyleMessage(messages, "[ Style: terse ]");
    expect(messages).toHaveLength(1);
  });

  it("does not append for instruct work, even in Xialong Mode", async () => {
    // The style block is guidance for a model this call is not using. Sending
    // it to GLM is worse than either consistent choice.
    xialongMode(true);
    const messages: Message[] = [];
    await appendXialongStyleMessage(messages, "[ Style: terse ]", "instruct");
    expect(messages).toEqual([]);
  });

  it("does not append when Xialong Mode is off", async () => {
    xialongMode(false);
    const messages: Message[] = [];
    await appendXialongStyleMessage(messages, "[ Style: terse ]");
    expect(messages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/utils/model-capability.test.ts`
Expected: FAIL — `resolveModel` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/core/utils/config.ts`, replace `getModel` and rewrite the two consumers:

```ts
/** What a generation needs from a model.
 *
 *  `glm-4-6` follows instructions markedly more reliably; `xialong-v1` is a
 *  creative-writing fine-tune of it. Splitting the two means `xialong_mode`
 *  finally says what it always meant — use Xialong for prose — rather than
 *  "use Xialong for literally every call, including comma-separated key lists".
 *
 *  Everything defaults to "creative", so a callsite that does not care keeps
 *  exactly the behaviour it had before this existed. */
export type Capability = "creative" | "instruct";

/**
 * The single answer to "which model, and is it Xialong". Everything that varies
 * by model resolves here — params AND message shaping — so a callsite cannot
 * end up on GLM while still being handed Xialong style guidance.
 */
export async function resolveModel(
  capability: Capability = "creative",
): Promise<{ model: string; xialong: boolean }> {
  const xialong = capability === "creative" && (await isXialongMode());
  return { model: xialong ? XIALONG_MODEL : GLM_MODEL, xialong };
}

/**
 * Build generation params for the active model and capability.
 * Xialong (creative only): removes min_p, adds top_k: 250, top_p: 0.95.
 * Otherwise passes base params through with glm-4-6.
 */
export async function buildModelParams(
  base: Omit<GenerationParams, "model">,
  capability: Capability = "creative",
): Promise<GenerationParams> {
  const { model, xialong } = await resolveModel(capability);
  if (xialong) {
    const { min_p: _min_p, ...rest } = base;
    return { model, top_k: 250, top_p: 0.95, ...rest };
  }
  return { model, ...base };
}

/**
 * Append a Xialong style guidance message immediately before the assistant
 * prefill — only when this call is actually going to Xialong. An instruct call
 * never gets one, whatever xialong_mode says.
 */
export async function appendXialongStyleMessage(
  messages: Message[],
  styleBlock: string,
  capability: Capability = "creative",
): Promise<void> {
  const { xialong } = await resolveModel(capability);
  if (xialong) {
    messages.push({ role: "user", content: styleBlock });
  }
}
```

Delete `getModel()`. Task 2 removes its last caller; leaving it is an invitation
to resolve the model a third way. If `tsc` complains about a caller you did not
expect, that caller is a bug this phase should fix — report it rather than
restoring the function.

Keep `isXialongMode()` exported: `chat-strategy.ts:58,146` and
`lorebook-strategy.ts:184` use it for prefill/stop shaping on callsites that stay
creative, so it is still correct for them.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/core/utils/model-capability.test.ts`
Expected: PASS, 9 tests. Then `npm test` — expect the suite green EXCEPT for
`generation-engine`'s now-missing `getModel` import, which Task 2 fixes. If `tsc`
fails only on `generation-engine.ts`, that is the expected intermediate state;
proceed to Task 2 in the same session and commit once, at the end of Task 2.

- [ ] **Step 5: Do not commit yet**

Task 1 and Task 2 land as one commit — deleting `getModel` breaks the build until
Task 2 rewires its caller, and the plan does not leave a non-compiling tree.

---

### Task 2: Count tokens against the model the request will actually use

**Files:**

- Modify: `src/core/store/effects/generation-engine.ts:214-236`
- Test: `tests/core/utils/model-capability.test.ts` (append)

**Interfaces:**

- Consumes: `Capability`, `resolveModel` (Task 1).

- [ ] **Step 1: Write the failing test**

Append to `tests/core/utils/model-capability.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("the model is resolved exactly once per request", () => {
  it("generation-engine counts tokens against params.model", () => {
    // countUncachedInputTokens must be told the model the request is actually
    // using. Re-deriving it from global config means an instruct request is
    // accounted against Xialong's tokeniser — and phase 4's pacing reads this
    // instrumentation.
    const src = readFileSync(
      join(__dirname, "../../../src/core/store/effects/generation-engine.ts"),
      "utf8",
    );
    expect(src).not.toContain("getModel()");
    expect(src).toContain("apiParams.model");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/utils/model-capability.test.ts`
Expected: FAIL — the source still contains `getModel()`.

- [ ] **Step 3: Rewire the two callsites**

In `src/core/store/effects/generation-engine.ts`, both token counts become
`apiParams.model`. In the factory branch the `Object.assign(apiParams, result.params)`
above it has already applied any per-factory override, so `apiParams.model` is the
final value:

```ts
const uncached = await api.v1.script.countUncachedInputTokens(
  result.messages,
  apiParams.model,
);
```

and in the plain-messages branch:

```ts
const uncached = await api.v1.script.countUncachedInputTokens(
  messages,
  apiParams.model,
);
```

Then remove `getModel` from the file's imports. `noUnusedLocals` will flag it if
you forget.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — must be clean now (Task 1's deletion is resolved).
Run: `npm test` — expect **649 tests / 63 files** (640 baseline + 9 from Task 1 + 1
here... count what you actually get and report it; the arithmetic here is a guide,
not an assertion).

- [ ] **Step 5: Build, format, commit**

```bash
npm run build && npm run format
git checkout -- external/ project.yaml
git add -A
git commit -m "feat(model): resolve model by capability, not by global mode

Generations that follow instructions and generations that write prose want
different models. resolveModel(capability) is now the single answer to which
model and whether it is Xialong, and both buildModelParams and
appendXialongStyleMessage go through it — so an instruct call cannot end up on
GLM while still being handed Xialong style guidance.

Everything defaults to creative, so no existing callsite changes behaviour yet.
generation-engine stops re-deriving the model for token counting and reads the
one already resolved into params: with per-request models that second lookup
would have accounted requests against a tokeniser they were not using.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY"
```

---

### Task 3: Flip the five extraction callsites to instruct

**Files:**

- Modify: `src/core/utils/lorebook-strategy.ts:246, 276` (and the style append at `:241`)
- Modify: `src/core/utils/summary-strategy.ts:111, 130, 149, 207` (and the style appends at `:107, 145, 203`)
- Modify: `src/core/utils/forge-chat-strategy.ts:302`
- Modify: `src/core/store/effects/summary-generation.ts:69, 104, 138, 254` — the
  **outer** params for the same three summary strategies (see the sampler-leak
  note below; these are not optional)
- Test: `tests/core/utils/instruct-callsites.test.ts`

**Interfaces:**

- Consumes: `Capability` (Task 1).

These five emit structured output that no reader ever sees as prose. Everything
else — bootstrap, lorebook **content**, chat, forge chat, the Foundation fields —
is prose someone reads and stays `"creative"`. Do not flip anything not listed.

| callsite                                 | what it emits                       |
| ---------------------------------------- | ----------------------------------- |
| `createLorebookKeysFactory`              | comma-separated activation keys     |
| `buildLorebookKeysPayload`               | the same, non-factory path          |
| `createEntitySummaryFactory`             | one-line SE-internal entity summary |
| `createEntitySummaryFromLorebookFactory` | the same, seeded from lorebook text |
| `createThreadSummaryFactory`             | one-line thread summary             |
| `buildForgeCleanupStrategy`              | structured cleanup                  |

That is six functions across five conceptual callsites — `buildLorebookKeysPayload`
is the non-factory twin of the keys factory and must move with it, or the two paths
disagree about which model writes keys.

**The sampler leak: why `summary-generation.ts` must flip too.** Each of the three
summary strategies builds params **twice** — once in the factory
(`summary-strategy.ts`) and once at the dispatch site
(`summary-generation.ts:69, 104, 138, 254`). the two are merged
per-key: `nai-gen-x` does it for the first request
(`params = { ...params, ...resolved.params }`), and `generation-engine`'s own
`apiParams = { ...outer }` / `Object.assign(apiParams, factory.params)` governs the
token count and any continuation. Same semantics either way.
Factory keys win, but keys the factory does not set **survive from the outer
object**. So flipping only the factory produces a mongrel whenever Xialong Mode is
on:

| source                    | contributes                                                     |
| ------------------------- | --------------------------------------------------------------- |
| outer, still `"creative"` | `model: xialong-v1`, `top_k: 250`, `top_p: 0.95` (no `min_p`)   |
| factory, now `"instruct"` | `model: glm-4-6`, `min_p: 0.05`                                 |
| **merged, actually sent** | `model: glm-4-6` **plus Xialong's `top_k`/`top_p`** and `min_p` |

GLM ends up sampling under a configuration neither branch intends, and
`Object.assign` cannot clear `top_k`/`top_p` because the factory never mentions
them. Flip all four outer calls to `"instruct"` in the same commit. They carry no
style append — only the `buildModelParams` argument changes.

- [ ] **Step 1: Write the failing test**

Create `tests/core/utils/instruct-callsites.test.ts`. The `makeState` fixture below
is adapted from `tests/core/utils/summary-strategy.test.ts:7-23` — keep it in step
with that one if the slices it touches change.

Note the two shapes involved. The summary/keys **factories** take
`(getState, id)` and return a `MessageFactory`; calling that factory yields
`{ messages, params }`. `buildLorebookKeysPayload(getState, entryId, requestId)`
instead returns a payload object with `params` directly and a `messageFactory`
you call separately.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildLorebookKeysPayload,
  createLorebookKeysFactory,
} from "../../../src/core/utils/lorebook-strategy";
import {
  createEntitySummaryFactory,
  createEntitySummaryFromLorebookFactory,
  createThreadSummaryFactory,
} from "../../../src/core/utils/summary-strategy";
import type { RootState } from "../../../src/core/store";

function makeState(): RootState {
  return {
    world: {
      entitiesById: {
        e1: {
          id: "e1",
          categoryId: "dramatisPersonae",
          name: "Ada",
          summary: "",
          lifecycle: "live",
          lorebookEntryId: "lb1",
        },
      },
      entityIds: ["e1"],
      groups: [{ id: "g1", name: "A thread", entityIds: ["e1"] }],
    },
    foundation: { shape: null, intent: "", worldState: "" },
    ui: { activeEditId: null },
    story: { fields: {} },
  } as unknown as RootState;
}

const getState = () => makeState();

function xialongOn() {
  vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
    key === "xialong_mode" ? true : undefined,
  );
}

/** A Xialong style block is recognisable by its opening token. */
function styleBlocks(messages: Message[]): Message[] {
  return messages.filter((m) => m.content.includes("[ Style"));
}

describe("extraction callsites stay on the instruct model", () => {
  beforeEach(() => {
    vi.mocked(api.v1.config.get).mockReset();
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
    xialongOn();
  });

  it("builds the keys payload on GLM even in Xialong Mode", async () => {
    const payload = await buildLorebookKeysPayload(getState, "lb1", "r1");
    expect(payload.params.model).toBe("glm-4-6");
  });

  it("sends no Xialong style block with a keys request", async () => {
    const { messages } = await createLorebookKeysFactory(getState, "lb1")();
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("generates an entity summary on GLM, with no style block", async () => {
    const { messages, params } = await createEntitySummaryFactory(
      getState,
      "e1",
    )();
    expect(params?.model).toBe("glm-4-6");
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("generates a lorebook-seeded summary on GLM, with no style block", async () => {
    const { messages, params } = await createEntitySummaryFromLorebookFactory(
      getState,
      "e1",
    )();
    expect(params?.model).toBe("glm-4-6");
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("generates a thread summary on GLM, with no style block", async () => {
    const { messages, params } = await createThreadSummaryFactory(
      getState,
      "g1",
    )();
    expect(params?.model).toBe("glm-4-6");
    expect(styleBlocks(messages)).toEqual([]);
  });
});
```

**Also retire the Task 2 source-grep.** `model-capability.test.ts` currently
asserts that `generation-engine.ts` contains the string `apiParams.model` — which
passes if the string appears in a comment and never ties the value to the
`countUncachedInputTokens` argument. Now that a real instruct callsite exists, test
the chain instead. `tests/setup.ts:34` already mocks `countUncachedInputTokens` as a
`vi.fn`, and `tests/core/store/effects/generation-engine-continuation.test.ts` shows
how to drive `registerGenerationEngineEffects` against a stub GenX. Add one case
that submits a flipped strategy and asserts the counted model:

```ts
expect(vi.mocked(api.v1.script.countUncachedInputTokens).mock.calls[0][1]).toBe(
  "glm-4-6",
);
```

Then delete the two `expect(src)…` assertions from `model-capability.test.ts`. If
driving the engine turns out to cost more than ~50 lines, keep the grep and say so
in your report rather than sinking the task into harness work.

Add a sixth case for `buildForgeCleanupStrategy` (`forge-chat-strategy.ts:269`).
Read its signature and the fixture in
`tests/core/utils/forge-chat-strategy.test.ts` before writing it — its inputs
differ from the summary factories' and are not worth guessing at here.

Two things may need adapting, and both are fine to change as long as you say so
in your report: `createLorebookKeysFactory` may need a lorebook entry present in
the `api.v1.lorebook` mock to produce messages at all, and
`createEntitySummaryFromLorebookFactory` returns early with empty messages when
the entity has no `lorebookEntryId` — the fixture above sets one so the real path
runs. If a factory's return type makes `params` optional, use `params?.model` as
shown rather than adding a non-null assertion.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/utils/instruct-callsites.test.ts`
Expected: FAIL — the keys payload reports `xialong-v1`.

- [ ] **Step 3: Pass the capability at each callsite**

At each of the six, pass `"instruct"` to **both** the params build and the style
append. Missing the style append is the failure mode this phase exists to avoid:

```ts
    await appendXialongStyleMessage(
      messages,
      XIALONG_STYLE.lorebookKeys,
      "instruct",
    );
    // …
      params: await buildModelParams({ max_tokens: 256 }, "instruct"),
```

`buildForgeCleanupStrategy` (`forge-chat-strategy.ts:302`) has no style append —
only its `buildModelParams` changes.

Leave the `XIALONG_STYLE.lorebookKeys` and `XIALONG_STYLE.summary` constants in
`prompts.ts`. They are now unreachable, but deleting prompts is a separate change
and `prompts.test.ts` may assert on them.

- [ ] **Step 4: Verify the flip**

Run: `npx vitest run tests/core/utils/instruct-callsites.test.ts`
Expected: PASS.

Then confirm the tests have teeth: revert one `"instruct"` argument, re-run, and
capture the actual failure. Revert your revert.

- [ ] **Step 5: Full suite**

Run: `npm test`

Some existing strategy tests may assert on a model name or on the presence of a
style block for these six functions. A test that now fails because keys come from
GLM is **asserting the old behaviour** and should be updated to the new
expectation — but read each one before changing it, and if a failure looks like a
real regression rather than a moved goalpost, stop and report it instead.

- [ ] **Step 6: Build, format, commit**

```bash
npm run build && npm run format
git checkout -- external/ project.yaml
git add -A
git commit -m "feat(model): generate keys and summaries on the instruct model

Activation keys and entity/thread summaries are extraction, not prose — nobody
reads them as writing. In Xialong Mode they were being produced by a
creative-writing fine-tune, which is exactly where a prose model editorialises
instead of emitting the comma-separated list it was asked for. They now request
the instruct capability, which also means they stop being handed a Xialong style
block they were never going to honour.

Lorebook content, bootstrap, chat, forge chat and the Foundation fields are
unchanged: those are prose a reader sees.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY"
```

---

### Task 4: Changelog and spec

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md` (§8)

- [ ] **Step 1: Changelog**

Append to the existing `## [0.15.0]` → `### Changed` list. Match the register of
the neighbouring bullets — release notes for a writer, not commit summaries:

```markdown
- **Keys and summaries are now generated by the model that is good at them.** Story Engine uses two models: one tuned for prose, one that follows instructions more reliably. Activation keys and the short internal summaries behind each entity and Thread are extraction work — nobody reads them as writing — so they now always go to the instruction-following model, even with Xialong Mode on. In practice that means fewer keys lists that arrive with commentary attached. Everything you actually read — the opening scene, lorebook entry text, chat, the Forge, and the Foundation fields — is unchanged and still written by the prose model.
```

- [ ] **Step 2: Spec**

§8 currently says defaulting to creative "preserves the exact current behaviour at
all existing callsites with zero churn." That is still true of the mechanism but no
longer true of the phase. Append to §8:

```markdown
**Implemented in phase 3, with two corrections to the above.** First, the
capability had to be threaded through `appendXialongStyleMessage` as well as
`buildModelParams` — the style block gated on the global `xialong_mode`, so an
instruct callsite would otherwise have received Xialong prose guidance for a model
it was not using. Both now route through a shared `resolveModel(capability)`, which
is the only place either question is answered. Second, `countUncachedInputTokens`
in `generation-engine` resolved the model a second time via `getModel()`; with
per-request models that accounted requests against the wrong tokeniser, so it now
reads `params.model` and `getModel()` is gone.

The five extraction callsites (lorebook keys, entity summaries, thread summaries,
forge cleanup) were flipped to `"instruct"` in the same phase rather than left for
the loop, so the parameter ships exercised rather than dormant.
```

- [ ] **Step 3: Verify and commit**

Run: `npm run format && npx prettier --check .`
Expected: "All matched files use Prettier code style!"

Do **not** bump `project.yaml`.

```bash
git add CHANGELOG.md docs/
git commit -m "docs: note per-capability model selection

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY"
```

---

## Verification

From a clean state:

```bash
npm ci && npm test && npx tsc --noEmit && npm run build && npx prettier --check .
```

Then load the build into a **scratch story** with Xialong Mode **on**, and check
the thing no unit test can reach:

1. Generate lorebook keys for an entity. They should arrive as a clean
   comma-separated list, without a preamble or trailing commentary.
2. Generate an entity summary. One line, no prose flourish.
3. Generate lorebook **content** for the same entity. This should still read like
   Xialong — the flip must not have leaked into prose.
4. Run a Forge session. Conversation and entity proposals unchanged.
5. Generate an opening scene. Unchanged.

## Out of scope for this phase

- **The loop itself** (phases 4–6). This phase only makes per-request models
  possible and switches the callsites that already exist.
- **Deleting the now-unreachable `XIALONG_STYLE.lorebookKeys` / `.summary`
  constants.** Dead prompt text is harmless and `prompts.test.ts` may assert on it;
  removing prompts is its own change.
- **The `"[ Style"` entry in the keys factory's inline stop list
  (`lorebook-strategy.ts:253`).** After the flip it guards against a token GLM is
  no longer primed to emit. A stop that never fires costs nothing, and deleting it
  would make the diff harder to read against this plan. Note that
  `LOREBOOK_CHAIN_STOPS` — which also contains `"\n[ Style"` — is **not** affected
  at all: its three consumers are lorebook content, refine, and output trimming,
  none of which this phase flips.
- **`buildModelParams`'s spread order**, where `...rest` lets a caller override the
  Xialong `top_k`/`top_p` while `min_p` is unconditionally stripped. No caller in
  `src/` passes either, so there is no reachable bug — and "fixing" it means
  deciding what a deliberate `top_k` from a caller _should_ do, which nobody has
  had cause to express. Deciding that under cover of this phase would be inventing
  intent. Leave it for a cleanup with its own test.
- **Making `chat-strategy` and `lorebook-strategy`'s direct `isXialongMode()` calls
  capability-aware.** Both sit on callsites that stay creative, so the global read
  is still the right answer there. It stops being right only if one of those
  callsites is ever flipped.
- **Exposing capability in `project.yaml`.** Which model suits which task is a
  property of the task, not a user preference.
