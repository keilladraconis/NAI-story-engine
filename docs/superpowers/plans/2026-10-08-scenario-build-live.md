# Scenario Build Writes For Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Scenario Build turn creates live entities with lorebook entries at once, each Build reply can be undone, and the chat shows one collapsed pill per command that opens into the World's own card.

**Architecture:** The Scenario draft pool, Cast/Discard, tombstones and the reference scrub are deleted. `executeForgeCommand` becomes async, binds a lorebook entry on CREATE, and stores each command's reverse on its `ForgeActionRecord`. An undo effect plays a reply's records back in reverse. Pills gain a target id and open into `EntityCard` / `ThreadItem`.

**Tech Stack:** TypeScript (strict), nai-store, Preact JSX in a QuickJS worker, vitest. Spec: `docs/superpowers/specs/2026-10-08-scenario-build-live-design.md`.

## Global Constraints

- Verify with `npx tsc --noEmit` and `npm run test` only. `npm run build` needs network and cannot run in the sandbox; never disable the sandbox.
- Format with `npx prettier -w <the files you touched>`. If prettier rewrites files you did not touch, do not commit that diff.
- Never stage or change `project.yaml`, `external/script-types.d.ts`, anything under `.claude/`, `.idea`, `.vscode`, the untracked dotfiles in the repo root, or `docs/superpowers/plans/2026-10-05-threads-as-standing-state.md`. Stage by explicit path, never `git add -A` or `git add .`.
- No version bump. Version stays 0.15.0.
- The allow-lists in `tests/core/engine/latent-privacy.test.ts` (`latent`, `wish`) are never extended. A failure there is a leak to fix in your code.
- Prompts live only in `src/core/utils/prompts.ts`. No `any`. No `updateParts`. Text inputs bind `onInput`.
- Never swap a component's type at a fixed JSX position. Mount every variant and toggle `display`.
- Do not use `enable_thinking`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- "Be bold": no data migration, no legacy shims.
- Use Bash only where no dedicated tool fits (running tests, git).

## File Structure

| File                                               | Responsibility after this plan                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/store/effects/entity-entry.ts` (new)     | Bind, rename and restore an entity's lorebook entry.                                                                             |
| `src/core/store/effects/handlers/forge-chat.ts`    | Execute Build commands (async), record reverses, `undoForgeAction`, `undoTurn`.                                                  |
| `src/core/chat-types/undo.ts` (new)                | Pure questions about a transcript: which reply is undoable, whether a prune is blocked.                                          |
| `src/core/chat-types/types.ts`                     | `ForgeUndo`, record ids, `ChatMessage.undone`.                                                                                   |
| `src/core/chat-types/pills.ts`                     | Pill labels, targets, undone/skipped leads.                                                                                      |
| `src/core/utils/forge-chat-strategy.ts`            | `[WORLD]` block; undone replies left out.                                                                                        |
| `src/core/store/effects/forge-chat-effects.ts`     | Build, Plan and Undo effects; manual-draft discard.                                                                              |
| `src/ui/panels/chat/BuildPills.tsx`, `Message.tsx` | One list; pill opens into card; Undo control.                                                                                    |
| Deleted                                            | `src/core/store/slices/forge.ts`, `src/core/store/selectors/forge.ts`, `src/ui/panels/chat/ForgeCommitBar.tsx`, and their tests. |

---

### Task 1: Remove the reference scrub and tombstones

Pure removal. Nothing new is added; the tree must typecheck and pass with these concepts gone.

**Files:**

- Delete: `src/core/store/slices/forge.ts`, `tests/core/store/slices/forge.test.ts`
- Modify: `src/core/store/index.ts`, `src/core/store/types.ts`, `src/core/store/effects/forge-chat-effects.ts`, `src/core/store/effects/handlers/forge-chat.ts`, `src/core/store/effects/generation-handlers.ts`, `src/core/store/effects/generation-engine.ts`, `src/core/utils/forge-chat-strategy.ts`, `src/core/utils/prompts.ts`, `src/core/chat-types/types.ts`, `src/core/chat-types/scenario.ts`, `src/ui/panels/chat/ChatHeader.tsx`, `src/ui/panels/chat/SendButton.tsx`
- Test: every test file that `grep -rlE "tombstone|scrub|forgeCleanup|FORGE_CLEANUP|cleanup" tests` lists

**Interfaces:**

- Produces: `executeForgeCommand(cmd, chatId, assistantMessageId, getState, dispatch)` (the `opts` parameter is gone). `RootState` has no `forge` key. `ChatMessage.messageKind` is `"refineSource" | undefined`. `HeaderControl.kind` has no `"scrubIndicator"`. Generation target union has no `"forgeCleanup"`.

- [ ] **Step 1: Delete the slice and its wiring**

Delete `src/core/store/slices/forge.ts` and `tests/core/store/slices/forge.test.ts`. In `src/core/store/index.ts` remove the `forgeSlice` import, the `forge: forgeSlice.reducer` entry and `export * from "./slices/forge"`. In `src/core/store/types.ts` remove `forge: import("./slices/forge").ForgeSliceState;` from `RootState`, `"forgeCleanup"` from the request-type union (line ~73) and the `{ type: "forgeCleanup"; … }` member of the target union (line ~101).

- [ ] **Step 2: Remove the cleanup generation**

- `src/core/utils/prompts.ts`: delete `FORGE_CLEANUP_PROMPT` and its doc comment.
- `src/core/utils/forge-chat-strategy.ts`: delete `buildForgeCleanupStrategy`, `formatTombstones`, the `FORGE_CLEANUP_PROMPT` import, and `formatTombstones(state, chat.id)` from the `contextBlock([...])` call. In `conversation()` delete the `m.messageKind !== "cleanup" &&` line and the sentences about scrubs in its doc comment. Rewrite the file header: remove "plus the post-discard reference scrubber" and `[TOMBSTONES]`.
- `src/core/store/effects/handlers/forge-chat.ts`: delete `forgeCleanupHandler`, `ForgeCleanupTarget`, `isTombstoned`, `REASON.discarded`, both `isTombstoned(...)` checks, the `tombstoneAdded` dispatch in DELETE, the `tombstoneAdded` import, the `DULFS_CATEGORY_LABELS` import if now unused, the whole `if (opts.reviseOnly && …)` block, the `opts` parameter, and the `reviseOnly` parameter of `buildForgeSegments` and its callsite argument.
- `src/core/store/effects/generation-handlers.ts`: remove `forgeCleanupHandler` from the import, the `ForgeCleanupTarget` alias, and both `forgeCleanup` entries.
- `src/core/store/effects/generation-engine.ts`: remove both `case "forgeCleanup":` arms (lines ~69 and ~180).

- [ ] **Step 3: Remove the scrub from effects and UI**

- `src/core/store/effects/forge-chat-effects.ts`: delete `forgeScrubNowRequested` and its payload type, `runPendingScrub`, the "Scrub Now" effect, the `runPendingScrub(latest, dispatch, chatId);` call in the Build effect and its comment, the `scrubQueued` dispatch block in the discard effect (from `// Defer the reference scrub` to the closing `}` of the `if (otherDraftsRemain)`), both `tombstoneAdded` dispatches, the `tombstonesClearedForChat` and `scrubCleared` dispatches, the `../slices/forge` import, and `r.type === "forgeCleanup" ||` in `scenarioRequestPending`. Remove `DULFS_CATEGORY_LABELS` and `buildForgeCleanupStrategy` imports if unused. Update the header comment to match.
- `src/core/chat-types/scenario.ts`: remove `{ id: "scrub", kind: "scrubIndicator" }` and `r.type === "forgeCleanup" ||`.
- `src/core/chat-types/types.ts`: remove `"scrubIndicator"` from `HeaderControl.kind`; change `messageKind?: "cleanup" | "refineSource"` to `messageKind?: "refineSource"` and trim its comment to the `refineSource` paragraph.
- `src/ui/panels/chat/ChatHeader.tsx`: delete the `scrubbing` selector and the `case "scrubIndicator":` arm.
- `src/ui/panels/chat/SendButton.tsx`: remove `t === "forgeCleanup"` (keep the expression valid).

- [ ] **Step 4: Update tests**

Run `grep -rnE "tombstone|scrub|forgeCleanup|FORGE_CLEANUP|reviseOnly|messageKind: \"cleanup\"" tests`. For each hit: delete tests whose subject no longer exists (scrub queueing, cleanup strategy, tombstone rejection, `[TOMBSTONES]` block, `scrubIndicator` header kind); in the others remove the `forge: {...}` key from state fixtures and drop the sixth argument from `executeForgeCommand(...)` calls. Do not weaken any assertion about something that still exists.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run test 2>&1 | tail -5`
Expected: tsc exits 0; all test files pass.
Run: `grep -rnE "tombstone|scrub|forgeCleanup|FORGE_CLEANUP" src`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
npx prettier -w $(git diff --name-only --diff-filter=AM -- src tests)
git add -u src tests
git status --short   # confirm project.yaml and external/script-types.d.ts are NOT staged ("M " in column 1 means staged)
git commit -m "refactor(scenario): remove the reference scrub and tombstones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If `git add -u src tests` staged nothing outside `src` and `tests`, it is safe; `project.yaml` and `external/` are outside those paths.

---

### Task 2: Build commands write live, and record their reverse

**Files:**

- Create: `src/core/store/effects/entity-entry.ts`, `tests/core/store/effects/entity-entry.test.ts`
- Modify: `src/core/chat-types/types.ts`, `src/core/store/effects/handlers/forge-chat.ts`, `src/core/utils/crucible-command-parser.ts` (only if a type import needs it)
- Test: `tests/core/store/effects/handlers/forge-chat.test.ts`, `tests/core/store/effects/handlers/forge-pipeline.test.ts`

**Interfaces:**

- Consumes: `executeForgeCommand(cmd, chatId, assistantMessageId, getState, dispatch)` from Task 1; `ensureCategory(fieldId): Promise<string>` from `effects/lorebook-sync`; `nameKey(displayName): string` from `effects/handlers/lorebook`.
- Produces:
  - `bindEntryFor(entity: { name: string; categoryId: DulfsFieldID }): Promise<{ entryId: string; created: boolean }>`
  - `renameEntry(entryId: string, from: string, to: string): Promise<void>`
  - `ForgeUndo` (below), and on `ForgeActionRecord`: `entityId?: string`, `threadId?: string`, `undo?: ForgeUndo`, `undoResult?: "undone" | "skipped" | "failed"`
  - `executeForgeCommand(...)` now returns `Promise<ForgeActionRecord>`

- [ ] **Step 1: Add the types**

In `src/core/chat-types/types.ts`, add `WorldEntity` to the type import from `"../store/types"`, and add above `ForgeActionRecord`:

```ts
/** How to reverse one applied Build command. Read and written only by
 *  `handlers/forge-chat.ts`. A Thread's three texts are positional
 *  (shown, private, wished) so this type names neither private field. */
export type ForgeUndo =
  | { op: "entityCreated"; entityId: string; entryCreated: boolean }
  | { op: "summary"; entityId: string; before: string; wrote: string }
  | { op: "name"; entityId: string; before: string; wrote: string }
  | {
      op: "entityDeleted";
      entity: WorldEntity;
      entry: LorebookEntry | null;
      threadIds: string[];
    }
  | { op: "threadCreated"; threadId: string }
  | {
      op: "threadRewritten";
      threadId: string;
      before: [string, string, string];
      wrote: [string, string, string];
    };
```

Add to `ForgeActionRecord`:

```ts
  /** The live entity this command made or changed, for the pill's card. */
  entityId?: string;
  /** The Thread this command made or rewrote, for the pill's row. */
  threadId?: string;
  /** How to reverse it. Present only on applied commands. */
  undo?: ForgeUndo;
  /** Set when the turn was undone: what happened to this command. */
  undoResult?: "undone" | "skipped" | "failed";
```

- [ ] **Step 2: Write the failing tests for `entity-entry.ts`**

Create `tests/core/store/effects/entity-entry.test.ts`. Look at how `tests/setup.ts` mocks `api.v1.lorebook` (around line 90) and at an existing test that stubs `entries`/`createEntry` (for example in `tests/core/store/effects/forge-chat-effects.test.ts`) and follow that stubbing style.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bindEntryFor,
  renameEntry,
} from "../../../../src/core/store/effects/entity-entry";
import { FieldID } from "../../../../src/config/field-definitions";
import { nameKey } from "../../../../src/core/store/effects/handlers/lorebook";

describe("bindEntryFor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("creates an empty, enabled entry keyed on the name", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([]);
    const create = vi
      .spyOn(api.v1.lorebook, "createEntry")
      .mockResolvedValue("e-new");
    const bound = await bindEntryFor({
      name: "Hesper Vane",
      categoryId: FieldID.DramatisPersonae,
    });
    expect(bound).toEqual({ entryId: "e-new", created: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Hesper Vane",
        text: "",
        keys: [nameKey("Hesper Vane")],
        enabled: true,
      }),
    );
  });

  it("binds an unmanaged entry of the same name instead of making a second", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([
      { id: "e-old", displayName: "hesper vane" },
    ]);
    const create = vi.spyOn(api.v1.lorebook, "createEntry");
    const update = vi
      .spyOn(api.v1.lorebook, "updateEntry")
      .mockResolvedValue(undefined);
    const bound = await bindEntryFor({
      name: "Hesper Vane",
      categoryId: FieldID.DramatisPersonae,
    });
    expect(bound).toEqual({ entryId: "e-old", created: false });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("e-old", expect.any(Object));
  });
});

describe("renameEntry", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renames the entry and swaps a name-stub key", async () => {
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue({
      id: "e1",
      displayName: "Kei",
      keys: [nameKey("Kei")],
    });
    const update = vi
      .spyOn(api.v1.lorebook, "updateEntry")
      .mockResolvedValue(undefined);
    await renameEntry("e1", "Kei", "Kay");
    expect(update).toHaveBeenCalledWith("e1", {
      displayName: "Kay",
      keys: [nameKey("Kay")],
    });
  });

  it("leaves keys the writer or a generation set", async () => {
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue({
      id: "e1",
      displayName: "Kei",
      keys: ["kei", "the red fox"],
    });
    const update = vi
      .spyOn(api.v1.lorebook, "updateEntry")
      .mockResolvedValue(undefined);
    await renameEntry("e1", "Kei", "Kay");
    expect(update).toHaveBeenCalledWith("e1", { displayName: "Kay" });
  });
});
```

Run: `npx vitest run tests/core/store/effects/entity-entry.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `entity-entry.ts`**

```ts
// The lorebook entry an entity is bound to: making one, renaming it. Shared by
// the Scenario Build handler and its undo, so both follow the same rules.

import type { DulfsFieldID } from "../../../config/field-definitions";
import { ensureCategory } from "./lorebook-sync";
import { nameKey } from "./handlers/lorebook";

/** Bind a lorebook entry for a new entity. An unmanaged entry (no category)
 *  with the same display name is adopted; otherwise an empty one is created,
 *  keyed on the name so it activates as soon as the name is written. */
export async function bindEntryFor(entity: {
  name: string;
  categoryId: DulfsFieldID;
}): Promise<{ entryId: string; created: boolean }> {
  const category = await ensureCategory(entity.categoryId);
  const all = await api.v1.lorebook.entries();
  const existing = all.find(
    (e) =>
      (e.displayName ?? "").toLowerCase() === entity.name.toLowerCase() &&
      !e.category,
  );
  if (existing) {
    await api.v1.lorebook.updateEntry(existing.id, { category });
    return { entryId: existing.id, created: false };
  }
  const entryId = await api.v1.lorebook.createEntry({
    id: api.v1.uuid(),
    displayName: entity.name,
    text: "",
    keys: [nameKey(entity.name)],
    enabled: true,
    category,
  });
  return { entryId, created: true };
}

/** Rename an entity's entry. The key is swapped only while it is still the
 *  stub made from the old name; keys anyone has set since are left alone. */
export async function renameEntry(
  entryId: string,
  from: string,
  to: string,
): Promise<void> {
  const entry = await api.v1.lorebook.entry(entryId);
  if (!entry) return;
  const stub = entry.keys?.length === 1 && entry.keys[0] === nameKey(from);
  await api.v1.lorebook.updateEntry(entryId, {
    displayName: to,
    ...(stub ? { keys: [nameKey(to)] } : {}),
  });
}
```

Run: `npx vitest run tests/core/store/effects/entity-entry.test.ts`
Expected: PASS. If an import cycle makes `ensureCategory` undefined at runtime, move nothing: report it as BLOCKED with the cycle path.

- [ ] **Step 4: Write the failing handler tests**

In `tests/core/store/effects/handlers/forge-chat.test.ts`, every existing `executeForgeCommand(...)` call must now be awaited (make each test `async`). Replace the tests that assert draft creation, "live cannot be changed", and "DELETE of a draft" with the following (reuse the file's existing state/dispatch helpers; `entity(...)` below stands for however the file builds a `WorldEntity`, and a "live built here" entity is one with `lifecycle: "live"`, `lorebookEntryId`, and `sourceChatId: "c1"`):

```ts
describe("a Build command writes for real", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([]);
    vi.spyOn(api.v1.lorebook, "createEntry").mockResolvedValue("e-new");
    vi.spyOn(api.v1.lorebook, "updateEntry").mockResolvedValue(undefined);
    vi.spyOn(api.v1.lorebook, "removeEntry").mockResolvedValue(undefined);
  });

  it("CREATE makes a live entity bound to an entry, and records how to undo it", async () => {
    const { getState, dispatch } = harness(); // the file's own store helper
    const rec = await executeForgeCommand(
      {
        kind: "CREATE",
        elementType: "CHARACTER",
        name: "Mikki",
        content: "A fox.",
      },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const made = Object.values(getState().world.entitiesById)[0];
    expect(made).toMatchObject({
      name: "Mikki",
      summary: "A fox.",
      lifecycle: "live",
      lorebookEntryId: "e-new",
      sourceChatId: "c1",
    });
    expect(rec).toMatchObject({
      kind: "CREATE",
      status: "applied",
      entityId: made.id,
      undo: { op: "entityCreated", entityId: made.id, entryCreated: true },
    });
  });

  it("CREATE is rejected, and makes nothing, when the lorebook refuses", async () => {
    vi.spyOn(api.v1.lorebook, "createEntry").mockRejectedValue(
      new Error("full"),
    );
    const { getState, dispatch } = harness();
    const rec = await executeForgeCommand(
      {
        kind: "CREATE",
        elementType: "CHARACTER",
        name: "Mikki",
        content: "A fox.",
      },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(rec.status).toBe("rejected");
    expect(rec.reason).toContain("full");
    expect(Object.keys(getState().world.entitiesById)).toHaveLength(0);
  });

  it("REVISE rewrites any entity's summary and records what it replaced", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "Old.")],
    });
    const rec = await executeForgeCommand(
      { kind: "REVISE", name: "Kei", content: "New." },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const kei = Object.values(getState().world.entitiesById)[0];
    expect(kei.summary).toBe("New.");
    expect(rec.undo).toEqual({
      op: "summary",
      entityId: kei.id,
      before: "Old.",
      wrote: "New.",
    });
  });

  it("RENAME renames the entity and its entry", async () => {
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue({
      id: "e1",
      displayName: "Kei",
      keys: ["kei"],
    });
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "S.", "e1")],
    });
    const rec = await executeForgeCommand(
      { kind: "RENAME", oldName: "Kei", newName: "Kay" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const kay = Object.values(getState().world.entitiesById)[0];
    expect(kay.name).toBe("Kay");
    expect(api.v1.lorebook.updateEntry).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ displayName: "Kay" }),
    );
    expect(rec.undo).toEqual({
      op: "name",
      entityId: kay.id,
      before: "Kei",
      wrote: "Kay",
    });
  });

  it("RENAME to the same name, or to a name in use, is rejected", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "S."), imported("Mikki", "S.")],
    });
    const same = await executeForgeCommand(
      { kind: "RENAME", oldName: "Kei", newName: "Kei" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const taken = await executeForgeCommand(
      { kind: "RENAME", oldName: "Kei", newName: "mikki" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(same.status).toBe("rejected");
    expect(taken.status).toBe("rejected");
  });

  it("DELETE removes an entity a Scenario chat built, with its entry", async () => {
    const entry = {
      id: "e1",
      displayName: "Kei",
      text: "Lore.",
      keys: ["kei"],
    };
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue(entry);
    const built = { ...imported("Kei", "S.", "e1"), sourceChatId: "c0" };
    const { getState, dispatch } = harness({ entities: [built] });
    const rec = await executeForgeCommand(
      { kind: "DELETE", name: "Kei" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(getState().world.entitiesById[built.id]).toBeUndefined();
    expect(api.v1.lorebook.removeEntry).toHaveBeenCalledWith("e1");
    expect(rec.undo).toMatchObject({
      op: "entityDeleted",
      entity: built,
      entry,
      threadIds: [],
    });
  });

  it("DELETE of an entity no Scenario chat built is rejected with the repair", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "S.", "e1")],
    });
    const rec = await executeForgeCommand(
      { kind: "DELETE", name: "Kei" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(rec).toMatchObject({
      status: "rejected",
      reason: "was not built here and cannot be deleted from the chat",
    });
    expect(api.v1.lorebook.removeEntry).not.toHaveBeenCalled();
  });

  it("a THREAD rewrite records the three texts before and after, positionally", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("A", "s"), imported("B", "s")],
      threads: [
        {
          id: "t1",
          title: "Half",
          state: "S0",
          latent: "P0",
          wish: "W0",
          entityIds: [],
          status: "open",
        },
      ],
    });
    const rec = await executeForgeCommand(
      {
        kind: "THREAD",
        title: "half",
        memberNames: ["A"],
        state: "S1",
        latent: "",
        wish: "W1",
      },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(rec).toMatchObject({
      status: "applied",
      threadId: "t1",
      undo: {
        op: "threadRewritten",
        threadId: "t1",
        before: ["S0", "P0", "W0"],
        wrote: ["S1", "P0", "W1"],
      },
    });
  });

  it("a new THREAD records its id", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("A", "s"), imported("B", "s")],
    });
    const rec = await executeForgeCommand(
      {
        kind: "THREAD",
        title: "Half",
        memberNames: ["A", "B"],
        state: "S",
        latent: "",
        wish: "",
      },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const t = getState().world.threads[0];
    expect(rec).toMatchObject({
      threadId: t.id,
      undo: { op: "threadCreated", threadId: t.id },
    });
  });
});
```

`harness` and `imported` are whatever the file already uses to build a store and a live entity with no `sourceChatId`; if the file has no such helpers, add them at the top of the `describe`, building a real store with `createStore`-style setup the neighbouring tests use. Do not mock the reducers.

Run: `npx vitest run tests/core/store/effects/handlers/forge-chat.test.ts`
Expected: FAIL (not async, no `undo`, draft lifecycle).

- [ ] **Step 5: Rewrite `executeForgeCommand`**

In `src/core/store/effects/handlers/forge-chat.ts`:

Imports: add `import { bindEntryFor, renameEntry } from "../entity-entry";`.

Replace `REASON` with:

```ts
const REASON = {
  exists: "already exists; REVISE it instead",
  noSummary: "needs a summary after the bar",
  unknownType:
    "unknown type; use CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION or TOPIC",
  notFound: "not found; name an element under [WORLD], spelled exactly",
  noNewName: "needs a new name after the arrow",
  sameName: "is already its name; write no RENAME for it",
  taken: "is the name of another element; choose a different name",
  notBuiltHere: "was not built here and cannot be deleted from the chat",
  concluded: "is concluded and cannot be rewritten",
} as const;
```

Add a helper used by CREATE and by REVISE's find-or-create:

```ts
/** Make a live entity with its lorebook entry. A lorebook failure rejects the
 *  command and makes nothing. */
async function createLive(
  kind: "CREATE",
  elementType: string,
  fieldId: DulfsFieldID,
  name: string,
  summary: string,
  chatId: string,
  dispatch: AppDispatch,
): Promise<ForgeActionRecord> {
  let bound: { entryId: string; created: boolean };
  try {
    bound = await bindEntryFor({ name, categoryId: fieldId });
  } catch (error) {
    return {
      kind,
      status: "rejected",
      elementType,
      name,
      reason: `the lorebook refused: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const entity: WorldEntity = {
    id: api.v1.uuid(),
    categoryId: fieldId,
    name,
    summary,
    lifecycle: "live",
    lorebookEntryId: bound.entryId,
    sourceChatId: chatId,
  };
  dispatch(entityForged({ entity }));
  return {
    kind,
    status: "applied",
    elementType,
    name,
    entityId: entity.id,
    undo: {
      op: "entityCreated",
      entityId: entity.id,
      entryCreated: bound.created,
    },
  };
}
```

Change the signature to `export async function executeForgeCommand(cmd, chatId, _assistantMessageId, getState, dispatch): Promise<ForgeActionRecord>` (keep the parameter so callers do not change; prefix it with `_` since `lastAffectingMessageId` goes away in Task 3). Then the arms:

- **CREATE:** keep the three rejections (`noSummary`, `unknownType`, `exists`); replace the entity construction and dispatch with `return createLive("CREATE", elementType, fieldId, cmd.name, cmd.content, chatId, dispatch);`.
- **REVISE:** keep the `noSummary` rejection. If `target` exists: delete the `lifecycle === "live"` rejection; dispatch `entitySummaryUpdated({ entityId: target.id, summary: cmd.content })`; return `{ kind: "REVISE", status: "applied", name: cmd.name, entityId: target.id, undo: { op: "summary", entityId: target.id, before: target.summary, wrote: cmd.content } }`. If not: `return createLive("CREATE", "CHARACTER", FieldID.DramatisPersonae, cmd.name, cmd.content, chatId, dispatch);`.
- **RENAME:** after `notFound` and `noNewName` (move the `noNewName` check above the others that follow), delete the `live` rejection and add:

```ts
const newName = cmd.newName.trim();
if (newName === target.name) {
  return {
    kind: "RENAME",
    status: "rejected",
    name: target.name,
    reason: REASON.sameName,
  };
}
const clash = findEntityByName(getState(), newName);
if (clash && clash.id !== target.id) {
  return {
    kind: "RENAME",
    status: "rejected",
    name: target.name,
    reason: REASON.taken,
  };
}
if (target.lorebookEntryId) {
  await renameEntry(target.lorebookEntryId, target.name, newName);
}
dispatch(
  entityEdited({ entityId: target.id, name: newName, summary: target.summary }),
);
return {
  kind: "RENAME",
  status: "applied",
  name: cmd.oldName,
  newName,
  entityId: target.id,
  undo: {
    op: "name",
    entityId: target.id,
    before: target.name,
    wrote: newName,
  },
};
```

- **DELETE:** after `notFound`, replace the `live` rejection and the rest with:

```ts
if (!target.sourceChatId) {
  return {
    kind: "DELETE",
    status: "rejected",
    name: cmd.name,
    reason: REASON.notBuiltHere,
  };
}
const entry = target.lorebookEntryId
  ? await api.v1.lorebook.entry(target.lorebookEntryId)
  : null;
const threadIds = getState()
  .world.threads.filter((t) => t.entityIds.includes(target.id))
  .map((t) => t.id);
if (entry) await api.v1.lorebook.removeEntry(entry.id);
dispatch(entityDeleted({ entityId: target.id }));
return {
  kind: "DELETE",
  status: "applied",
  name: target.name,
  undo: { op: "entityDeleted", entity: target, entry, threadIds },
};
```

- **THREAD, existing:** compute the triple before dispatching:

```ts
const before: [string, string, string] = [
  existing.state,
  existing.latent,
  existing.wish,
];
const wrote: [string, string, string] = [
  cmd.state || existing.state,
  cmd.latent || existing.latent,
  cmd.wish || existing.wish,
];
```

dispatch `threadLedgerUpdated({ threadId: existing.id, state: wrote[0], latent: wrote[1] })` and, when `cmd.wish`, `threadWishSet` as now; return `{ kind: "THREAD", status: "applied", name: existing.title, threadId: existing.id, undo: { op: "threadRewritten", threadId: existing.id, before, wrote } }`.

- **THREAD, new:** return `{ kind: "THREAD", status: "applied", name: cmd.title, threadId: thread.id, undo: { op: "threadCreated", threadId: thread.id } }`. Change the unknown-member reason's tail to `name only elements under [WORLD], spelled exactly`.

Make `buildForgeSegments` `async`, `await executeForgeCommand(...)` inside its loop (the loop is a plain `for…of`, so commands run in order), and `await buildForgeSegments(...)` in `forgeChatHandler.completion`.

Wrap the RENAME and DELETE lorebook calls: if either throws, return a rejected record with `reason: \`the lorebook refused: …\``(same message form as`createLive`) and dispatch nothing.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/core/store/effects/handlers`
Expected: PASS. Fix `forge-pipeline.test.ts` the same way (await; live instead of draft). Do not change assertions about parsing.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npm run test 2>&1 | tail -5`
Expected: tsc 0. Tests in other files that asserted draft behaviour through the chat may fail; fix only those that fail because of this task's change, by asserting the new behaviour.

```bash
npx prettier -w src/core/store/effects/entity-entry.ts src/core/store/effects/handlers/forge-chat.ts src/core/chat-types/types.ts tests/core/store/effects
git add src/core/store/effects/entity-entry.ts src/core/store/effects/handlers/forge-chat.ts src/core/chat-types/types.ts tests/core/store/effects
git commit -m "feat(scenario): Build commands write live entities and record their reverse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Remove the draft pool; one `[WORLD]` block

**Files:**

- Delete: `src/core/store/selectors/forge.ts`, `tests/core/store/selectors/forge.test.ts`, `src/ui/panels/chat/ForgeCommitBar.tsx`
- Modify: `src/core/store/effects/forge-chat-effects.ts`, `src/core/store/slices/world.ts`, `src/core/store/index.ts`, `src/core/store/types.ts`, `src/ui/panels/world/world-select.ts`, `src/ui/panels/chat/Chat.tsx`, `src/core/utils/forge-chat-strategy.ts`, `src/core/utils/prompts.ts`, `tools/scenario-probe.naiscript`
- Test: `tests/core/utils/forge-chat-strategy.test.ts`, `tests/core/utils/prompts.test.ts`, `tests/tools/scenario-probe.test.ts`, `tests/ui/world-select.test.ts`, `tests/core/store/effects/forge-chat-effects.test.ts`, `tests/core/store/slices/world.test.ts`, `tests/core/persist-loaded.test.ts`

**Interfaces:**

- Consumes: live creation from Task 2.
- Produces: `formatWorld(state: RootState): string` (exported, in `forge-chat-strategy.ts`). `WorldEntity` has no `lastAffectingMessageId`. `entityDiscardRequested` deletes a manual draft only.

- [ ] **Step 1: Write the failing `[WORLD]` tests**

In `tests/core/utils/forge-chat-strategy.test.ts`, replace the `[POOL]` / `[LIVE]` tests with:

```ts
describe("the [WORLD] block", () => {
  it("lists every entity by category, marking those Build may delete", () => {
    const state = makeState({
      world: {
        threads: [],
        entityIds: ["a", "b"],
        entitiesById: {
          a: {
            id: "a",
            categoryId: FieldID.DramatisPersonae,
            name: "Mikki",
            summary: "A fox.",
            lifecycle: "live",
            sourceChatId: "c9",
          },
          b: {
            id: "b",
            categoryId: FieldID.DramatisPersonae,
            name: "Kei",
            summary: "",
            lifecycle: "live",
          },
        },
      },
    } as never);
    expect(formatWorld(state)).toBe(
      [
        "[WORLD] (* = built here; only these may be deleted)",
        "- * Mikki (Character) — A fox.",
        "- Kei (Character)",
      ].join("\n"),
    );
  });

  it("is empty when the World is", () => {
    expect(formatWorld(makeState({} as never))).toBe("");
  });
});
```

Use the label the file's existing entity-line tests expect for `FieldID.DramatisPersonae` (read `DULFS_CATEGORY_LABELS`); if it is not "Character", use the real label. Also update the test that lists the context block's parts to expect `[WORLD]`, `[THREADS]`, `[REJECTED LAST TURN]`.

Run: `npx vitest run tests/core/utils/forge-chat-strategy.test.ts`
Expected: FAIL, `formatWorld` not exported.

- [ ] **Step 2: Implement `[WORLD]`**

In `src/core/utils/forge-chat-strategy.ts` delete `formatPool` and `formatLive` and add:

```ts
function formatEntityLine(e: WorldEntity): string {
  const label = DULFS_CATEGORY_LABELS[e.categoryId] ?? "Entity";
  const mark = e.sourceChatId ? "* " : "";
  return `- ${mark}${e.name} (${label})${e.summary ? ` — ${e.summary}` : ""}`;
}

/** Everything in the World. Build may revise or rename any of it, and delete
 *  only what a Scenario chat built, which the star marks. */
export function formatWorld(state: RootState): string {
  const all = state.world.entityIds
    .map((id) => state.world.entitiesById[id])
    .filter((e): e is WorldEntity => !!e);
  if (all.length === 0) return "";
  return [
    "[WORLD] (* = built here; only these may be deleted)",
    ...all.map(formatEntityLine),
  ].join("\n");
}
```

In both strategies' `contextBlock([...])` calls use `formatWorld(state)` in place of the pool and live entries (find the Plan strategy's call too). Update the file header comment's block list to `[WORLD], [THREADS], [REJECTED LAST TURN]`.

- [ ] **Step 3: Reword the prompts**

In `src/core/utils/prompts.ts`, change exactly these passages and nothing else:

`SCENARIO_PLAN_PROMPT`:

- `The context block lists what has been built so far under [POOL], [LIVE] and [THREADS]; a list that is missing is empty.` → `The context block lists what exists so far under [WORLD] and [THREADS]; a list that is missing is empty.`

`SCENARIO_BUILD_PROMPT`:

- `The context block above the conversation lists the drafts under [POOL], the cast under [LIVE], and [THREADS]. A list that is missing is empty.` → `The context block above the conversation lists everything that exists under [WORLD], and how things stand under [THREADS]. A list that is missing is empty.`
- `2. Which of those is already under [POOL], [LIVE] or [THREADS]?` → `2. Which of those is already under [WORLD] or [THREADS]?`
- `before writing another.` sentence: `count the ones under [POOL] and [LIVE] before writing another.` → `count the ones under [WORLD] before writing another.`
- `Only drafts under [POOL] may be revised, renamed or deleted. Never recreate a name under [TOMBSTONES].` → `Anything under [WORLD] may be revised or renamed. Only a line marked * may be deleted. What you write is real at once.`
- In the EXAMPLE: `None of it is under [POOL].` → `None of it is under [WORLD].`

Update `tests/core/utils/prompts.test.ts`: any pin of the old sentences becomes a pin of the new ones, and add:

```ts
it("names no pool, cast list or tombstones", () => {
  for (const p of [SCENARIO_BUILD_PROMPT, SCENARIO_PLAN_PROMPT]) {
    expect(p).not.toMatch(/\[POOL\]|\[LIVE\]|\[TOMBSTONES\]|draft/i);
  }
});
```

If "draft" survives anywhere in either prompt, reword that sentence to drop it and say so in your report.

- [ ] **Step 4: Bring the probe into step**

`tools/scenario-probe.naiscript` carries a JSON-stringified copy of the Build prompt on its line 13. Regenerate it, do not retype it:

```bash
npx tsx -e 'import("./src/core/utils/prompts.ts").then(m=>{const fs=require("fs");const p="tools/scenario-probe.naiscript";const L=fs.readFileSync(p,"utf8").split("\n");const i=L.findIndex(l=>l.startsWith("const SCENARIO_BUILD_PROMPT = "));L[i]="const SCENARIO_BUILD_PROMPT = "+JSON.stringify(m.SCENARIO_BUILD_PROMPT)+";";fs.writeFileSync(p,L.join("\n"));})'
```

If `tsx` is not installed, write the same thing as a throwaway vitest test under `$TMPDIR` that imports the constant and rewrites the line, run it once, and delete it.

Then make the probe open the reply as the product does. After the `SCENARIO_BUILD_INSTRUCTION` constant add:

```js
const SCENARIO_BUILD_PREFILL = "Settled:";
```

In `const messages = (talk) => [ … ]` add as the last element `{ role: "assistant", content: SCENARIO_BUILD_PREFILL },`. Where `runFixture` takes the text out of `response` (just after the `api.v1.generate(...)` call), prepend the prefill: the text read by the checks must be `` `${SCENARIO_BUILD_PREFILL}${text}` `` where `text` is what it reads today. Fix the comment on line ~94 to say `[WORLD]/[THREADS]`.

In `tests/tools/scenario-probe.test.ts` add `SCENARIO_BUILD_PREFILL` to the import and add `["SCENARIO_BUILD_PREFILL", SCENARIO_BUILD_PREFILL]` to the `it.each` table.

Run: `npx vitest run tests/tools tests/core/utils`
Expected: PASS.

- [ ] **Step 5: Remove Cast, Discard and the pool**

- Delete `src/ui/panels/chat/ForgeCommitBar.tsx`; in `src/ui/panels/chat/Chat.tsx` remove its import and the `{chat.type === "scenario" && <ForgeCommitBar />}` line.
- `src/core/store/effects/forge-chat-effects.ts`: delete `entityCastRequested`, `forgeCastAllRequested`, `forgeDiscardAllRequested` (creators, payload types, effects), `poolFor`, and the "Chat deleted" effect. Reduce the discard effect to:

```ts
// ─── Discard a manual draft ("+ Add Entity", not yet saved) ─────────────────
subscribeEffect(
  matchesAction(entityDiscardRequested),
  async (action, { getState: latest }) => {
    const entity = latest().world.entitiesById[action.payload.entityId];
    if (!entity || entity.lifecycle !== "draft") return;
    dispatch(entityDeleted({ entityId: entity.id }));
  },
);
```

Remove now-unused imports (`ensureCategory`, `nameKey`, `entityLorebookEntryBound`, `draftsReleasedFromChat`, `chatDeleted`, `WorldEntity`). Rewrite the header comment to list three signals: a Build turn, a Plan turn, discarding a manual draft.

- `src/core/store/slices/world.ts`: delete `draftsReleasedFromChat` and its export; delete `lastAffectingMessageId` from `entitySummaryUpdated`'s payload and body.
- `src/core/store/types.ts`: delete `lastAffectingMessageId` from `WorldEntity`; change the `sourceChatId` comment to `// set when a Scenario chat built this entity; what permits a Build DELETE`.
- `src/core/store/index.ts`: in the `PERSISTED_DATA_LOADED` branch delete the `chatIds` / `entitiesById` remapping and its comment, and use `loadedWorld` directly where `entitiesById` was spread in.
- Delete `src/core/store/selectors/forge.ts` and its test. In `src/ui/panels/world/world-select.ts` remove the import, make `loose` `Object.values(entitiesById)`, and delete the "Forge drafts stay hidden" paragraph of the comment.
- `src/core/chat-types/scenario.ts`: delete `inlineEntityIdsFor`. Leave the `inlineEntityIdsFor?` member of `ChatTypeSpec` and its use in `Message.tsx` for Task 5.

- [ ] **Step 6: Update tests, verify, commit**

Run `grep -rnE "castAll|entityCastRequested|forgeDiscardAll|draftsReleasedFromChat|isForgeDraft|selectForgeDraftPoolCount|ForgeCommitBar|lastAffectingMessageId|\[POOL\]|\[LIVE\]" src tests tools` and resolve every hit: delete tests of removed things; in `tests/ui/world-select.test.ts` assert a Scenario-built entity is listed; in `tests/core/persist-loaded.test.ts` assert an entity whose `sourceChatId` names a missing chat keeps it.

Run: `npx tsc --noEmit && npm run test 2>&1 | tail -5`
Expected: tsc 0, all pass.

```bash
npx prettier -w $(git diff --name-only --diff-filter=AM -- src tests tools)
git add -u src tests tools
git commit -m "feat(scenario): no draft pool — one [WORLD] block, and Cast/Discard are gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Undo a Build turn

**Files:**

- Create: `src/core/chat-types/undo.ts`, `tests/core/chat-types/undo.test.ts`
- Modify: `src/core/chat-types/types.ts`, `src/core/store/slices/chat.ts`, `src/core/store/slices/world.ts`, `src/core/engine/thread-bind.ts`, `src/core/store/effects/handlers/forge-chat.ts`, `src/core/store/effects/forge-chat-actions.ts`, `src/core/store/effects/forge-chat-effects.ts`, `src/core/store/effects/chat-effects.ts`, `src/core/utils/forge-chat-strategy.ts`, `src/core/store/index.ts` (export the new action if the UI imports from the store barrel)
- Test: `tests/core/store/effects/handlers/forge-chat.test.ts`, `tests/core/store/effects/forge-chat-effects.test.ts`, `tests/core/store/slices/world.test.ts`, `tests/core/store/slices/chat.test.ts`, `tests/core/utils/forge-chat-strategy.test.ts`

**Interfaces:**

- Consumes: `ForgeUndo`, `ForgeActionRecord.undo/undoResult`, `renameEntry` (Task 2).
- Produces:
  - `ChatMessage.undone?: boolean`
  - `isUndoable(m: ChatMessage): boolean`, `latestUndoable(messages: ChatMessage[]): ChatMessage | undefined`, `pruneBlocked(messages: ChatMessage[], fromId: string): boolean` in `chat-types/undo.ts`
  - `messageUndone({ chatId, id })` in `slices/chat.ts`
  - `entityRestored({ entity, threadIds })` in `slices/world.ts`
  - `undoForgeAction(action, getState, dispatch): Promise<"undone" | "skipped" | "failed">` and `undoTurn(getState, dispatch, chatId, messageId): Promise<boolean>` in `handlers/forge-chat.ts`
  - `scenarioTurnUndoRequested({ chatId, messageId })` in `forge-chat-actions.ts`

- [ ] **Step 1: Failing tests for the pure helpers**

`tests/core/chat-types/undo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isUndoable,
  latestUndoable,
  pruneBlocked,
} from "../../../src/core/chat-types/undo";
import type { ChatMessage } from "../../../src/core/chat-types/types";

const build = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: "assistant",
  content: "x",
  mode: "build",
  forgeSegments: [
    {
      kind: "action",
      action: {
        kind: "REVISE",
        status: "applied",
        name: "Kei",
        undo: { op: "summary", entityId: "e", before: "a", wrote: "b" },
      },
    },
  ],
  ...over,
});
const user = (id: string): ChatMessage => ({ id, role: "user", content: "hi" });

describe("which Build reply can be undone", () => {
  it("is one that applied something and has not been undone", () => {
    expect(isUndoable(build("b1"))).toBe(true);
    expect(isUndoable(build("b1", { undone: true }))).toBe(false);
    expect(isUndoable(build("b1", { forgeSegments: undefined }))).toBe(false);
    expect(
      isUndoable(
        build("b1", {
          forgeSegments: [
            {
              kind: "action",
              action: { kind: "DELETE", status: "rejected", name: "K" },
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(isUndoable({ ...build("b1"), mode: "plan" })).toBe(false);
  });

  it("is only the latest such reply, and the one before once that is undone", () => {
    expect(latestUndoable([build("b1"), user("u"), build("b2")])?.id).toBe(
      "b2",
    );
    expect(
      latestUndoable([build("b1"), user("u"), build("b2", { undone: true })])
        ?.id,
    ).toBe("b1");
    expect(latestUndoable([user("u")])).toBeUndefined();
  });

  it("blocks a prune that would drop a later reply still applied", () => {
    const msgs = [build("b1"), user("u"), build("b2")];
    expect(pruneBlocked(msgs, "b1")).toBe(true);
    expect(pruneBlocked(msgs, "b2")).toBe(false);
    expect(
      pruneBlocked([build("b1"), build("b2", { undone: true })], "b1"),
    ).toBe(false);
  });
});
```

Run: `npx vitest run tests/core/chat-types/undo.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 2: Implement `undo.ts` and the flag**

Add to `ChatMessage` in `types.ts`:

```ts
  /** True once this Build reply's commands were reversed by Undo. Its pills
   *  stay, struck through, and later turns are not shown it. */
  undone?: boolean;
```

`src/core/chat-types/undo.ts`:

```ts
import type { ChatMessage } from "./types";

/** A Build reply that applied at least one command and still stands. */
export function isUndoable(m: ChatMessage): boolean {
  return (
    m.role === "assistant" &&
    m.mode === "build" &&
    !m.undone &&
    (m.forgeSegments ?? []).some(
      (s) =>
        s.kind === "action" && s.action.status === "applied" && !!s.action.undo,
    )
  );
}

/** Undo goes backwards one turn at a time: only the latest standing Build
 *  reply may be undone, since later turns may have built on earlier ones. */
export function latestUndoable(
  messages: ChatMessage[],
): ChatMessage | undefined {
  return [...messages].reverse().find(isUndoable);
}

/** True when removing everything after `fromId` would drop a Build reply
 *  whose commands are still applied, leaving them with nothing to undo them. */
export function pruneBlocked(messages: ChatMessage[], fromId: string): boolean {
  const at = messages.findIndex((m) => m.id === fromId);
  return at !== -1 && messages.slice(at + 1).some(isUndoable);
}
```

Run the test — Expected: PASS.

- [ ] **Step 3: Reducers (test first)**

Add to `tests/core/store/slices/world.test.ts`:

```ts
it("entityRestored puts an entity back, into the Threads it was in", () => {
  const entity = {
    id: "e1",
    categoryId: FieldID.DramatisPersonae,
    name: "Kei",
    summary: "s",
    lifecycle: "live" as const,
  };
  const start = {
    entityIds: [],
    entitiesById: {},
    threads: [
      {
        id: "t1",
        title: "T",
        state: "",
        latent: "",
        wish: "",
        entityIds: ["x"],
        status: "open" as const,
      },
      {
        id: "t2",
        title: "U",
        state: "",
        latent: "",
        wish: "",
        entityIds: [],
        status: "open" as const,
      },
    ],
  };
  const next = worldSlice.reducer(
    start,
    entityRestored({ entity, threadIds: ["t1"] }),
  );
  expect(next.entitiesById.e1).toEqual(entity);
  expect(next.entityIds).toEqual(["e1"]);
  expect(next.threads[0].entityIds).toEqual(["x", "e1"]);
  expect(next.threads[1].entityIds).toEqual([]);
  // A second delivery changes nothing.
  expect(
    worldSlice.reducer(next, entityRestored({ entity, threadIds: ["t1"] })),
  ).toBe(next);
});
```

Add to `tests/core/store/slices/chat.test.ts` (follow the file's fixture style for a chat with one message `m1`):

```ts
it("messageUndone marks the reply and keeps its segments", () => {
  const next = chatSlice.reducer(
    stateWithMessage({
      id: "m1",
      role: "assistant",
      content: "x",
      forgeSegments: [],
    }),
    messageUndone({ chatId: "c1", id: "m1" }),
  );
  const m = next.chats[0].messages[0];
  expect(m.undone).toBe(true);
  expect(m.forgeSegments).toEqual([]);
});
```

Implement in `src/core/store/slices/world.ts` (add to exports):

```ts
    /** Undo of a Build DELETE: the entity returns, to the Threads it was a
     *  member of. `thread-bind.ts` subscribes and re-syncs their entries. */
    entityRestored: (
      state,
      payload: { entity: WorldEntity; threadIds: string[] },
    ) => {
      if (state.entitiesById[payload.entity.id]) return state;
      return {
        ...state,
        entitiesById: { ...state.entitiesById, [payload.entity.id]: payload.entity },
        entityIds: [...state.entityIds, payload.entity.id],
        threads: state.threads.map((t) =>
          payload.threadIds.includes(t.id) && !t.entityIds.includes(payload.entity.id)
            ? { ...t, entityIds: [...t.entityIds, payload.entity.id] }
            : t,
        ),
      };
    },
```

In `src/core/store/slices/chat.ts` next to `forgeSegmentsSet` (add to exports):

```ts
    messageUndone: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id ? { ...m, undone: true } : m,
        ),
      })),
```

In `src/core/engine/thread-bind.ts`, beside the `entityDeleted` subscription, add (and import `entityRestored`):

```ts
// A restored entity rejoins its casts in the reducer, with no thread action
// to announce it.
subscribeEffect(matchesAction(entityRestored), () => {
  for (const thread of getState().world.threads) settle(thread.id);
});
```

Run: `npx vitest run tests/core/store/slices` — Expected: PASS.

- [ ] **Step 4: Failing tests for `undoForgeAction` and `undoTurn`**

Append to `tests/core/store/effects/handlers/forge-chat.test.ts`, using the same `harness` as Task 2:

```ts
describe("undoing a Build command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([]);
    vi.spyOn(api.v1.lorebook, "createEntry").mockResolvedValue("e-new");
    vi.spyOn(api.v1.lorebook, "updateEntry").mockResolvedValue(undefined);
    vi.spyOn(api.v1.lorebook, "removeEntry").mockResolvedValue(undefined);
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue(null);
  });

  const run = async (h: ReturnType<typeof harness>, cmd: ParsedCommand) =>
    executeForgeCommand(cmd, "c1", "m1", h.getState, h.dispatch);

  it("removes a created entity and the entry Build made, even if edited since", async () => {
    const h = harness();
    const rec = await run(h, {
      kind: "CREATE",
      elementType: "CHARACTER",
      name: "Mikki",
      content: "A fox.",
    });
    h.dispatch(
      entitySummaryUpdated({
        entityId: rec.entityId!,
        summary: "Edited by hand.",
      }),
    );
    expect(await undoForgeAction(rec, h.getState, h.dispatch)).toBe("undone");
    expect(h.getState().world.entitiesById[rec.entityId!]).toBeUndefined();
    expect(api.v1.lorebook.removeEntry).toHaveBeenCalledWith("e-new");
  });

  it("unbinds, and keeps, an entry that existed before Build bound it", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([
      { id: "e-old", displayName: "Mikki" },
    ]);
    const h = harness();
    const rec = await run(h, {
      kind: "CREATE",
      elementType: "CHARACTER",
      name: "Mikki",
      content: "A fox.",
    });
    await undoForgeAction(rec, h.getState, h.dispatch);
    expect(api.v1.lorebook.removeEntry).not.toHaveBeenCalled();
    expect(h.getState().world.entitiesById[rec.entityId!]).toBeUndefined();
  });

  it("restores a revised summary, unless it changed since", async () => {
    const h = harness({ entities: [imported("Kei", "Old.")] });
    const rec = await run(h, { kind: "REVISE", name: "Kei", content: "New." });
    expect(await undoForgeAction(rec, h.getState, h.dispatch)).toBe("undone");
    expect(Object.values(h.getState().world.entitiesById)[0].summary).toBe(
      "Old.",
    );

    const rec2 = await run(h, {
      kind: "REVISE",
      name: "Kei",
      content: "Newer.",
    });
    h.dispatch(
      entitySummaryUpdated({ entityId: rec2.entityId!, summary: "Mine." }),
    );
    expect(await undoForgeAction(rec2, h.getState, h.dispatch)).toBe("skipped");
    expect(Object.values(h.getState().world.entitiesById)[0].summary).toBe(
      "Mine.",
    );
  });

  it("restores a name, on the entity and its entry", async () => {
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue({
      id: "e1",
      displayName: "Kay",
      keys: ["x"],
    });
    const h = harness({ entities: [imported("Kei", "S.", "e1")] });
    const rec = await run(h, {
      kind: "RENAME",
      oldName: "Kei",
      newName: "Kay",
    });
    expect(await undoForgeAction(rec, h.getState, h.dispatch)).toBe("undone");
    expect(Object.values(h.getState().world.entitiesById)[0].name).toBe("Kei");
    expect(api.v1.lorebook.updateEntry).toHaveBeenLastCalledWith(
      "e1",
      expect.objectContaining({ displayName: "Kei" }),
    );
  });

  it("brings a deleted entity back with its entry and its Threads", async () => {
    const entry = {
      id: "e1",
      displayName: "Kei",
      text: "Lore.",
      keys: ["kei"],
      enabled: true,
    };
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue(entry);
    const built = { ...imported("Kei", "S.", "e1"), sourceChatId: "c0" };
    const h = harness({
      entities: [built],
      threads: [
        {
          id: "t1",
          title: "T",
          state: "",
          latent: "",
          wish: "",
          entityIds: [built.id],
          status: "open",
        },
      ],
    });
    const rec = await run(h, { kind: "DELETE", name: "Kei" });
    expect(await undoForgeAction(rec, h.getState, h.dispatch)).toBe("undone");
    expect(h.getState().world.entitiesById[built.id]).toEqual(built);
    expect(h.getState().world.threads[0].entityIds).toEqual([built.id]);
    expect(api.v1.lorebook.createEntry).toHaveBeenCalledWith(entry);
  });

  it("removes a created Thread, and restores a rewritten one unless it changed", async () => {
    const h = harness({ entities: [imported("A", "s"), imported("B", "s")] });
    const made = await run(h, {
      kind: "THREAD",
      title: "Half",
      memberNames: ["A", "B"],
      state: "S0",
      latent: "P0",
      wish: "W0",
    });
    const rewrote = await run(h, {
      kind: "THREAD",
      title: "Half",
      memberNames: ["A"],
      state: "S1",
      latent: "",
      wish: "",
    });
    expect(await undoForgeAction(rewrote, h.getState, h.dispatch)).toBe(
      "undone",
    );
    expect(h.getState().world.threads[0]).toMatchObject({
      state: "S0",
      latent: "P0",
      wish: "W0",
    });

    const again = await run(h, {
      kind: "THREAD",
      title: "Half",
      memberNames: ["A"],
      state: "S2",
      latent: "",
      wish: "",
    });
    h.dispatch(
      threadLedgerUpdated({
        threadId: made.threadId!,
        state: "By hand",
        latent: "P0",
      }),
    );
    expect(await undoForgeAction(again, h.getState, h.dispatch)).toBe(
      "skipped",
    );

    expect(await undoForgeAction(made, h.getState, h.dispatch)).toBe("undone");
    expect(h.getState().world.threads).toHaveLength(0);
  });

  it("reports a lorebook failure and changes nothing", async () => {
    const h = harness();
    const rec = await run(h, {
      kind: "CREATE",
      elementType: "CHARACTER",
      name: "Mikki",
      content: "A fox.",
    });
    vi.spyOn(api.v1.lorebook, "removeEntry").mockRejectedValue(new Error("no"));
    expect(await undoForgeAction(rec, h.getState, h.dispatch)).toBe("failed");
    expect(h.getState().world.entitiesById[rec.entityId!]).toBeDefined();
  });
});
```

For `undoTurn`, add a test that builds a chat message `m1` with two applied segments (a CREATE record and a REVISE record produced by `run`), stored via `forgeSegmentsSet`, then:

```ts
it("undoTurn reverses a reply's commands last first and marks it undone", async () => {
  // … arrange as described: chat c1, message m1 (mode "build"), segments [create Mikki, revise Mikki]
  expect(await undoTurn(h.getState, h.dispatch, "c1", "m1")).toBe(true);
  const m = h.getState().chat.chats[0].messages[0];
  expect(m.undone).toBe(true);
  expect(
    m.forgeSegments!.map((s) => s.kind === "action" && s.action.undoResult),
  ).toEqual(["undone", "undone"]);
  expect(Object.keys(h.getState().world.entitiesById)).toHaveLength(0);
});

it("undoTurn leaves the reply standing when a command could not be reversed, and retries only that one", async () => {
  // arrange as above; make removeEntry reject once
  vi.spyOn(api.v1.lorebook, "removeEntry")
    .mockRejectedValueOnce(new Error("no"))
    .mockResolvedValue(undefined);
  expect(await undoTurn(h.getState, h.dispatch, "c1", "m1")).toBe(false);
  expect(h.getState().chat.chats[0].messages[0].undone).toBeUndefined();
  expect(await undoTurn(h.getState, h.dispatch, "c1", "m1")).toBe(true);
  expect(h.getState().chat.chats[0].messages[0].undone).toBe(true);
});
```

Write the arrange code in full using the file's helpers; the `harness` must include the `chat` slice for these two.

Run: `npx vitest run tests/core/store/effects/handlers/forge-chat.test.ts` — Expected: FAIL, `undoForgeAction` not exported.

- [ ] **Step 5: Implement `undoForgeAction` and `undoTurn`**

In `src/core/store/effects/handlers/forge-chat.ts` (import `entityRestored`, `threadDeleted` from `../../slices/world`, `messageUndone` from `../../slices/chat`):

```ts
/** Reverse one applied command. "skipped" means the thing changed since the
 *  command wrote it, so the newer value is left alone. */
export async function undoForgeAction(
  action: ForgeActionRecord,
  getState: () => RootState,
  dispatch: AppDispatch,
): Promise<"undone" | "skipped" | "failed"> {
  const undo = action.undo;
  if (!undo) return "skipped";
  try {
    const world = getState().world;
    switch (undo.op) {
      case "entityCreated": {
        const entity = world.entitiesById[undo.entityId];
        if (!entity) return "undone";
        if (undo.entryCreated && entity.lorebookEntryId) {
          await api.v1.lorebook.removeEntry(entity.lorebookEntryId);
        }
        dispatch(entityDeleted({ entityId: entity.id }));
        return "undone";
      }
      case "summary": {
        const entity = world.entitiesById[undo.entityId];
        if (!entity || entity.summary !== undo.wrote) return "skipped";
        dispatch(
          entitySummaryUpdated({ entityId: entity.id, summary: undo.before }),
        );
        return "undone";
      }
      case "name": {
        const entity = world.entitiesById[undo.entityId];
        if (!entity || entity.name !== undo.wrote) return "skipped";
        if (entity.lorebookEntryId) {
          await renameEntry(entity.lorebookEntryId, undo.wrote, undo.before);
        }
        dispatch(
          entityEdited({
            entityId: entity.id,
            name: undo.before,
            summary: entity.summary,
          }),
        );
        return "undone";
      }
      case "entityDeleted": {
        if (world.entitiesById[undo.entity.id]) return "undone";
        if (undo.entry) await api.v1.lorebook.createEntry(undo.entry);
        dispatch(
          entityRestored({ entity: undo.entity, threadIds: undo.threadIds }),
        );
        return "undone";
      }
      case "threadCreated": {
        const thread = world.threads.find((t) => t.id === undo.threadId);
        if (!thread) return "undone";
        dispatch(
          threadDeleted({
            threadId: thread.id,
            lorebookEntryId: thread.lorebookEntryId,
          }),
        );
        return "undone";
      }
      case "threadRewritten": {
        const thread = world.threads.find((t) => t.id === undo.threadId);
        if (
          !thread ||
          thread.state !== undo.wrote[0] ||
          thread.latent !== undo.wrote[1] ||
          thread.wish !== undo.wrote[2]
        ) {
          return "skipped";
        }
        dispatch(
          threadLedgerUpdated({
            threadId: thread.id,
            state: undo.before[0],
            latent: undo.before[1],
          }),
        );
        dispatch(threadWishSet({ threadId: thread.id, wish: undo.before[2] }));
        return "undone";
      }
    }
  } catch (error) {
    api.v1.log("[scenario] undo failed:", error);
    return "failed";
  }
}

/** Reverse a Build reply's applied commands, last first. Commands already
 *  reversed by an earlier attempt are left alone. Marks the reply undone only
 *  when none failed; returns whether it did. */
export async function undoTurn(
  getState: () => RootState,
  dispatch: AppDispatch,
  chatId: string,
  messageId: string,
): Promise<boolean> {
  const message = getState()
    .chat.chats.find((c) => c.id === chatId)
    ?.messages.find((m) => m.id === messageId);
  const segments = message?.forgeSegments;
  if (!segments) return false;

  const next = [...segments];
  let failed = false;
  for (let i = next.length - 1; i >= 0; i--) {
    const seg = next[i];
    if (seg.kind !== "action") continue;
    const { action } = seg;
    if (action.status !== "applied" || !action.undo) continue;
    if (action.undoResult === "undone" || action.undoResult === "skipped") {
      continue;
    }
    const undoResult = await undoForgeAction(action, getState, dispatch);
    if (undoResult === "failed") failed = true;
    next[i] = { kind: "action", action: { ...action, undoResult } };
  }
  dispatch(forgeSegmentsSet({ chatId, id: messageId, segments: next }));
  if (!failed) dispatch(messageUndone({ chatId, id: messageId }));
  return !failed;
}
```

A created Thread's entry is switched off by `threadDeleted`, as when a Thread is deleted in the World (`thread-bind.ts` never removes a Thread's entry). Amend the spec's sentence "A created Thread is removed with its entry." to "A created Thread is removed, and its entry switched off as when a Thread is deleted in the World." in `docs/superpowers/specs/2026-10-08-scenario-build-live-design.md`.

Run the handler tests — Expected: PASS. Run `npx vitest run tests/core/engine/latent-privacy.test.ts` — Expected: PASS with the allow-lists untouched.

- [ ] **Step 6: The undo request, its effect, and what later turns see (test first)**

Add to `tests/core/store/effects/forge-chat-effects.test.ts` (use the file's existing harness that registers the effects on a real store):

```ts
describe("undoing a Build turn", () => {
  it("undoes the latest standing Build reply", async () => {
    /* arrange chat with b1 (applied REVISE Kei Old→New); dispatch scenarioTurnUndoRequested({chatId:"c1",messageId:"b1"}); await flush; expect summary "Old." and message.undone true */
  });
  it("refuses a reply that is not the latest standing one", async () => {
    /* b1 and b2 both applied; request b1; expect nothing changed and b1.undone undefined */
  });
  it("refuses while a turn for the chat is queued or running", async () => {
    /* put a forgeChat request in runtime.queue; request; expect nothing changed */
  });
});
```

Write each body in full with the file's helpers; the assertions named in the comments are the required ones.

Add to `tests/core/utils/forge-chat-strategy.test.ts`:

```ts
it("leaves an undone Build reply out of the conversation and the rejections", () => {
  const undone: ChatMessage = {
    id: "b1",
    role: "assistant",
    mode: "build",
    undone: true,
    content: '[CREATE CHARACTER "Mikki" | A fox.]',
    forgeSegments: [
      {
        kind: "action",
        action: {
          kind: "DELETE",
          status: "rejected",
          name: "X",
          reason: "not found",
        },
      },
    ],
  };
  expect(scenarioConversation([undone])).toEqual([]);
  expect(formatRejections([undone])).toBe("");
});
```

Implement:

- `src/core/store/effects/forge-chat-actions.ts`, following the file's pattern:

```ts
export interface ScenarioTurnUndoRequestedPayload {
  chatId: string;
  messageId: string;
}

const SCENARIO_TURN_UNDO_REQUESTED = "forgeChat/turnUndoRequested";
export const scenarioTurnUndoRequested = (
  payload: ScenarioTurnUndoRequestedPayload,
) => ({
  type: SCENARIO_TURN_UNDO_REQUESTED as typeof SCENARIO_TURN_UNDO_REQUESTED,
  payload,
});
scenarioTurnUndoRequested.type = SCENARIO_TURN_UNDO_REQUESTED;
```

Re-export it from `forge-chat-effects.ts` beside the other two, and from `src/core/store/index.ts` beside `forgeChatContinueRequested`.

- `src/core/store/effects/forge-chat-effects.ts`: export `scenarioRequestPending`, and add inside `registerForgeChatEffects`:

```ts
// ─── Undo a Build turn ──────────────────────────────────────────────────────
// The work spans awaits (lorebook calls), so a second press is refused here.
const undoing = new Set<string>();
subscribeEffect(
  matchesAction(scenarioTurnUndoRequested),
  async (action, { getState: latest }) => {
    const { chatId, messageId } = action.payload;
    const chat = findChat(latest(), chatId);
    if (!chat || latestUndoable(chat.messages)?.id !== messageId) return;
    if (scenarioRequestPending(latest(), chatId)) return;
    if (undoing.has(messageId)) return;
    undoing.add(messageId);
    try {
      await undoTurn(latest, dispatch, chatId, messageId);
    } finally {
      undoing.delete(messageId);
    }
  },
);
```

with imports of `latestUndoable` from `../../chat-types/undo` and `undoTurn` from `./handlers/forge-chat`.

- `src/core/utils/forge-chat-strategy.ts`: in `conversation()` add `!m.undone &&` to the filter and one sentence to its comment: "An undone Build reply is left out: what it built no longer exists."

Run: `npx vitest run tests/core/store/effects tests/core/utils` — Expected: PASS.

- [ ] **Step 7: Retry undoes first (test first)**

Add to the retry tests (find them with `grep -rn "uiChatRetryGeneration" tests`):

```ts
it("undoes a Build reply before re-running it", async () => {
  /* chat with u1, b1 (applied REVISE Kei Old→New); dispatch uiChatRetryGeneration({chatId, messageId:"b1"}); flush; expect Kei summary "Old." at the moment the new Build request is queued, b1 pruned, and one forgeChat request queued */
});
it("refuses a retry that would drop a later Build reply still applied", async () => {
  /* b1, b2 applied; retry b1; expect messages unchanged, no request queued, api.v1.ui.toast called with a message containing "Undo" */
});
it("refuses the retry when the undo could not finish", async () => {
  /* b1 applied CREATE; removeEntry rejects; retry b1; expect b1 still present and no request queued */
});
```

Write the bodies in full. Then in `src/core/store/effects/chat-effects.ts` replace the head of the retry effect:

```ts
const { chatId, messageId } = action.payload;
const before = findChat(latest(), chatId);
if (!before) return;
// Read before the prune removes it: a reply is re-run in the mode that
// wrote it, whatever the toggle says now.
const retried = before.messages.find((m) => m.id === messageId);
if (before.type === "scenario") {
  // Pruning drops every later message. A later Build reply whose
  // commands still stand would be left with nothing to undo them.
  if (pruneBlocked(before.messages, messageId)) {
    void api.v1.ui.toast("Undo the later Build turns first.", {
      type: "warning",
    });
    return;
  }
  // A Build reply is undone before it is re-run, or its first attempt
  // would stay applied under the second.
  if (retried && isUndoable(retried)) {
    const undone = await undoTurn(latest, dispatch, chatId, messageId);
    if (!undone) return;
  }
}
dispatch(messagesPrunedAfter({ chatId, id: messageId }));
const chat = findChat(latest(), chatId);
if (!chat) return;
```

keeping the rest (`if (chat.type === "scenario") { dispatch(...) ; return; }` and the ordinary path) as it is. Import `pruneBlocked`, `isUndoable` from `../../chat-types/undo` and `undoTurn` from `./handlers/forge-chat`.

- [ ] **Step 8: Verify and commit**

Run: `npx tsc --noEmit && npm run test 2>&1 | tail -5` — Expected: tsc 0, all pass.

```bash
npx prettier -w $(git diff --name-only --diff-filter=AM -- src tests docs/superpowers/specs/2026-10-08-scenario-build-live-design.md)
git add src/core/chat-types/undo.ts tests/core/chat-types/undo.test.ts docs/superpowers/specs/2026-10-08-scenario-build-live-design.md
git add -u src tests
git commit -m "feat(scenario): undo a Build turn, and Retry undoes before it re-runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: One list — pills open into the World's cards, with Undo

**Files:**

- Modify: `src/core/chat-types/pills.ts`, `src/ui/panels/chat/BuildPills.tsx`, `src/ui/panels/chat/Message.tsx`, `src/core/chat-types/types.ts`
- Test: `tests/core/chat-types/pills.test.ts`, `tests/ui/build-pills-source.test.ts`, `tests/ui/chat-mode-source.test.ts`

**Interfaces:**

- Consumes: `ForgeActionRecord.entityId/threadId/undo/undoResult`, `ChatMessage.undone`, `isUndoable`, `latestUndoable`, `scenarioTurnUndoRequested`.
- Produces: `Pill.target?: { kind: "entity" | "thread"; id: string }`. `buildPills(content, segments, generating)` keeps its signature: each record's `undoResult` carries what the pills need.

- [ ] **Step 1: Failing pill tests**

In `tests/core/chat-types/pills.test.ts` replace the label tests and add:

```ts
describe("pill labels say what happened", () => {
  const rec = (over: Partial<ForgeActionRecord>): ForgeActionRecord => ({
    kind: "CREATE",
    status: "applied",
    ...over,
  });
  it.each([
    [
      rec({ kind: "CREATE", elementType: "CHARACTER", name: "Mikki" }),
      "+ character | Mikki",
    ],
    [rec({ kind: "REVISE", name: "Kei" }), "~ revised | Kei"],
    [
      rec({
        kind: "THREAD",
        name: "Half",
        undo: { op: "threadCreated", threadId: "t" },
      }),
      "+ thread | Half",
    ],
    [
      rec({
        kind: "THREAD",
        name: "Half",
        undo: {
          op: "threadRewritten",
          threadId: "t",
          before: ["", "", ""],
          wrote: ["", "", ""],
        },
      }),
      "~ thread | Half",
    ],
    [rec({ kind: "THREAD", name: "Half" }), "thread | Half"],
    [
      rec({ kind: "RENAME", name: "Kei", newName: "Kay" }),
      'rename | "Kei" → "Kay"',
    ],
    [rec({ kind: "DELETE", name: "Kei" }), "− deleted | Kei"],
    [rec({ kind: "UNKNOWN", status: "unrecognized" }), "unrecognised"],
  ])("%#", (action, label) => expect(pillLabel(action)).toBe(label));
});

describe("what a pill points at", () => {
  const seg = (action: ForgeActionRecord): ForgeSegment => ({
    kind: "action",
    action,
  });
  it("an entity command targets its entity, a Thread command its Thread", () => {
    const [a, b, c] = pillsFor([
      seg({ kind: "CREATE", status: "applied", name: "Mikki", entityId: "e1" }),
      seg({ kind: "THREAD", status: "applied", name: "Half", threadId: "t1" }),
      seg({ kind: "DELETE", status: "applied", name: "Kei" }),
    ]);
    expect(a.target).toEqual({ kind: "entity", id: "e1" });
    expect(b.target).toEqual({ kind: "thread", id: "t1" });
    expect(c.target).toBeUndefined();
  });

  it("a revise shows what it replaced", () => {
    const [p] = pillsFor([
      seg({
        kind: "REVISE",
        status: "applied",
        name: "Kei",
        entityId: "e1",
        undo: { op: "summary", entityId: "e1", before: "Old.", wrote: "New." },
        body: [{ label: "Summary", text: "New." }],
      }),
    ]);
    expect(p.body).toContainEqual({ label: "Replaced", text: "Old." });
  });

  it("a rejected command has no target", () => {
    const [p] = pillsFor([
      seg({
        kind: "REVISE",
        status: "rejected",
        name: "Kei",
        entityId: "e1",
        reason: "x",
      }),
    ]);
    expect(p.target).toBeUndefined();
  });
});

describe("an undone reply", () => {
  const applied: ForgeSegment = {
    kind: "action",
    action: {
      kind: "CREATE",
      status: "applied",
      name: "Mikki",
      entityId: "e1",
      undoResult: "undone",
    },
  };
  const kept: ForgeSegment = {
    kind: "action",
    action: {
      kind: "REVISE",
      status: "applied",
      name: "Kei",
      entityId: "e2",
      undoResult: "skipped",
    },
  };
  it("strikes what was reversed and says what was left alone", () => {
    const [a, b] = buildPills("", [applied, kept], false);
    expect(a.tone).toBe("rejected");
    expect(a.target).toBeUndefined();
    expect(a.body[0]).toEqual({
      label: "Undone",
      text: "This turn was undone.",
    });
    expect(b.tone).toBe("applied");
    expect(b.target).toEqual({ kind: "entity", id: "e2" });
    expect(b.body[0]).toEqual({
      label: "Not undone",
      text: "Changed since this turn wrote it, so undo left it alone.",
    });
  });
  it("marks a command whose undo failed, on a reply still standing", () => {
    const failed: ForgeSegment = {
      kind: "action",
      action: {
        kind: "CREATE",
        status: "applied",
        name: "Mikki",
        entityId: "e1",
        undoResult: "failed",
      },
    };
    const [p] = buildPills("", [failed], false);
    expect(p.body[0]).toEqual({
      label: "Undo failed",
      text: "The lorebook refused. Press Undo again.",
    });
  });
});
```

Run: `npx vitest run tests/core/chat-types/pills.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement in `pills.ts`**

```ts
export interface Pill {
  label: string;
  tone: "thinking" | "applied" | "rejected";
  /** Shown when the pill is opened. Empty means the pill does not open,
   *  unless it has a target. */
  body: PillPart[];
  /** The live thing this command made or changed. When it still exists the
   *  opened pill shows its card; `body` is what was written, shown if not. */
  target?: { kind: "entity" | "thread"; id: string };
}

export function pillLabel(action: ForgeActionRecord): string {
  const name = action.name ?? "";
  switch (action.kind) {
    case "CREATE":
      return `+ ${(action.elementType ?? "entity").toLowerCase()} | ${name}`;
    case "REVISE":
      return `~ revised | ${name}`;
    case "THREAD":
      return action.undo?.op === "threadCreated"
        ? `+ thread | ${name}`
        : action.undo?.op === "threadRewritten"
          ? `~ thread | ${name}`
          : `thread | ${name}`;
    case "RENAME":
      return `rename | ${quoted(action.name)} → ${quoted(action.newName)}`;
    case "DELETE":
      return `− deleted | ${name}`;
    case "UNKNOWN":
      return "unrecognised";
  }
}
```

In `pillsFor`, replace the action branch with:

```ts
const { action } = segment;
const applied = action.status === "applied";
const reversed = action.undoResult === "undone";
const lead: PillPart[] = !applied
  ? action.reason
    ? [{ label: "Not applied", text: action.reason }]
    : []
  : reversed
    ? [{ label: "Undone", text: "This turn was undone." }]
    : action.undoResult === "skipped"
      ? [
          {
            label: "Not undone",
            text: "Changed since this turn wrote it, so undo left it alone.",
          },
        ]
      : action.undoResult === "failed"
        ? [
            {
              label: "Undo failed",
              text: "The lorebook refused. Press Undo again.",
            },
          ]
        : [];
const replaced: PillPart[] =
  action.undo?.op === "summary"
    ? [{ label: "Replaced", text: action.undo.before }]
    : [];
const live = applied && !reversed;
pills.push({
  label: pillLabel(action),
  tone: live ? "applied" : "rejected",
  body: [...lead, ...(action.body ?? []), ...replaced],
  ...(live && action.entityId
    ? { target: { kind: "entity" as const, id: action.entityId } }
    : live && action.threadId
      ? { target: { kind: "thread" as const, id: action.threadId } }
      : {}),
});
```

`buildPills` is unchanged: it already returns `pillsFor(segments)` when segments are settled, and each record's `undoResult` carries what the pills need.

Run the pill tests — Expected: PASS. Existing tests that pinned `create | "Mikki"`-style labels are updated to the new labels.

- [ ] **Step 3: Source tests for the view**

Replace the body assertions in `tests/ui/build-pills-source.test.ts` and add to `tests/ui/chat-mode-source.test.ts` (these files read the `.tsx` source as text; keep their existing reading helper):

```ts
it("opens an entity pill into the World's card and a Thread pill into its row", () => {
  expect(pills).toContain("<EntityCard");
  expect(pills).toContain("<ThreadItem");
});
it("mounts a card the first time its pill is opened, then only hides it", () => {
  expect(pills).toMatch(/seen\[i\]/);
  expect(pills).toMatch(/display:\s*isOpen\s*\?\s*"block"\s*:\s*"none"/);
});
it("never names a Thread's private fields", () => {
  expect(pills).not.toMatch(/latent|wish/i);
});
```

```ts
it("offers Undo on the latest standing Build reply only, always mounted", () => {
  expect(message).toContain("scenarioTurnUndoRequested");
  expect(message).toContain("latestUndoable");
  expect(message).toMatch(/display:\s*canUndo\s*\?\s*"flex"\s*:\s*"none"/);
});
it("shows no separate block of entity cards", () => {
  expect(message).not.toContain("inlineEntityIdsFor");
  expect(message).not.toContain("EntityCard");
});
```

Run them — Expected: FAIL.

- [ ] **Step 4: `BuildPills.tsx`**

Add imports:

```ts
import { useSlice } from "../../bridge";
import { EntityCard } from "../world/EntityCard";
import { ThreadItem } from "../world/ThreadItem";
```

Add above `BuildPills`:

```tsx
/** What an opened pill shows. A pill with a target shows the live card while
 *  the thing exists, and what was written once it does not. Both are mounted
 *  and one is hidden: swapping them would leave the old one behind. */
function PillBody(props: { pill: Pill; mounted: boolean }) {
  const { pill, mounted } = props;
  const target = pill.target;
  const exists = useSlice((s) =>
    !target
      ? false
      : target.kind === "entity"
        ? !!s.world.entitiesById[target.id]
        : s.world.threads.some((t) => t.id === target.id),
  );
  return (
    <div>
      <div style={{ display: exists ? "block" : "none", marginTop: SP.xs }}>
        {mounted && target?.kind === "entity" ? (
          <EntityCard entityId={target.id} />
        ) : null}
        {mounted && target?.kind === "thread" ? (
          <ThreadItem threadId={target.id} />
        ) : null}
      </div>
      {pill.body.map((part, j) => (
        <div
          key={j}
          style={{
            // With a live card, only the notes about this command are shown
            // beside it; the card itself is the content.
            display: !exists || NOTE_LABELS.has(part.label) ? "block" : "none",
            marginTop: SP.xs,
          }}
        >
          <span
            style={{ display: part.label ? "inline" : "none", opacity: 0.6 }}
          >
            {part.label}:{" "}
          </span>
          {part.text}
          <div
            style={{
              display: part.unseen ? "block" : "none",
              fontSize: "0.8em",
              opacity: 0.5,
            }}
          >
            Never shown to the story model.
          </div>
        </div>
      ))}
    </div>
  );
}

/** Body parts that are about the command, not a copy of the thing. */
const NOTE_LABELS = new Set(["Replaced", "Not undone", "Undo failed"]);
```

`mounted && … ? <X/> : null` adds an element once, in the render caused by the writer's own click, and never removes or swaps it afterwards; that is the permitted form. Hold "ever opened" beside "open":

```ts
const [held, setHeld] = useState({
  key: props.resetKey,
  open: NONE,
  seen: NONE,
});
const open = held.key === props.resetKey ? held.open : NONE;
const seen = held.key === props.resetKey ? held.seen : NONE;
```

In the click handler:

```ts
setHeld((h) => {
  const same = h.key === props.resetKey;
  const was = same ? h.open : NONE;
  return {
    key: props.resetKey,
    open: { ...was, [i]: !was[i] },
    seen: { ...(same ? h.seen : NONE), [i]: true },
  };
});
```

A pill opens when it has a body or a target: `const opens = pill.body.length > 0 || !!pill.target;`. Replace the inner `pill.body.map(...)` block of the body `div` with `<PillBody pill={pill} mounted={!!seen[i]} />`. Update the component's doc comment to describe the card and the `seen` set. Update `tests/ui/build-pills-source.test.ts`'s `setHeld` regex to the new handler text.

- [ ] **Step 5: `Message.tsx`**

- Remove the `EntityCard` import, the `getChatTypeSpec` import if now unused, the `inlineKey` / `inlineIds` block and its comment, and the `{inlineIds.length > 0 && (…)}` JSX. In `src/core/chat-types/types.ts` delete the `inlineEntityIdsFor?` member and its comment.
- Add imports: `scenarioTurnUndoRequested` from `"../../../core/store"`, `latestUndoable` from `"../../../core/chat-types/undo"`, and `RotateCcw` from `"nai:icons/feather"`.
- Add selectors after `segments`:

```ts
const undone = useSlice((s) => !!readMessage(s, chatId, message.id)?.undone);
// Only the latest Build reply still standing can be undone: later turns may
// have built on earlier ones.
const canUndo = useSlice((s) => {
  const c = s.chat.chats.find((x) => x.id === chatId);
  return !!c && latestUndoable(c.messages)?.id === message.id;
});
// Editing drops a reply's settled segments, and with them the record of how
// to undo it. A reply whose commands still stand is not offered for edit.
const canEdit = !(
  isBuild &&
  !undone &&
  (segments ?? []).some(
    (s) => s.kind === "action" && s.action.status === "applied",
  )
);
```

- Give the Edit button `style={{ ...iconBtn, display: canEdit ? "flex" : "none" }}`.
- Inside the `<div style={{ display: "flex", gap: SP.xs }}>` action group, before Edit, add:

```tsx
<div style={{ display: canUndo ? "flex" : "none" }}>
  <ConfirmButton
    title="Undo this turn: removes what it built and restores what it changed. Separate from NovelAI's undo. Lorebook text generated since for something it built is lost."
    icon={RotateCcw}
    size={ICON}
    resetKey={message.id}
    onConfirm={() =>
      store.dispatch(
        scenarioTurnUndoRequested({
          chatId,
          messageId: message.id,
        }),
      )
    }
  />
</div>
```

- Change the role label for an undone reply: `mode === "build" ? (undone ? "Build (undone)" : "Build")`.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm run test 2>&1 | tail -5` — Expected: tsc 0, all pass, including `tests/core/engine/latent-privacy.test.ts` and `tests/ui/text-input-events.test.ts`.

```bash
npx prettier -w src/core/chat-types/pills.ts src/core/chat-types/types.ts src/ui/panels/chat/BuildPills.tsx src/ui/panels/chat/Message.tsx tests/core/chat-types/pills.test.ts tests/ui/build-pills-source.test.ts tests/ui/chat-mode-source.test.ts
git add src/core/chat-types/pills.ts src/core/chat-types/types.ts src/ui/panels/chat/BuildPills.tsx src/ui/panels/chat/Message.tsx tests/core/chat-types/pills.test.ts tests/ui/build-pills-source.test.ts tests/ui/chat-mode-source.test.ts
git commit -m "feat(scenario): a pill opens into the World's own card, and a Build turn has Undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documents

**Files:**

- Modify: `CLAUDE.md`, `CHANGELOG.md`, `README.md` (only its Forge/Scenario paragraph, if it describes drafts, Cast or Discard)

**Interfaces:** none.

- [ ] **Step 1: `CLAUDE.md`**

In **Entity system**: replace the **Cast** bullet with one saying a Scenario Build `CREATE` binds the entry at once through `bindEntryFor` (`effects/entity-entry.ts`): an unmanaged entry of the same display name is adopted, otherwise an empty one is created keyed on the name. In the **Draft entities** bullet say drafts come only from "+ Add Entity". Remove every mention of `castAllRequested` / `entityCastRequested`.

In **Scenario chat**:

- Replace "Deleting a Scenario chat releases its drafts to the World (`draftsReleasedFromChat`); casting or discarding drafts does not delete the chat." with: "There is no draft stage. What Build writes is live at once, and deleting a chat leaves what it built in the World."
- Add a bullet: "**What Build may touch.** `REVISE` and `RENAME` work on any entity (a revise writes the summary only; a rename also renames the bound entry, and swaps its key while that is still the name stub). `DELETE` works only on an entity with a `sourceChatId`, and removes its lorebook entry. The model sees one `[WORLD]` block with those entities starred."
- Add a bullet: "**Undo is per Build reply.** Each applied command stores its reverse on its `ForgeActionRecord` (`undo`, a `ForgeUndo`); a Thread's three texts are positional there so the type names no private field, and only `handlers/forge-chat.ts` reads them. `undoTurn` plays a reply's records back last first and marks it `undone`. A revise, rename or Thread rewrite is reversed only if the value still equals what the command wrote. Only the latest standing Build reply is undoable (`chat-types/undo.ts`). Retry undoes first, and is refused when pruning would drop a later Build reply still applied. An undone reply is left out of later turns. Editing is not offered on a reply whose commands stand, because an edit drops the segments that hold the undo."
- In the pills bullet: a pill with a target opens into `EntityCard` / `ThreadItem`, mounted the first time it is opened and hidden after; `[+ character | Name]`-style labels; the inline card block is gone.
- Remove the sentences about the reference scrub, `messageKind: "cleanup"`, tombstones, `[POOL]`, `[LIVE]`.

In **State**, remove any mention of a `forge` slice if present.

- [ ] **Step 2: `CHANGELOG.md`**

Read the `[0.15.0]` section. Check 0.14 with `git show v0.14.1:CHANGELOG.md 2>/dev/null | head -80` or the `[0.14.x]` sections of the file itself to see whether Cast/Discard and drafts shipped in 0.14. Then, in `[0.15.0]`:

- Under **Changed**: "What the Scenario chat builds is real at once: each entity gets its lorebook entry as it is made, with no draft step to approve."
- Under **Added**: "Undo on a Build reply reverses everything that turn did. Retry undoes before it tries again." and "Each thing a Build turn did is one collapsed line that opens into the entity or Thread itself."
- Under **Removed**, only if 0.14 shipped them: "Cast and Discard, and draft entities in the chat."
- Rewrite or delete any existing `[0.15.0]` bullet that mentions drafts, Cast, Discard, the pool, tombstones or a cleanup pass. The section must read as 0.14→0.15 and mention nothing that existed only during 0.15 development.

- [ ] **Step 3: Verify and commit**

Run: `grep -nE "tombstone|scrub|\[POOL\]|\[LIVE\]|castAll|entityCastRequested|draftsReleasedFromChat|ForgeCommitBar" CLAUDE.md CHANGELOG.md` — Expected: no output.
Run: `npx tsc --noEmit && npm run test 2>&1 | tail -5` — Expected: tsc 0, all pass.

```bash
npx prettier -w CLAUDE.md CHANGELOG.md
git add CLAUDE.md CHANGELOG.md
git commit -m "docs(scenario): Build writes for real, undo per turn, one card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the plan

Needs a real build in NovelAI, in a chat made for the test: a CREATE yields a lorebook entry; pills open into cards and Thread rows; Undo removes the entry and restores a revise; Retry does not double-apply; a Build reply opens with "Settled:" thinking.
