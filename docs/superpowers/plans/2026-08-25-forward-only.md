# Forward-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Story Engine stops tracking history. The World, the story fields and the
Engine's own records become story-scoped; nothing reverts when the writer undoes;
`onHistoryNavigated` is not registered at all.

**Architecture:** This plan is almost entirely deletion. `historyStorage` goes back
to `storyStorage` as one record, and the machinery that existed to make branch
scoping correct — the sharded keyspace, the node-capture discipline, the navigation
rehydrate, lorebook reconciliation, the write-once snapshots — goes with it.

**Tech Stack:** TypeScript (strict), Preact/JSX, vitest (`environment: "node"`),
NovelAI script API (`api.v1.*`).

## Why

**The World is a notebook, not a projection of the document.** The writer and the
Engine keep notes about the story; undoing a paragraph does not unlearn what was
written down. That is one sentence a writer can hold, and it is the contract this
plan implements.

Branch scoping was built to answer a real question — undo past a character's
creation and the character goes with it — and it answered it at a cost the rest of
the design kept paying: node capture at dispatch time, a keyspace whose deletions
are index writes because `remove()` means "revert to the parent", the off-path write
question, reconciliation for a lorebook that does not revert, and write-once
snapshots for a restore surface that was never built. Two whole-phase reviews found
defects in that machinery and a third design pass was about to add more.

**The lorebook half is leaving too, and to a better home.** "Lorebook entries revert
with story history" needs no World, no entities and no threads — it needs
`lorebook.entries()` and `onHistoryNavigated`, and it would work in a story that has
never had Story Engine installed. It is a separate script, designed separately.
Story Engine's promise narrows honestly: **Story Engine's records move forward;
your lorebook is your lorebook's business.**

## What the writer loses

Two continuations from one point now share one World. Explore a branch where Ada
dies, back out, and the World still says she is dead. Deleting an entity is how a
writer undoes that. This is the accepted cost and the changelog says so plainly.

## Global Constraints

- **Version stays `0.15.0`.** It has not shipped, so the CHANGELOG's 0.15.0 section
  is **rewritten**, not appended to. **Do not touch `project.yaml`** — if a build
  rewrites `updatedAt`, revert **only that line**.
- **Alpha, no migrations.** Existing branch-scoped data is not read and not
  converted. Story Engine's state resets once more on upgrade.
- **Deletion is the deliverable.** Where a file's whole reason was branch scoping,
  delete the file and its test suite rather than hollowing it out. A module left
  with one caller and a comment explaining what it used to do is worse than its
  absence.
- **`api.v1.hooks.register` holds ONE callback per hook name.** After Task 1 nothing
  registers `onHistoryNavigated`; do not leave a no-op registration behind.
  **Corrected by Task 1:** this constraint reads as though the hook's only use was
  reconciliation. It had two. The second — telling the opening-scene card the
  document moved — outlives the forward-only decision entirely, and is now answered
  by a poll (`use-document-content.ts`) that is strictly wider than the event it
  replaces, since `onHistoryNavigated` never fired for ordinary editing.
- **Task 1 found every task's file list to be short.** Tests that read a deleted
  file off disk by path throw `ENOENT` rather than failing an assertion, and a
  source-scanning guard is easy to miss when grepping for imports. Before deleting
  anything, `grep -rn "<filename>" tests/` as well as `src/`.
- **CLAUDE.md is binding**, in particular: no `updateParts`; never swap a
  component's _type_ at a fixed position; `onInput` not `onChange`; `disabled` is
  not a re-entry guard; no singletons.
- vitest collects `tests/**/*.test.ts` only — `.tsx` is never collected.
- `npm run format` runs a `preformat` guard against a pinned prettier.
- Verification for every task: `npm test && npx tsc --noEmit && npm run build && npx prettier --check .`
- **CHANGELOG.md is Task 7's.** Do not edit it before then.

## File structure

**Deleted:** `src/core/store/persistence/history-store.ts`,
`src/core/store/persistence/keyspace.ts`, `src/core/store/effects/history-sync.ts`,
`src/core/engine/reconcile.ts`, and their test suites.

**Reduced:** `src/core/engine/lorebook-write.ts` (228 → ~80 lines: read-then-write,
nothing else), `src/core/store/effects/autosave.ts` (one storyStorage record),
`src/core/keys.ts`, `src/ui/mount.ts` (load path), `src/type-overrides.d.ts`.

**Threaded through:** `nodeId` comes out of `DrainDeps`, `LorebookWriteTarget`,
`rebuildThreadCondition`, `applyThreadStatus` and their callers in
`src/core/engine/execute.ts`, `thread-bind.ts` and
`src/core/store/effects/engine-loop.ts`.

**Kept:** `tools/*.naiscript`. The three probes are measurements, not machinery, and
`offpath-write-probe` in particular documents a property of the platform that
outlived the code which needed it.

---

### Task 1: Delete reconciliation and the navigation handler

**Files:** delete `src/core/engine/reconcile.ts`,
`src/core/store/effects/history-sync.ts`, `tests/core/engine/reconcile.test.ts`,
`tests/core/history-sync.test.ts`; modify `src/core/store/register-effects.ts`,
`src/core/store/slices/engine.ts`, `src/core/engine/loop-machine.ts`.

The whole of §7 goes. Nothing reverts, so there is nothing to reconcile.

**`engineTouchedRecounted` loses its only dispatcher** (`history-sync.ts:91`) and
should be deleted from the engine slice with it. `LoopState.touched` becomes what it
always actually was — a session count of entries the Engine rewrote — and
`loop-machine.ts:75`'s comment about recounting from `lb:` records at the navigated
node is now describing something that does not exist. §9.1's "entities revised on
this branch" wording is Task 6's to correct.

**Do not leave an empty `onHistoryNavigated` registration.** This is the only one in
the codebase; after this task the hook is unregistered, which is the point.

Check what else `history-sync.ts` was doing before deleting it wholesale — it also
dispatches `documentHistoryNavigated()` and flushes autosave. Decide for each
whether it had a second reason to exist, and say so in your report.

---

### Task 2: The write door forgets

**Files:** modify `src/core/engine/lorebook-write.ts`, `src/core/keys.ts`,
`tests/core/engine/lorebook-write.test.ts`; update callers in
`src/core/engine/execute.ts` and `thread-bind.ts`.

`writeLorebookEntry` keeps **one** job: read the live entry, hand it to the caller,
write the patch back. §5's read-then-write is the reason the door exists and it
survives intact — a hand-edit made thirty seconds ago is still part of the input.

Everything else goes: the §5.2 `setIfAbsent` snapshot, `lorebookOriginalKey`, the
`lb:` record, `LorebookWriteRecord`, `fingerprintEntryText`,
`readLorebookWriteRecord`, `listLorebookWriteRecords`, and `nodeId` from
`LorebookWriteTarget`.

**The door's guard test must survive.** `tests/core/engine/execute.test.ts` reads
the engine directory and refuses any module except the door that writes an existing
entry. That invariant is not about history and stays exactly as it is.

---

### Task 3: Persistence goes back to storyStorage

**Task 1 handoff.** `AutosaveHandle` and the `{ flush }` return are **already gone**
— Task 1 removed the only consumer (the navigation rehydrate), and leaving a handle
nobody takes across two tasks is the "module with one caller and a comment about
what it used to do" the Global Constraints forbid. `registerAutosaveEffects` returns
`void`; `flush` is the debounce's own callee. Do not expect to find the handle.

**Files:** delete `src/core/store/persistence/history-store.ts`,
`src/core/store/persistence/keyspace.ts`, `tests/core/keyspace.test.ts`,
`tests/core/history-store.test.ts`; modify `src/core/store/effects/autosave.ts`,
`src/ui/mount.ts`, `src/core/keys.ts`.

The World and the story fields become **one `storyStorage` record**. Phase 2 sharded
them because `historyStorage` is copy-on-write per key per node and a single blob
would snapshot the whole World onto every node that took a write. Without
`historyStorage` that reason is gone, and one record is simpler to write, load and
reason about.

Read `docs/superpowers/plans/2026-08-15-branch-scoped-persistence.md` for what this
is reverting — it names the old `kse-persist` blob, and the shape it describes is
roughly where this lands. Do **not** restore the migration code that plan deleted.

`captureNode()` disappears with `history-store.ts`, and with it §6.3's whole
discipline. The debounced flush no longer needs to know which node it belongs to,
because there is only one place for it to go.

`tests/helpers/history-fake.ts` loses its consumers — check before deleting it, and
say in your report whether anything else used it.

---

### Task 4: The Engine's own records

**Task 2 handoff: three of these threads are already pulled.**
`rebuildThreadCondition`, `applyThreadStatus` and `disableDeletedThreadEntry`
have **already lost their `nodeId` parameter**, along with the `captureNode()`
call at each of their three effect callsites — `thread-bind.ts` no longer
imports `history-store` at all. Task 2 was told not to touch them, but
`noUnusedParameters` makes that impossible: a trailing parameter whose only use
was the door's `nodeId` field is a hard `tsc` error the moment the field goes,
and every task's verification runs `tsc --noEmit`. `DrainDeps.nodeId` **is**
still there, unread by anything in `execute.ts`, because an unused property of
an object type is not an error. Expect to find one thread here, not three.

**Files:** modify `src/core/engine/intents.ts`,
`src/core/store/effects/engine-loop.ts`, `src/core/engine/execute.ts`,
`src/core/engine/thread-bind.ts`; tests.

The watermark and the intent queue move to `storyStorage`. `intents.ts`'s header
explains at length why they are two branch-scoped records rather than one — that
argument is about copy-on-write and does not survive; rewrite it for what is true
now. Whether they stay two keys or become one is your call; justify it.

`nodeId` comes out of `DrainDeps`, `rebuildThreadCondition` and `applyThreadStatus`,
and out of every callsite.

**The watermark degrades on its own and needs no help.** `assess` already treats a
watermark naming a section the document no longer holds as no watermark at all, so
undoing past it means the next pass re-reads rather than skipping. That was written
as a lazy correction for a navigation-time recompute that no longer exists, and it
is now the whole mechanism. Confirm it still behaves that way and leave it.

---

### Task 5: The type override and the last threads

**Task 1 handoff: the override goes regardless.** It exists because
`onHistoryNavigated`'s `nodeId` arrives as a `number` while the `.d.ts` declares
`string` — but that only ever mattered because history-sync _read_ `nodeId`. Even a
handler that ignored its params would satisfy the upstream signature, so no
surviving registration could justify keeping the override.

**Files:** modify `src/type-overrides.d.ts`; sweep for leftovers.

The `onHistoryNavigated` correction exists because that hook's `nodeId` arrives as a
`number` despite the `.d.ts` declaring `string`. Nothing registers the hook after
Task 1. Remove the override **only if** nothing else depends on it, and check
`external/script-types.d.ts` before assuming the correction was only ever about this
one hook.

Then sweep: `grep -rn "historyStorage\|captureNode\|loadBranchState\|nodeId" src/`
should come back empty of Story Engine's own plumbing. Anything left is either a
genuine `api.v1` parameter or a leftover — report which.

---

### Task 6: The design document

**Files:** `docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md`.

Large sections describe machinery that no longer exists. They are not deleted —
this document is the record of how the design was reasoned about, and phases 2, 6
and their reviews are part of that record. Mark them **superseded**, with the reason,
the way §4.3 and §14.1's corrections already read.

**Task 1 handoff: two stale comments to sweep**, both predating this plan.
`triage-strategy.ts` says a displaced thread's entry is left "still enabled" — the
`open` arm disables it as of phase 6's review. And `trigger.test.ts`'s
"registered nowhere else" guard was matching a literal string prettier wraps across
three lines, so it matched **nothing at all** and had been passing vacuously since
it was written; Task 1 fixed it, but it is the same failure R6-6 found in the door
guard, and a third instance is worth looking for.

At minimum: **§5.2** (the write-once original), **§6** entire (storage scoping, key
granularity, the index-as-deletion rule, node capture at dispatch), **§7** (history
navigation and lorebook reconciliation), **§9.1**'s `touched` wording, **§12.1**, and
the phase-2/6/7 entries in **§14**.

Add a new section stating the forward-only contract and what it costs, drawing on
this plan's **Why** and **What the writer loses**. The lorebook-history script gets
a sentence saying where that concern went and that it is designed elsewhere — not a
specification of it.

---

### Task 7: The changelog

**Files:** `CHANGELOG.md`.

The 0.15.0 section is **rewritten**, not appended to. Coming out: the headline
"Undo and redo now move the World with the story" bullet entire, the clause about
undo reaching into the lorebook for a Thread's entry, and the "we keep your
originals" promise in the "It edits your lorebook" bullet.

Going in, in the plainest language the section can manage: **Story Engine's records
move forward only.** Undo changes your prose; it does not change what Story Engine
has recorded, and an entity or Thread created on a branch you backed out of is still
there — delete it if you do not want it. The Engine still edits your lorebook and
still keeps no copy of what it replaced, so export your lorebook if it matters to
you.

Do **not** bump `project.yaml`.

---

## Verification

```bash
npm ci && npm test && npx tsc --noEmit && npm run build && npx prettier --check .
```

Then in a **scratch story**:

1. Create an entity, write past it, undo several times. The entity **stays** — that
   is the new contract, not a bug.
2. Reload the story. The World is intact and identical.
3. Switch on the Engine, let a pass run, undo. The Engine's edits stay; nothing is
   reconciled and nothing is removed.
4. Nothing in the script log mentions navigation, nodes, or reconciliation.

## Out of scope

- **The lorebook-history script.** Separate project, separate design.
- **Restoring anything phase 2 replaced.** Its migration code stays deleted.
- **Any new feature.** This plan only removes.
