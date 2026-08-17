# Loop Harness and HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Engine wakes on generation, reads the prose written since it last looked, asks one small model call what needs attention, and records the answer as intents — plus a HUD that makes all of that observable. **Triage only: intents are enqueued and logged, never executed.**

**Architecture:** A pure `(state, event) → state` reducer owns the pass lifecycle and is table-tested headless. An effect drives it against the real APIs. Assessment is pure string work over document sections past a persisted watermark. Triage is a single `"instruct"` generation. The HUD is a `scriptPanel` wrapping a Preact root, reading a **loop**-state model that is deliberately not `genx.status`.

**Tech Stack:** TypeScript (strict), Preact/JSX, vitest, NovelAI script API.

## Global Constraints

- Phase 4 of 6 on branch `claude/story-engine-agentic-loop-ti2pgk`. Do **not** push; the parent session pushes.
- `project.yaml` version is `0.15.0` and was already bumped for this PR. **Do not bump it again.**
- CLAUDE.md is binding. Load-bearing here: no `updateParts` in `src/`; never swap a component _type_ at a fixed position (mount both, toggle `display`); `disabled` is **not** a re-entry guard; `onInput` not `onChange`; no singletons — wire dependencies in `src/index.ts` / `register-effects.ts`.
- **Prompts go in `src/core/utils/prompts.ts` as named exports.** `project.yaml` carries runtime settings only.
- **`api.v1.hooks.register` holds ONE callback per hook name.** `onHistoryNavigated` already has its single home in `history-sync.ts` with a source guard. `onGenerationRequested` is currently unregistered anywhere in `src/` — this phase claims it, and must guard it the same way.
- Baseline entering this phase: **666 tests / 65 files**, `tsc` clean, `npx prettier --check .` clean.
- `npm run build` rewrites `project.yaml`'s `updatedAt`; run `git checkout -- external/ project.yaml` afterwards.
- Every commit ends with the `Co-Authored-By:` / `Claude-Session:` trailers.

## What this phase does NOT do

Executing intents is phase 6. `drain` exists in the machine and in the effect, but its only action is to log. Nothing in this phase writes a lorebook entry, creates a Thread, or retires anything. `Thread` replacing `WorldGroup` is phase 5 — keep using `WorldGroup`.

## File Structure

| file                                              | responsibility                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `src/core/engine/loop-machine.ts` (create)        | pure `(state, event) → state` + selectors. No API calls.             |
| `src/core/engine/assess.ts` (create)              | pure: new prose past the watermark → an assessment manifest          |
| `src/core/engine/intents.ts` (create)             | `Intent` types, queue reducers, persistence shape                    |
| `src/core/engine/refusal.ts` (create)             | classify a generation failure; bounded backoff schedule              |
| `src/core/engine/triage-strategy.ts` (create)     | the triage `messageFactory` + params (`"instruct"`)                  |
| `src/core/store/effects/engine-loop.ts` (create)  | the effect: trigger registration, drives the machine                 |
| `src/core/store/slices/engine.ts` (create)        | loop state in the store, so the HUD can subscribe                    |
| `src/ui/hud/hud-model.ts` (create)                | pure `derive()` for the HUD's slots — the ONLY reader of loop status |
| `src/ui/hud/Hud.tsx` (create)                     | the modeline component                                               |
| `src/ui/mount.ts` (modify)                        | third entry in the single `ui.register()` call                       |
| `src/core/store/persistence/keyspace.ts` (modify) | `watermark` and `queue` records                                      |
| `src/core/utils/prompts.ts` (modify)              | `TRIAGE_SYSTEM`, `TRIAGE_INSTRUCTION`                                |
| `project.yaml` (modify)                           | `engine_enabled`, `engine_delay_ms`, `engine_min_prose`              |

---

### Task 1: The pass state machine

**Files:**

- Create: `src/core/engine/loop-machine.ts`
- Test: `tests/core/engine/loop-machine.test.ts`

**Interfaces:**

- Produces: `LoopState`, `LoopEvent`, `initialLoopState`, `loopReducer(state, event): LoopState`, `canStartPass(state): boolean`.

The machine is `assess → triage → enqueue → drain → idle` (design §3.2) plus the two
conditions the HUD shows: `held` (budget exhausted) and `stalled` (cannot make
progress at all). It is pure — no `api.v1`, no promises, no store access — so the
whole lifecycle is table-testable.

- [ ] **Step 1: Write the failing test**

Create `tests/core/engine/loop-machine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  initialLoopState,
  loopReducer,
  canStartPass,
  type LoopEvent,
  type LoopState,
} from "../../../src/core/engine/loop-machine";

/** Fold a sequence of events, the way the effect does. */
function run(events: LoopEvent[], from: LoopState = initialLoopState) {
  return events.reduce(loopReducer, from);
}

describe("loopReducer — the happy path", () => {
  it("walks assess → triage → drain → idle", () => {
    const s1 = loopReducer(initialLoopState, { type: "passRequested" });
    expect(s1.phase).toBe("assessing");

    const s2 = loopReducer(s1, {
      type: "assessed",
      backlog: 12,
      candidateIds: ["e1"],
    });
    expect(s2.phase).toBe("triaging");
    expect(s2.backlog).toBe(12);

    const s3 = loopReducer(s2, { type: "triaged", intents: [] });
    // Nothing to do: straight to idle rather than a pointless drain.
    expect(s3.phase).toBe("idle");
  });

  it("drains when triage produced intents", () => {
    const s = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 12, candidateIds: [] },
      { type: "triaged", intents: [{ kind: "revise", entityId: "e1" }] },
    ]);
    expect(s.phase).toBe("acting");
    expect(s.queued).toBe(1);
  });

  it("ends the pass at zero cost when there is too little new prose", () => {
    const s = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 0, candidateIds: [] },
    ]);
    expect(s.phase).toBe("idle");
  });
});

describe("loopReducer — the conditions the HUD shows", () => {
  it("holds when the budget cannot cover the next step", () => {
    const s = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 12, candidateIds: [] },
      { type: "budgetExhausted" },
    ]);
    expect(s.phase).toBe("held");
  });

  it("leaves held on the next pass request", () => {
    const held = run([
      { type: "passRequested" },
      { type: "assessed", backlog: 9, candidateIds: [] },
      { type: "budgetExhausted" },
    ]);
    expect(loopReducer(held, { type: "passRequested" }).phase).toBe(
      "assessing",
    );
  });

  it("stalls only after repeated failures, not after one", () => {
    // A single refusal is routine (§3.4) and must never reach the HUD.
    let s = run([{ type: "passRequested" }, { type: "failed" }]);
    expect(s.phase).toBe("idle");
    expect(s.consecutiveFailures).toBe(1);

    for (let i = 0; i < 3; i++) {
      s = loopReducer(loopReducer(s, { type: "passRequested" }), {
        type: "failed",
      });
    }
    expect(s.phase).toBe("stalled");
  });

  it("clears the stall as soon as a pass completes", () => {
    let s = initialLoopState;
    for (let i = 0; i < 4; i++) {
      s = loopReducer(loopReducer(s, { type: "passRequested" }), {
        type: "failed",
      });
    }
    expect(s.phase).toBe("stalled");

    s = run(
      [
        { type: "passRequested" },
        { type: "assessed", backlog: 3, candidateIds: [] },
      ],
      s,
    );
    expect(s.phase).toBe("idle");
    expect(s.consecutiveFailures).toBe(0);
  });
});

describe("canStartPass", () => {
  it("is true when idle or held, false while a pass is under way", () => {
    expect(canStartPass(initialLoopState)).toBe(true);

    const assessing = loopReducer(initialLoopState, { type: "passRequested" });
    expect(canStartPass(assessing)).toBe(false);

    const triaging = loopReducer(assessing, {
      type: "assessed",
      backlog: 5,
      candidateIds: [],
    });
    expect(canStartPass(triaging)).toBe(false);
  });

  it("ignores a second request while a pass is running", () => {
    // The ⚡ is not idempotent and a wasted pass costs real budget, so a press
    // mid-pass must be a no-op rather than a second pass.
    const assessing = loopReducer(initialLoopState, { type: "passRequested" });
    const again = loopReducer(assessing, { type: "passRequested" });
    expect(again).toBe(assessing);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/engine/loop-machine.test.ts`
Expected: FAIL — cannot resolve `loop-machine`.

- [ ] **Step 3: Write the implementation**

Create `src/core/engine/loop-machine.ts`:

```ts
// The pass lifecycle, as a pure reducer.
//
// assess → triage → enqueue → drain → idle (design §3.2), plus the two states
// the HUD needs a name for: `held` when the budget cannot cover the next step,
// and `stalled` when the loop cannot make progress at all.
//
// Pure by construction — no api.v1, no promises, no store. The effect in
// store/effects/engine-loop.ts owns every side effect and feeds events in here.
// That split is what makes the whole lifecycle table-testable headless.
//
// A single failure is NOT a stall. Concurrency refusals are routine (§3.4) and
// surfacing them would train the writer to ignore the one slot that should mean
// something, so `stalled` needs a run of them.

export type LoopPhase =
  "idle" | "assessing" | "triaging" | "acting" | "held" | "stalled";

export type Intent =
  | { kind: "revise"; entityId: string }
  | { kind: "open"; subject: string }
  | { kind: "retire"; groupId: string }
  | { kind: "condense"; entryId: string };

export type LoopState = {
  phase: LoopPhase;
  /** Unread paragraphs past the watermark, as of the last assessment. */
  backlog: number;
  /** Intents enqueued by the last pass. Phase 4 logs these; phase 6 runs them. */
  queued: number;
  /** Entities revised on this branch. Always 0 until phase 6. */
  touched: number;
  consecutiveFailures: number;
};

export type LoopEvent =
  | { type: "passRequested" }
  | { type: "assessed"; backlog: number; candidateIds: string[] }
  | { type: "triaged"; intents: Intent[] }
  | { type: "drained" }
  | { type: "budgetExhausted" }
  | { type: "failed" };

/** Enough consecutive failures that something is genuinely wrong rather than a
 *  routine collision with the writer's own generation. */
const STALL_THRESHOLD = 4;

export const initialLoopState: LoopState = {
  phase: "idle",
  backlog: 0,
  queued: 0,
  touched: 0,
  consecutiveFailures: 0,
};

/** A pass may start from a resting phase only. `held` counts as resting: the
 *  budget may have recovered, and finding out costs nothing. */
export function canStartPass(state: LoopState): boolean {
  return (
    state.phase === "idle" ||
    state.phase === "held" ||
    state.phase === "stalled"
  );
}

export function loopReducer(state: LoopState, event: LoopEvent): LoopState {
  switch (event.type) {
    case "passRequested":
      // Identity, not a copy, when a pass is already under way — the ⚡'s
      // re-entry guard reads this and a new object would look like progress.
      return canStartPass(state) ? { ...state, phase: "assessing" } : state;

    case "assessed": {
      const cleared = {
        ...state,
        backlog: event.backlog,
        consecutiveFailures: 0,
      };
      // Nothing new worth a generation: end the pass having spent nothing.
      if (event.backlog === 0) return { ...cleared, phase: "idle" };
      return { ...cleared, phase: "triaging" };
    }

    case "triaged":
      return event.intents.length === 0
        ? { ...state, phase: "idle", queued: 0 }
        : { ...state, phase: "acting", queued: event.intents.length };

    case "drained":
      return { ...state, phase: "idle", queued: 0 };

    case "budgetExhausted":
      return { ...state, phase: "held" };

    case "failed": {
      const consecutiveFailures = state.consecutiveFailures + 1;
      return {
        ...state,
        consecutiveFailures,
        phase: consecutiveFailures >= STALL_THRESHOLD ? "stalled" : "idle",
      };
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/core/engine/loop-machine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add the pass state machine

A pure (state, event) reducer for assess → triage → drain, plus the two
conditions the HUD needs a name for: held when the budget cannot cover the next
step, stalled when the loop genuinely cannot progress. A single refusal is not a
stall — collisions with the writer are routine, and surfacing them would train
the writer to ignore the one slot that should mean something.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY"
```

---

### Task 2: Assessment — what is new since we last looked

**Files:**

- Create: `src/core/engine/assess.ts`
- Test: `tests/core/engine/assess.test.ts`

**Interfaces:**

- Consumes: `WorldEntity` from `src/core/store/types`.
- Produces:
  `type Assessment = { backlog: number; newText: string; candidateIds: string[] }`;
  `assess(input: { sectionIds: number[]; watermark: number | null; textBySection: Map<number, string>; entities: WorldEntity[] }): Assessment`.

Pure. The effect reads the document and hands the strings in; this decides what
counts as new and which entities are plausibly in play. Zero output tokens, and it
can end the pass before any generation happens.

Candidate matching is deliberately cheap and generous: case-insensitive whole-word
match of an entity's `name` against the new prose. Precision is triage's job — a
false candidate costs a few input tokens in the manifest, a missed one costs a
commitment nobody notices.

- [ ] **Step 1: Write the failing test**

Create `tests/core/engine/assess.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assess } from "../../../src/core/engine/assess";
import type { WorldEntity } from "../../../src/core/store/types";

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: "",
  };
}

const ADA = entity("e1", "Ada");
const BRENNAN = entity("e2", "Brennan");

function input(over: Partial<Parameters<typeof assess>[0]> = {}) {
  return {
    sectionIds: [1, 2, 3],
    watermark: null,
    textBySection: new Map([
      [1, "The first paragraph."],
      [2, "Ada opened the lock."],
      [3, "Rain again."],
    ]),
    entities: [ADA, BRENNAN],
    ...over,
  };
}

describe("assess — backlog", () => {
  it("counts everything when there is no watermark yet", () => {
    expect(assess(input()).backlog).toBe(3);
  });

  it("counts only sections after the watermark", () => {
    expect(assess(input({ watermark: 1 })).backlog).toBe(2);
  });

  it("is zero when the watermark is the last section", () => {
    const a = assess(input({ watermark: 3 }));
    expect(a.backlog).toBe(0);
    expect(a.newText).toBe("");
  });

  it("treats a watermark that no longer exists as unseen", () => {
    // The writer undid past it, or deleted the paragraph. Re-reading is cheap
    // and safe; skipping prose because of a dangling id is not.
    expect(assess(input({ watermark: 99 })).backlog).toBe(3);
  });
});

describe("assess — candidates", () => {
  it("names only entities the new prose actually mentions", () => {
    expect(assess(input({ watermark: 1 })).candidateIds).toEqual(["e1"]);
  });

  it("matches case-insensitively", () => {
    const a = assess(
      input({ watermark: 1, textBySection: new Map([[2, "ADA arrived."]]) }),
    );
    expect(a.candidateIds).toEqual(["e1"]);
  });

  it("does not match a name inside a longer word", () => {
    // "Ada" must not fire on "Adamant" — a false candidate is cheap, but a
    // substring match makes short names fire on nearly everything.
    const a = assess(
      input({
        watermark: 1,
        textBySection: new Map([[2, "The adamant gate held."]]),
      }),
    );
    expect(a.candidateIds).toEqual([]);
  });

  it("ignores an entity with a blank name", () => {
    const a = assess(input({ watermark: 1, entities: [entity("e3", "  ")] }));
    expect(a.candidateIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/engine/assess.test.ts`
Expected: FAIL — cannot resolve `assess`.

- [ ] **Step 3: Write the implementation**

Create `src/core/engine/assess.ts`:

```ts
// The free half of a pass: what is new, and who might be in it.
//
// Pure string work over sections the caller has already read. No generation, so
// this can end a pass at zero cost — which is what makes triage affordable to
// run hot (§3.3).
//
// Candidate matching is cheap and generous on purpose. Precision is triage's
// job. A false candidate costs a few input tokens in the manifest; a missed one
// costs a commitment nobody ever notices.

import type { WorldEntity } from "../store/types";

export type Assessment = {
  /** Sections past the watermark. */
  backlog: number;
  /** Their text, joined — the volatile tail of the triage prompt. */
  newText: string;
  /** Entities the new prose plausibly mentions. */
  candidateIds: string[];
};

export type AssessInput = {
  sectionIds: number[];
  /** The last section observed, or null on a branch never assessed. */
  watermark: number | null;
  textBySection: Map<number, string>;
  entities: WorldEntity[];
};

/** Escape a name for use in a RegExp — names are user text and may contain
 *  anything. */
function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assess(input: AssessInput): Assessment {
  const { sectionIds, watermark, textBySection, entities } = input;

  // A watermark the document no longer contains means the writer undid or
  // deleted past it. Treat everything as unseen: re-reading is cheap, and
  // skipping prose because of a dangling id loses commitments silently.
  const at = watermark === null ? -1 : sectionIds.indexOf(watermark);
  const fresh = sectionIds.slice(at + 1);

  const newText = fresh
    .map((id) => textBySection.get(id) ?? "")
    .filter((t) => t.length > 0)
    .join("\n\n");

  const candidateIds = entities
    .filter((e) => {
      const name = e.name.trim();
      if (name.length === 0) return false;
      // Whole-word: "Ada" must not fire on "Adamant".
      return new RegExp(`\\b${escape(name)}\\b`, "i").test(newText);
    })
    .map((e) => e.id);

  return { backlog: fresh.length, newText, candidateIds };
}
```

- [ ] **Step 4: Run the tests, then commit**

Run: `npx vitest run tests/core/engine/assess.test.ts` — expect PASS.

```bash
git add -A
git commit -m "feat(engine): assess new prose past the watermark

Pure string work over sections the caller has read: how far behind the Engine
is, the text it has not seen, and which entities that text plausibly mentions.
No generation, so a pass can end here having spent nothing — which is what makes
running triage hot affordable.

A watermark the document no longer contains is treated as unseen rather than
trusted: the writer undid past it, and re-reading is cheaper than silently
skipping prose.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY"
```

---

### Task 3: The intent queue, persisted branch-scoped

**Files:**

- Modify: `src/core/engine/loop-machine.ts` (re-export `Intent` if the queue module needs it — keep ONE definition)
- Create: `src/core/engine/intents.ts`
- Modify: `src/core/store/persistence/keyspace.ts`
- Test: `tests/core/engine/intents.test.ts`

**Interfaces:**

- Consumes: `Intent` (Task 1), `PersistRecords` / `PersistIndex` from `keyspace.ts`.
- Produces: `WATERMARK_KEY`, `QUEUE_KEY`; `type EngineRecord = { watermark: number | null; queue: Intent[] }`; `intentKey(i: Intent): string`; `dedupe(existing, incoming): Intent[]`.

Phase 2 deliberately left `watermark` and `queue` out of the keyspace as
speculative. They belong to the loop, so they arrive now — **branch-scoped**, like
the World: a queue built from one continuation's prose is meaningless on another,
and the watermark is a position in a specific branch.

Deletion is still an index write — see `keyspace.ts`'s header. These two are
singleton records rather than indexed collections, so they need no index entry;
they are read directly like `foundation` used to be.

- [ ] **Step 1: Write the failing test**

Create `tests/core/engine/intents.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dedupe, intentKey } from "../../../src/core/engine/intents";
import type { Intent } from "../../../src/core/engine/loop-machine";

const revise = (id: string): Intent => ({ kind: "revise", entityId: id });

describe("intentKey", () => {
  it("distinguishes kinds acting on the same subject", () => {
    expect(intentKey({ kind: "revise", entityId: "x" })).not.toBe(
      intentKey({ kind: "condense", entryId: "x" }),
    );
  });
});

describe("dedupe", () => {
  it("keeps an intent the queue does not already hold", () => {
    expect(dedupe([revise("a")], [revise("b")])).toEqual([
      revise("a"),
      revise("b"),
    ]);
  });

  it("drops a duplicate rather than queueing the same work twice", () => {
    // Triage runs hot and will name the same entity on consecutive passes
    // until the work is actually done. Without this the queue grows without
    // bound on a single unresolved commitment.
    expect(dedupe([revise("a")], [revise("a")])).toEqual([revise("a")]);
  });

  it("drops duplicates within one incoming batch", () => {
    expect(dedupe([], [revise("a"), revise("a")])).toEqual([revise("a")]);
  });

  it("preserves queue order — oldest first", () => {
    const out = dedupe([revise("a"), revise("b")], [revise("c")]);
    expect(out.map((i) => intentKey(i))).toEqual([
      intentKey(revise("a")),
      intentKey(revise("b")),
      intentKey(revise("c")),
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/engine/intents.test.ts` — FAIL, unresolved module.

- [ ] **Step 3: Write the implementation**

Create `src/core/engine/intents.ts`:

```ts
// The intent queue's shape and its one rule: never queue the same work twice.
//
// Triage runs hot (§3.3) and will keep naming the same entity on consecutive
// passes until the work is actually done. Deduping on the way in is what keeps a
// single unresolved commitment from growing the queue without bound.
//
// Phase 4 only enqueues and logs. Phase 6 drains.

import type { Intent } from "./loop-machine";

/** Singleton records, read directly rather than through the index — see
 *  keyspace.ts. Branch-scoped: a queue built from one continuation's prose is
 *  meaningless on another, and a watermark is a position in a specific branch. */
export const WATERMARK_KEY = "watermark";
export const QUEUE_KEY = "queue";

export type EngineRecord = {
  watermark: number | null;
  queue: Intent[];
};

/** Identity of the work, not of the request. Two triage passes naming the same
 *  entity are the same intent. */
export function intentKey(intent: Intent): string {
  switch (intent.kind) {
    case "revise":
      return `revise:${intent.entityId}`;
    case "open":
      return `open:${intent.subject.trim().toLowerCase()}`;
    case "retire":
      return `retire:${intent.groupId}`;
    case "condense":
      return `condense:${intent.entryId}`;
  }
}

/** Append the incoming intents the queue does not already hold, oldest first. */
export function dedupe(existing: Intent[], incoming: Intent[]): Intent[] {
  const seen = new Set(existing.map(intentKey));
  const out = [...existing];
  for (const intent of incoming) {
    const key = intentKey(intent);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(intent);
  }
  return out;
}
```

- [ ] **Step 4: Add the records to the keyspace**

In `src/core/store/persistence/keyspace.ts`, the loop's two records are read and
written by the engine effect directly rather than through `toRecords`/`applyRecords`
— those two functions own the _store's_ slices, and the queue is not a store slice.
Add only a comment under the existing header block recording where they live, so a
future reader does not go looking for them in `toRecords`:

```ts
// The Engine loop's own records — `watermark` and `queue` — are branch-scoped
// too and share this node space, but they are not store slices: the engine
// effect reads and writes them directly through history-store. See
// src/core/engine/intents.ts.
```

- [ ] **Step 5: Run the tests, then commit**

Run: `npx vitest run tests/core/engine/intents.test.ts` — PASS. Then `npm test`.

```bash
git add -A
git commit -m "feat(engine): add the intent queue and its dedupe rule

Triage runs hot and will name the same entity on consecutive passes until the
work is done, so intents dedupe on the way in — otherwise one unresolved
commitment grows the queue without bound. The watermark and queue are
branch-scoped like the World: a queue built from one continuation's prose is
meaningless on another.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY"
```

---

### Task 4: Refusal classification and bounded backoff

**Files:**

- Create: `src/core/engine/refusal.ts`
- Test: `tests/core/engine/refusal.test.ts`

**Interfaces:**

- Produces: `isConcurrencyRefusal(error: unknown): boolean`; `backoffMs(attempt: number): number | null` (null = give up, requeue for the next wakeup); `MAX_ATTEMPTS`.
- Consumed by: Task 7, which passes the result straight through as the `failed`
  event's `retryable` flag. `retryable: true` never counts toward a stall — see
  Task 1's header comment for why.

Design §3.4: the refusal is a bare `Error` with
`message: "A generation is already in progress"` — no status code, no subclass — so
message matching is the only option. **Classify conservatively: anything
unrecognised is non-retryable.** The attempt bound, not the interval, is the real
guard against spinning.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  isConcurrencyRefusal,
  backoffMs,
  MAX_ATTEMPTS,
} from "../../../src/core/engine/refusal";

describe("isConcurrencyRefusal", () => {
  it("recognises the backend's refusal message", () => {
    expect(
      isConcurrencyRefusal(new Error("A generation is already in progress")),
    ).toBe(true);
  });

  it("matches case-insensitively and tolerates surrounding text", () => {
    expect(
      isConcurrencyRefusal(
        new Error("Request failed: a generation is already in progress."),
      ),
    ).toBe(true);
  });

  it("treats an unrecognised failure as non-retryable", () => {
    // Retrying an unknown failure is unlikely to help, and pretending to
    // understand it is how a loop spins on a permanent error.
    expect(isConcurrencyRefusal(new Error("400 Bad Request"))).toBe(false);
    expect(isConcurrencyRefusal("a string")).toBe(false);
    expect(isConcurrencyRefusal(null)).toBe(false);
    expect(isConcurrencyRefusal(undefined)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows with each attempt", () => {
    const a = backoffMs(1);
    const b = backoffMs(2);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b as number).toBeGreaterThan(a as number);
  });

  it("gives up at the bound rather than spinning", () => {
    // A long passage should hand the work back to the next wakeup rather than
    // let one firing spin against a lock that is still held.
    expect(backoffMs(MAX_ATTEMPTS)).toBeNull();
    expect(backoffMs(MAX_ATTEMPTS + 5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — FAIL. Then implement**

Create `src/core/engine/refusal.ts`:

```ts
// Telling a routine collision apart from a real failure.
//
// The backend refuses concurrent requests with a bare Error carrying
// `message: "A generation is already in progress"` — no status code, no
// subclass — so message matching is the only option available (§3.4).
//
// Anything unrecognised is NON-retryable. Not because a retry is expensive (a
// refusal is free — §12.0) but because retrying a failure we do not understand
// is unlikely to help, and the attempt bound is the real guard against spinning.

const REFUSAL = "generation is already in progress";

export const MAX_ATTEMPTS = 3;

const BASE_DELAY_MS = 400;

export function isConcurrencyRefusal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes(REFUSAL);
}

/** Delay before attempt `attempt`, or null once the bound is reached — at which
 *  point the intent is requeued for the next wakeup rather than retried again. */
export function backoffMs(attempt: number): number | null {
  if (attempt >= MAX_ATTEMPTS) return null;
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}
```

- [ ] **Step 3: Run, then commit**

```bash
git add -A
git commit -m "feat(engine): classify concurrency refusals and bound the retry

The backend refuses with a bare Error and no status code, so message matching is
all there is. Anything unrecognised is treated as non-retryable — retrying a
failure we do not understand is unlikely to help, and the attempt bound is what
actually stops a firing spinning against a lock that is still held.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY"
```

---

### Task 5: The triage prompt and strategy

**Files:**

- Modify: `src/core/utils/prompts.ts`
- Create: `src/core/engine/triage-strategy.ts`
- Test: `tests/core/engine/triage-strategy.test.ts`

**Interfaces:**

- Consumes: `Assessment` (Task 2), `Intent` (Task 1), `buildModelParams` + `Capability` (phase 3).
- Produces: `createTriageFactory(input): MessageFactory`; `parseTriage(text: string): Intent[]`.

Triage is **one small `"instruct"` generation** (~150 output tokens) answering only
_what needs attention_. It must never write prose. Read `src/core/utils/prompts.ts`
for the house style before writing the prompt, and follow the layered-prefix
discipline in `src/core/utils/context-builder.ts`: stable manifest first, volatile
new prose last (§8, input side).

**Output format.** One command per line, unknown lines ignored:

```
REVISE <entityName>
OPEN <short subject>
RETIRE <threadTitle>
```

`parseTriage` maps names back to ids against the manifest it was given. A line
naming something that does not exist is dropped, not guessed at.

- [ ] **Step 1: Write the failing test**

Cover, at minimum: each command parses; an unknown verb is ignored; a name not in
the manifest is dropped; matching is case-insensitive; a completely empty response
yields `[]` (the common case on quiet prose); and the factory requests the
**instruct** capability with no Xialong style block (phase 3's rule — assert both,
the same way `tests/core/utils/instruct-callsites.test.ts` does).

- [ ] **Step 2–4: implement, verify, commit**

Add `TRIAGE_SYSTEM` and `TRIAGE_INSTRUCTION` as named exports in `prompts.ts` —
**not** to `project.yaml`. Build the factory with
`buildModelParams({ max_tokens: 200, temperature: 0.3 }, "instruct")` and do **not**
call `appendXialongStyleMessage` at all: triage never writes prose.

---

### Task 6: The trigger

**Files:**

- Modify: `project.yaml` (config only — no version bump)
- Create: `src/core/store/effects/engine-loop.ts` (registration only in this task)
- Test: `tests/core/engine/trigger.test.ts`

**Interfaces:**

- Produces: `registerEngineLoopEffects(deps): void`.

Design §3.1: `onGenerationRequested` with `scriptInitiated: false` schedules a
**one-shot wakeup**. If a wakeup is already pending, a further generation does
**not** reschedule it — the loop fires at most once per window, anchored to the
first generation of a burst.

**The `scriptInitiated` filter is load-bearing.** Without it the Engine's own
generations re-arm the wakeup and drive it in a loop.

**One registration only.** `api.v1.hooks.register` holds one callback per hook name.
Add a source-scan guard exactly like the one in `tests/core/history-sync.test.ts`
("onGenerationRequested has exactly one home"), plus the wiring guard asserting
`register-effects.ts` calls `registerEngineLoopEffects(`.

New `project.yaml` entries (runtime settings, not prompts):

```yaml
- name: engine_enabled
  prettyName: Engine
  type: boolean
  default: false
  description: Wake the Engine after each generation to maintain the World.
- name: engine_delay_ms
  prettyName: Engine delay (ms)
  type: number
  default: 8000
  description: How long after a generation starts the Engine reads what was written.
- name: engine_min_prose
  prettyName: Engine minimum new paragraphs
  type: number
  default: 1
  description: Skip a pass when fewer than this many new paragraphs have appeared.
```

**Default `engine_enabled` to false.** The loop is new, unexercised, and spends the
script's budget; opting in is the honest default for a phase that only logs.

Tests must cover: a user generation arms exactly one wakeup; a second generation
inside the window does **not** arm a second; a `scriptInitiated: true` generation
arms nothing; and nothing is armed at all when `engine_enabled` is false.

---

### Task 7: The pass — wiring it together

**Files:**

- Create: `src/core/store/slices/engine.ts`
- Modify: `src/core/store/effects/engine-loop.ts`
- Modify: `src/core/store/register-effects.ts`, `src/core/store/index.ts`
- Test: `tests/core/engine/pass.test.ts`

The effect owns every side effect: read sections, call `assess`, run triage through
the existing generation path, `dedupe` into the queue, persist watermark and queue,
and mirror `LoopState` into the store so the HUD can subscribe.

**Drain logs only.** `api.v1.log` the intents it would run, advance the machine with
`drained`, and stop. Do not write a lorebook entry, create a group, or retire
anything — that is phase 6.

**Re-entry guard lives here, not in the button.** `canStartPass` is checked in the
effect before a pass starts. CLAUDE.md: `disabled` is a render-time value and a
press arriving before the re-render still gets through.

**Advance the watermark only on a completed pass.** A pass that failed or was
refused must leave the watermark where it was, or the prose it never read is lost
permanently.

**Emit `failed` with `retryable` set from `isConcurrencyRefusal`** (Task 4), never
hardcoded. The machine relies on that flag to keep routine collisions out of the
`⚠` slot; passing `false` for everything would light it up during ordinary
writing, and `true` for everything would make it unreachable.

Tests: a full pass advances the watermark and enqueues; a refused triage leaves the
watermark untouched and the queue unchanged; a second `passRequested` mid-pass is a
no-op; budget below the triage reserve produces `held` without a generation.

---

### Task 8: The HUD model

**Files:**

- Create: `src/ui/hud/hud-model.ts`
- Test: `tests/ui/hud-model.test.ts`

**Interfaces:**

- Produces: `type HudModel = { stateIcon; backlog; threads; touched; budgetBars; zapEnabled }`; `deriveHud(state: RootState, inputs: { allowedOutput: number }): HudModel`.

`deriveHud` is the **only** reader of loop phase in the UI, the same way `derive()`
in `header-model.ts` is the only reader of `genx.status`. Add a guard test modelled
on `tests/ui/countdown.test.ts` asserting no other file under `src/ui/` reads
`engine.phase`.

**It must not read `genx.status` at all** — a different state machine. Assert that
too: `src/ui/hud/` must contain no reference to `genx`.

Slots per §9.1: state · backlog · threads · touched · budget · ⚡.

- `⚠` (stalled) only when the machine says `stalled`. Routine refusals never reach
  it — the machine drops them before the counter. The reading for "colliding
  constantly" is the backlog climbing against a full budget (§9.1), which is a
  compound reading across two slots and needs no state of its own.
- `held` and `stalled` do not clear on their own; they clear when the next pass
  gets somewhere. Do not render them as transient.
- `zapEnabled` mirrors `canStartPass` — but is presentation only; the real guard is Task 7's.

---

### Task 9: The HUD panel

**Files:**

- Create: `src/ui/hud/Hud.tsx`
- Modify: `src/ui/mount.ts`
- Test: `tests/ui/hud-source.test.ts` (static guards — `.tsx` is never collected by vitest)

A `scriptPanel` wrapping one `part.jsx()` with a Preact root — the same construction
`buildJournalPanel()` already uses in `mount.ts:93-107`. It is a **third entry in the
existing single `api.v1.ui.register()` call**; NAI takes one call and later calls
overwrite earlier ones.

**Every state icon stays mounted, toggled by `display`.** The HUD re-renders from a
store subscription and a timer tick — both detached callbacks — and CLAUDE.md's rule
is explicit: swapping a component _type_ at a fixed position leaves both svgs in the
DOM. `Header.tsx`'s `WidgetIcon` is the worked example; follow it.

Budget needs the same `useTick` heartbeat `Header.tsx` uses — `getAllowedOutput()`
is not in the store, so no subscription will move it.

The ⚡ handler dispatches a pass request and nothing else. No `disabled`-as-guard,
no tap debounce (CLAUDE.md forbids reintroducing one).

Static guards to write, since components cannot be render-tested here: the file
contains no `updateParts`; it contains no `genx`; both state-icon variants are
mounted rather than ternary-swapped; `mount.ts` registers exactly one
`api.v1.ui.register(` call.

---

### Task 10: Changelog and spec

**Files:**

- Modify: `CHANGELOG.md`, `docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md`

Changelog bullet in the register of its neighbours — a writer, not a commit log.
Say plainly that the Engine currently **only watches and records**, that it is off
by default, and how to turn it on. Overclaiming here is worse than saying nothing.

Record in §14 that phase 4 shipped triage-only, and note anything the build
contradicted in §3 or §9.1.

Do **not** bump `project.yaml`.

---

## Verification

```bash
npm ci && npm test && npx tsc --noEmit && npm run build && npx prettier --check .
```

Then in a **scratch story**, with `engine_enabled` on:

1. Generate a paragraph. Within the delay the HUD's state icon moves and the backlog
   returns to 0. Nothing is written to the lorebook.
2. Check the log: triage's intents are recorded.
3. Generate three times rapidly. Exactly one pass fires, not three.
4. Undo past a paragraph. The backlog reflects the branch you are on.
5. Press ⚡ with nothing new — a pass runs and ends at `assess` without generating.
6. Press ⚡ twice quickly — the second press is a no-op, not a second pass.
7. Turn `engine_enabled` off. Generate. Nothing fires, and the HUD is still present.

## Out of scope for this phase

- **Executing intents** (phase 6). Drain logs.
- **`Thread` replacing `WorldGroup`** (phase 5). The HUD's thread count reads
  `world.groups.length`.
- **Surfacing the Engine settings in the Setup tab** (§9.2). They live in
  `project.yaml` for now; moving them is a Setup-tab change, not a loop change.
- **`lb:<entryId>` write-records** (§6.2). Nothing writes lorebook entries yet.
- **`createCancellationSignal`** for stopping the Engine (§3.4). There is nothing
  expensive to cancel while drain only logs.
