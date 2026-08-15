# Branch-Scoped Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the World, Foundation and story fields out of one `storyStorage` blob into per-record `historyStorage` keys, so undo and redo move Engine state with the story.

**Architecture:** Two new pure-ish units sit under `src/core/store/persistence/` — `keyspace.ts` turns state into records and back (and owns the index that decides what exists), `history-store.ts` wraps the async `historyStorage` API and owns the capture-node-at-dispatch rule. `autosave.ts` is rewritten to write records instead of a blob, `mount.ts` loads through the same path, and a new `history-sync.ts` owns the single `onHistoryNavigated` registration that both bumps `historyEpoch` and rehydrates.

**Tech Stack:** TypeScript (strict), `nai-store` (Redux-like), `api.v1.historyStorage` / `api.v1.document.history`, `vitest` (node environment), `nibs` build.

This is **phase 2 of 6** from the design spec's §14 (`docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md`). Phase 1 (the Setup tab) is merged. Nothing here touches the agentic loop; it builds the storage the loop will write through.

## Global Constraints

- **Version:** the branch is already at `0.15.0` and **must not be bumped again** — one bump per pull request, and phase 1 spent it.
- **No migrations. None.** Story Engine is alpha; upgrading drops Engine state. Old `kse-persist` data is simply not read. This plan therefore _deletes_ the existing migration code rather than porting it — see Task 6.
- **Never call `historyStorage.remove()` on a record key.** `get()` falls through to the nearest ancestor, so removing a record uncovers the parent branch's copy and resurrects it. Deletion is an index write (§6.2.1).
- **Never omit the node argument on a `historyStorage` write.** Capture `currentNodeId()` when the action is dispatched and pass it explicitly at flush (§6.3). Two adjacent calls have been measured disagreeing about "current".
- **Node ids are opaque `number`s and are NOT ordered** — a child can be numerically smaller than its parent (§12.1). Never sort, compare, or infer recency from them.
- **`api.v1.hooks.register` holds one callback per hook name.** `bootstrap-effects.ts:171` already registers `onHistoryNavigated`. A second registration replaces it. There must be exactly one, doing both jobs.
- **Chat stays in `storyStorage`** — brainstorms follow the writer, not the branch (§6.1).
- Strict TypeScript: `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`. An unused import fails the build.
- Tests run under vitest, `environment: "node"`, `include: ["tests/**/*.test.ts"]`. No DOM library; `.tsx` is never collected.
- Prettier is pinned exactly. Use `npm run format` (never `npx prettier -w`, never `npm install`).
- `npm run build` rewrites `project.yaml`'s `updatedAt` and re-fetches `external/*.d.ts`. Discard both with `git checkout -- external/ project.yaml` before committing.
- End every commit message with these two trailer lines exactly (repo convention):
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CQDYqXGmyq3Hwp13mMigxY
  ```

---

## The keyspace

`historyStorage` (branch-scoped — moves with undo/redo):

```
index         { entityIds: string[]; groupIds: string[]; fieldIds: string[] }
e:<entityId>  WorldEntity
t:<groupId>   WorldGroup      // `t:` not `g:` — phase 5 renames the type to Thread,
                              // and picking the final key now avoids a rename later
f:<fieldId>   StoryField
foundation    FoundationState
story-flags   { attgEnabled: boolean; styleEnabled: boolean }
```

`storyStorage` (story-scoped — follows the writer):

```
kse-chat      ChatSliceState
```

`index` is authoritative for existence. A record whose id the index does not name is never read, which is what makes deletion branch-local without tombstones.

**Not persisted at all:** `ui`, `runtime` (ephemeral), and `forge` — note that `forge` is currently listed in `PersistedData` and handled by the root reducer but has never been written by `autosave.ts`, so it has only ever been in-memory. This plan does not change that; it removes the dead `forge` branch from the load path in Task 6.

## File Structure

**Created:**

| File                                          | Responsibility                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/core/store/persistence/keyspace.ts`      | Pure. Key builders, `toRecords(state)`, `applyRecords(records)`, and the index. No API calls.                        |
| `src/core/store/persistence/history-store.ts` | Async adapter over `api.v1.historyStorage` + `currentNodeId()`. Owns node capture and the index-driven load fan-out. |
| `src/core/store/effects/history-sync.ts`      | The single `onHistoryNavigated` registration: bump `historyEpoch`, rehydrate branch-scoped slices.                   |
| `tests/helpers/history-fake.ts`               | In-memory `historyStorage` + `document.history` with real ancestor inheritance, so branch behaviour is testable.     |
| `tests/core/keyspace.test.ts`                 | Round-trip, index authority, deletion semantics.                                                                     |
| `tests/core/history-store.test.ts`            | Node capture, load fan-out, inheritance across branches.                                                             |

**Modified:**

| File                                          | Change                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/type-overrides.d.ts`                     | Corrected `onHistoryNavigated` registration overload (`nodeId: number`).      |
| `src/core/store/effects/autosave.ts`          | Writes sharded records at a captured node instead of one blob.                |
| `src/core/store/index.ts`                     | `PersistedData` loses `forge`; `migrateWorldState` deleted.                   |
| `src/core/store/effects/bootstrap-effects.ts` | Gives up its `onHistoryNavigated` registration to `history-sync.ts`.          |
| `src/core/store/register-effects.ts`          | Registers the new history-sync effects.                                       |
| `src/ui/mount.ts`                             | Loads through `history-store` + `storyStorage` chat; migration calls removed. |
| `src/core/keys.ts`                            | `PERSIST` replaced by `CHAT`.                                                 |
| `tests/setup.ts`                              | Default `historyStorage` and `document.history` stubs.                        |
| `CHANGELOG.md`                                | One bullet under the existing `0.15.0`.                                       |

**Deleted:** `src/core/store/migrations/brainstorm-to-chat.ts` and its test, if one exists.

---

### Task 1: Type override and test harness

**Files:**

- Modify: `src/type-overrides.d.ts`
- Create: `tests/helpers/history-fake.ts`
- Modify: `tests/setup.ts`
- Test: `tests/core/history-fake.test.ts`

**Interfaces:**

- Produces: `installHistoryFake(): HistoryFake` where
  ```ts
  type HistoryFake = {
    /** Create a child of the current node and switch to it. Returns its id. */
    push(): number;
    /** Move to an existing node without creating one. */
    goto(node: number): void;
    current(): number;
    reset(): void;
  };
  ```

The fake models the one behaviour the whole plan depends on: `get`/`list` search ancestors, writes land at one node, and a sibling branch never sees them.

- [ ] **Step 1: Add the typings override**

Append to `src/type-overrides.d.ts`:

```ts
// NAI TYPE DOCUMENTATION OVERRIDE
//
// onHistoryNavigated's nodeId/previousNodeId are declared `string` upstream but
// arrive as `number` at runtime, matching document.history.currentNodeId().
// Measured — see the v15 design §12.1. Reported to NovelAI.
//
// OnHistoryNavigated is a type alias so it cannot be augmented, and declaration
// merging cannot change a member's type on the HookCallbacks interface. A merged
// namespace declaration adds a register OVERLOAD instead: the generic
// register<K extends keyof HookCallbacks> is tried first, fails to accept a
// number-typed callback, and resolution falls through to this one.
namespace api.v1.hooks {
  function register(
    hookName: "onHistoryNavigated",
    callback: (params: {
      nodeId: number;
      previousNodeId: number;
      direction: "forward" | "backward" | "both";
      distance: number;
      cause: "undo" | "redo" | "retry" | "jump";
    }) => void | Promise<void>,
  ): void;
}
```

- [ ] **Step 2: Verify overload resolution actually works**

Create a scratch file `/tmp/overload-check.ts` containing:

```ts
api.v1.hooks.register("onHistoryNavigated", (params) => {
  const n: number = params.nodeId;
  void n;
});
```

Run: `npx tsc --noEmit` after temporarily adding that file under `src/`.
Expected: clean. If it errors with "not assignable", the overload is not being
picked — delete the scratch file and STOP, reporting the exact error. The
fallback is a declared params type plus one reinterpreting cast in the single
handler, but do not choose it without reporting first.

Delete the scratch file before continuing.

- [ ] **Step 3: Write the fake**

Create `tests/helpers/history-fake.ts`:

```ts
import { vi } from "vitest";

export type HistoryFake = {
  push(): number;
  goto(node: number): void;
  current(): number;
  reset(): void;
};

/** In-memory historyStorage + document.history with real ancestor inheritance.
 *
 *  The behaviours that matter, all measured against the live backend (design
 *  §12.1): writes land at exactly one node; get/list search ancestors until a
 *  value is found; a node off the current path is not addressable; node ids are
 *  opaque and unordered — this fake deliberately hands out DESCENDING ids so a
 *  test that sorts them or assumes ordering fails loudly. */
export function installHistoryFake(): HistoryFake {
  // node id -> parent id (undefined for the root)
  const parents = new Map<number, number | undefined>();
  // node id -> its own writes only; inheritance is resolved on read
  const data = new Map<number, Map<string, unknown>>();
  let nextId = 1_000_000;
  let cursor = nextId;

  const init = () => {
    parents.clear();
    data.clear();
    nextId = 1_000_000;
    cursor = nextId;
    parents.set(cursor, undefined);
    data.set(cursor, new Map());
  };
  init();

  const at = (node: number): Map<string, unknown> => {
    if (!data.has(node)) data.set(node, new Map());
    return data.get(node) as Map<string, unknown>;
  };

  /** current node first, then each ancestor. */
  const chain = (node: number): number[] => {
    const out: number[] = [];
    let id: number | undefined = node;
    while (id !== undefined) {
      out.push(id);
      id = parents.get(id);
    }
    return out;
  };

  const lookup = (key: string, node: number): unknown => {
    for (const id of chain(node)) {
      const bucket = data.get(id);
      if (bucket && bucket.has(key)) return bucket.get(key);
    }
    return undefined;
  };

  const reachable = (node: number): boolean => chain(cursor).includes(node);

  api.v1.historyStorage = {
    get: vi.fn(async (key: string, node?: number) => {
      const target = node ?? cursor;
      if (!reachable(target)) return undefined;
      return lookup(key, target);
    }),
    set: vi.fn(async (key: string, value: unknown, node?: number) => {
      at(node ?? cursor).set(key, value);
    }),
    remove: vi.fn(async (key: string, node?: number) => {
      at(node ?? cursor).delete(key);
    }),
    has: vi.fn(async (key: string, node?: number) => {
      const target = node ?? cursor;
      return reachable(target) && lookup(key, target) !== undefined;
    }),
    list: vi.fn(async (node?: number) => {
      const target = node ?? cursor;
      if (!reachable(target)) return [];
      const keys = new Set<string>();
      for (const id of chain(target)) {
        for (const k of data.get(id)?.keys() ?? []) keys.add(k);
      }
      return [...keys];
    }),
    getOrDefault: vi.fn(
      async (key: string, fallback: unknown, node?: number) => {
        // Same reachability gate as get/has/list. Without it a read against a
        // node off the current ancestor chain would walk that node's own chain
        // and hand back real data where the backend returns nothing.
        const target = node ?? cursor;
        if (!reachable(target)) return fallback;
        const v = lookup(key, target);
        return v === undefined ? fallback : v;
      },
    ),
    setIfAbsent: vi.fn(async () => false),
  } as unknown as typeof api.v1.historyStorage;

  api.v1.document.history = {
    currentNodeId: vi.fn(async () => cursor),
    nodeState: vi.fn(async (node: number) => ({
      backwardPath: [],
      forwardPath: [],
      sections: [],
      targetNode: {
        id: node,
        parent: parents.get(node),
        children: [],
        route: undefined,
        genPosition: undefined,
      },
    })),
    mostRecentGenerationNodeId: vi.fn(async () => undefined),
    previousNodeId: vi.fn(async () => parents.get(cursor)),
    undo: vi.fn(async () => true),
    redo: vi.fn(async () => true),
    jump: vi.fn(async () => true),
  } as unknown as typeof api.v1.document.history;

  return {
    push() {
      // Descending ids on purpose: real node ids are not monotonic.
      const id = --nextId;
      parents.set(id, cursor);
      data.set(id, new Map());
      cursor = id;
      return id;
    },
    goto(node: number) {
      cursor = node;
    },
    current() {
      return cursor;
    },
    reset: init,
  };
}
```

- [ ] **Step 4: Add default stubs so unrelated suites keep passing**

In `tests/setup.ts`, inside the `apiMock.v1` object, add alongside the existing
`storyStorage` entry:

```ts
    historyStorage: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockResolvedValue(false),
      list: vi.fn().mockResolvedValue([]),
      getOrDefault: vi.fn(async (_k: string, d: unknown) => d),
      setIfAbsent: vi.fn().mockResolvedValue(false),
    },
```

and extend the existing `document` stub so it reads:

```ts
    document: {
      sectionIds: vi.fn().mockResolvedValue([]),
      history: {
        currentNodeId: vi.fn().mockResolvedValue(1),
        nodeState: vi.fn().mockResolvedValue(undefined),
        previousNodeId: vi.fn().mockResolvedValue(undefined),
      },
    },
```

Also add `remove: vi.fn().mockResolvedValue(undefined)` to the existing
`storyStorage` stub — the load path calls it and the stub currently lacks it.

- [ ] **Step 5: Write the fake's own test**

Create `tests/core/history-fake.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { installHistoryFake, type HistoryFake } from "../helpers/history-fake";

describe("history fake", () => {
  let h: HistoryFake;
  beforeEach(() => {
    h = installHistoryFake();
  });

  it("reads back a value written at the current node", async () => {
    await api.v1.historyStorage.set("k", 1);
    expect(await api.v1.historyStorage.get("k")).toBe(1);
  });

  it("inherits a parent's value at a child", async () => {
    await api.v1.historyStorage.set("k", "parent");
    h.push();
    expect(await api.v1.historyStorage.get("k")).toBe("parent");
  });

  it("lets a child shadow the parent without touching it", async () => {
    await api.v1.historyStorage.set("k", "parent");
    const parent = h.current();
    h.push();
    await api.v1.historyStorage.set("k", "child");
    expect(await api.v1.historyStorage.get("k")).toBe("child");
    expect(await api.v1.historyStorage.get("k", parent)).toBe("parent");
  });

  it("hides a child's write after navigating back", async () => {
    const parent = h.current();
    h.push();
    await api.v1.historyStorage.set("only-here", true);
    h.goto(parent);
    expect(await api.v1.historyStorage.get("only-here")).toBeUndefined();
  });

  it("does not leak between sibling branches", async () => {
    const root = h.current();
    h.push();
    await api.v1.historyStorage.set("left", true);
    h.goto(root);
    h.push();
    expect(await api.v1.historyStorage.get("left")).toBeUndefined();
  });

  it("list() inherits ancestor keys like get()", async () => {
    await api.v1.historyStorage.set("a", 1);
    h.push();
    await api.v1.historyStorage.set("b", 2);
    expect((await api.v1.historyStorage.list()).sort()).toEqual(["a", "b"]);
  });

  it("hands out unordered ids — a child can be smaller than its parent", () => {
    const parent = h.current();
    const child = h.push();
    expect(child).toBeLessThan(parent);
  });
});
```

- [ ] **Step 6: Run it**

Run: `npx vitest run tests/core/history-fake.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Full suite, typecheck, format**

Run: `npm test && npx tsc --noEmit && npm run format`
Expected: everything green — the new default stubs must not disturb any existing suite.

- [ ] **Step 8: Commit**

```bash
git add src/type-overrides.d.ts tests/helpers/history-fake.ts tests/setup.ts tests/core/history-fake.test.ts
git commit -m "test: add a branch-aware historyStorage fake, and correct the nodeId typing"
```

---

### Task 2: The keyspace

**Files:**

- Create: `src/core/store/persistence/keyspace.ts`
- Test: `tests/core/keyspace.test.ts`

**Interfaces:**

- Consumes: `RootState`, `StoryState`, `WorldState`, `FoundationState`, `WorldEntity`, `WorldGroup`, `StoryField` from `src/core/store/types`; `initialStoryState`, `initialWorldState`, `initialFoundationState` from the slice modules.
- Produces:
  ```ts
  type PersistIndex = {
    entityIds: string[];
    groupIds: string[];
    fieldIds: string[];
  };
  type PersistRecords = Record<string, unknown>;
  const INDEX_KEY = "index";
  const FOUNDATION_KEY = "foundation";
  const STORY_FLAGS_KEY = "story-flags";
  function entityKey(id: string): string; // `e:${id}`
  function groupKey(id: string): string; // `t:${id}`
  function fieldKey(id: string): string; // `f:${id}`
  function buildIndex(state: RootState): PersistIndex;
  function toRecords(state: RootState): PersistRecords;
  function applyRecords(
    index: PersistIndex | undefined,
    records: PersistRecords,
  ): {
    story: StoryState;
    world: WorldState;
    foundation: FoundationState;
  };
  ```

Everything here is pure — no `api.v1` calls, no promises.

- [ ] **Step 1: Write the failing test**

Create `tests/core/keyspace.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  INDEX_KEY,
  FOUNDATION_KEY,
  STORY_FLAGS_KEY,
  entityKey,
  groupKey,
  fieldKey,
  buildIndex,
  toRecords,
  applyRecords,
} from "../../src/core/store/persistence/keyspace";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import type { RootState, WorldEntity } from "../../src/core/store/types";

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: `${name} summary`,
  };
}

function state(over: Partial<RootState> = {}): RootState {
  return {
    story: {
      ...initialStoryState,
      fields: { dramatisPersonae: { id: "dramatisPersonae", content: "Ada" } },
      attgEnabled: true,
    },
    world: {
      ...initialWorldState,
      entitiesById: { e1: entity("e1", "Ada") },
      entityIds: ["e1"],
      groups: [
        {
          id: "g1",
          title: "The Guild",
          summary: "unsettled",
          entityIds: ["e1"],
        },
      ],
    },
    foundation: { ...initialFoundationState, intent: "a premise" },
    ...over,
  } as RootState;
}

describe("key builders", () => {
  it("prefixes each record kind distinctly", () => {
    // Entity ids and lorebook entry ids are both UUIDs; the prefix is what
    // keeps them apart in one flat keyspace.
    expect(entityKey("x")).toBe("e:x");
    expect(groupKey("x")).toBe("t:x");
    expect(fieldKey("x")).toBe("f:x");
  });
});

describe("buildIndex", () => {
  it("names every record the state carries", () => {
    expect(buildIndex(state())).toEqual({
      entityIds: ["e1"],
      groupIds: ["g1"],
      fieldIds: ["dramatisPersonae"],
    });
  });

  it("has no entities or groups for a pristine store", () => {
    // NOTE: initialStoryState.fields is NOT empty. story.ts seeds it at module
    // load with every non-list FIELD_CONFIG (brainstorm, attg, style), so a
    // pristine store already names those three fields.
    const empty = {
      story: initialStoryState,
      world: initialWorldState,
      foundation: initialFoundationState,
    } as RootState;
    const index = buildIndex(empty);
    expect(index.entityIds).toEqual([]);
    expect(index.groupIds).toEqual([]);
    expect(index.fieldIds).toEqual(Object.keys(initialStoryState.fields));
    expect(index.fieldIds.length).toBeGreaterThan(0);
  });
});

describe("toRecords", () => {
  it("writes one record per entity, group and field, plus the singletons", () => {
    const r = toRecords(state());
    // The fixture replaces story.fields wholesale, so only its one field is
    // present — the seeded skeleton is not merged in by toRecords.
    expect(Object.keys(r).sort()).toEqual(
      [
        INDEX_KEY,
        FOUNDATION_KEY,
        STORY_FLAGS_KEY,
        "e:e1",
        "t:g1",
        "f:dramatisPersonae",
      ].sort(),
    );
    expect(r["e:e1"]).toEqual(entity("e1", "Ada"));
    expect(r[FOUNDATION_KEY]).toEqual({
      ...initialFoundationState,
      intent: "a premise",
    });
    expect(r[STORY_FLAGS_KEY]).toEqual({
      attgEnabled: true,
      styleEnabled: false,
    });
  });
});

describe("applyRecords", () => {
  it("round-trips a full state", () => {
    const s = state();
    const records = toRecords(s);
    const out = applyRecords(records[INDEX_KEY] as never, records);
    expect(out.world.entitiesById).toEqual(s.world.entitiesById);
    expect(out.world.entityIds).toEqual(["e1"]);
    expect(out.world.groups).toEqual(s.world.groups);
    expect(out.story.fields.dramatisPersonae).toEqual(
      s.story.fields.dramatisPersonae,
    );
    expect(out.story.attgEnabled).toBe(true);
    expect(out.foundation.intent).toBe("a premise");
  });

  it("returns pristine state when there is no index at this node", () => {
    const out = applyRecords(undefined, {});
    expect(out.world).toEqual(initialWorldState);
    expect(out.story).toEqual(initialStoryState);
    expect(out.foundation).toEqual(initialFoundationState);
  });

  it("ignores a record the index does not name — this is how deletion works", () => {
    // The stale e:e1 record is still readable (it lives at an ancestor and
    // historyStorage has no way to delete it branch-locally), but the index at
    // this node no longer names it, so the entity is gone.
    const records = toRecords(state());
    const index = { entityIds: [], groupIds: ["g1"], fieldIds: [] };
    const out = applyRecords(index, records);
    expect(out.world.entityIds).toEqual([]);
    expect(out.world.entitiesById).toEqual({});
  });

  it("skips an id the index names but whose record is missing", () => {
    const out = applyRecords(
      { entityIds: ["ghost"], groupIds: [], fieldIds: [] },
      {},
    );
    expect(out.world.entityIds).toEqual([]);
    expect(out.world.entitiesById).toEqual({});
  });

  it("preserves index order for entities", () => {
    const records = {
      "e:a": entity("a", "A"),
      "e:b": entity("b", "B"),
    };
    const out = applyRecords(
      { entityIds: ["b", "a"], groupIds: [], fieldIds: [] },
      records,
    );
    expect(out.world.entityIds).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/keyspace.test.ts`
Expected: FAIL — cannot resolve `../../src/core/store/persistence/keyspace`.

- [ ] **Step 3: Write the implementation**

Create `src/core/store/persistence/keyspace.ts`:

```ts
// State ⇄ records for branch-scoped persistence.
//
// One record per independently-mutating thing, because historyStorage is
// copy-on-write per key per node: a single blob would snapshot the whole World
// onto every node that gets a write.
//
// `index` is authoritative for EXISTENCE. historyStorage.get() falls through to
// the nearest ancestor, so removing `e:<id>` at the current node would not
// delete the entity — it would uncover the parent branch's copy. Deletion is
// therefore an index write, and a record the index does not name is simply
// never read. The orphaned record is harmless; it is unreachable from any
// branch that does not name it.
//
// Pure by construction: no api.v1 calls, no promises, no store access.

import type {
  RootState,
  StoryState,
  WorldState,
  WorldEntity,
  WorldGroup,
  StoryField,
  FoundationState,
} from "../types";
import { initialStoryState } from "../slices/story";
import { initialWorldState } from "../slices/world";
import { initialFoundationState } from "../slices/foundation";

export type PersistIndex = {
  entityIds: string[];
  groupIds: string[];
  fieldIds: string[];
};

export type PersistRecords = Record<string, unknown>;

export const INDEX_KEY = "index";
export const FOUNDATION_KEY = "foundation";
export const STORY_FLAGS_KEY = "story-flags";

// Entity ids, group ids and field ids share one flat keyspace, and the first
// two are UUIDs — the prefix is what keeps them apart.
export const entityKey = (id: string): string => `e:${id}`;
export const groupKey = (id: string): string => `t:${id}`;
export const fieldKey = (id: string): string => `f:${id}`;

export function buildIndex(state: RootState): PersistIndex {
  return {
    entityIds: [...state.world.entityIds],
    groupIds: state.world.groups.map((g) => g.id),
    fieldIds: Object.keys(state.story.fields),
  };
}

export function toRecords(state: RootState): PersistRecords {
  const records: PersistRecords = {
    [INDEX_KEY]: buildIndex(state),
    [FOUNDATION_KEY]: state.foundation,
    [STORY_FLAGS_KEY]: {
      attgEnabled: state.story.attgEnabled,
      styleEnabled: state.story.styleEnabled,
    },
  };
  for (const id of state.world.entityIds) {
    const entity = state.world.entitiesById[id];
    if (entity) records[entityKey(id)] = entity;
  }
  for (const group of state.world.groups) {
    records[groupKey(group.id)] = group;
  }
  for (const [id, field] of Object.entries(state.story.fields)) {
    records[fieldKey(id)] = field;
  }
  return records;
}

export function applyRecords(
  index: PersistIndex | undefined,
  records: PersistRecords,
): { story: StoryState; world: WorldState; foundation: FoundationState } {
  if (!index) {
    return {
      story: initialStoryState,
      world: initialWorldState,
      foundation: initialFoundationState,
    };
  }

  const entitiesById: Record<string, WorldEntity> = {};
  const entityIds: string[] = [];
  for (const id of index.entityIds) {
    const record = records[entityKey(id)] as WorldEntity | undefined;
    // An id the index names but whose record never landed: skip it rather than
    // seed a hole the UI would have to defend against.
    if (!record) continue;
    entitiesById[id] = record;
    entityIds.push(id);
  }

  const groups: WorldGroup[] = [];
  for (const id of index.groupIds) {
    const record = records[groupKey(id)] as WorldGroup | undefined;
    if (record) groups.push(record);
  }

  const fields: Record<string, StoryField> = {};
  for (const id of index.fieldIds) {
    const record = records[fieldKey(id)] as StoryField | undefined;
    if (record) fields[id] = record;
  }

  const flags = (records[STORY_FLAGS_KEY] ?? {}) as Partial<StoryState>;
  const foundation = records[FOUNDATION_KEY] as FoundationState | undefined;

  return {
    story: {
      ...initialStoryState,
      // Merge over the seeded skeleton rather than replacing it. story.ts fills
      // initialStoryState.fields at module load with every non-list field
      // (brainstorm, attg, style); a record missing for one of those must not
      // leave `story.fields.attg` undefined for the UI to trip over.
      fields: { ...initialStoryState.fields, ...fields },
      attgEnabled: flags.attgEnabled ?? initialStoryState.attgEnabled,
      styleEnabled: flags.styleEnabled ?? initialStoryState.styleEnabled,
    },
    world: { ...initialWorldState, entitiesById, entityIds, groups },
    foundation: foundation
      ? { ...initialFoundationState, ...foundation }
      : initialFoundationState,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/core/keyspace.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck, full suite, format**

Run: `npx tsc --noEmit && npm test && npm run format`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/core/store/persistence/keyspace.ts tests/core/keyspace.test.ts
git commit -m "feat(persistence): add the branch-scoped keyspace"
```

---

### Task 3: The history store adapter

**Files:**

- Create: `src/core/store/persistence/history-store.ts`
- Test: `tests/core/history-store.test.ts`

**Interfaces:**

- Consumes: `INDEX_KEY`, `PersistIndex`, `PersistRecords`, `toRecords`, `applyRecords`, `entityKey`, `groupKey`, `fieldKey`, `FOUNDATION_KEY`, `STORY_FLAGS_KEY` from Task 2.
- Produces:
  ```ts
  function captureNode(): Promise<number>;
  function saveRecords(records: PersistRecords, nodeId: number): Promise<void>;
  function loadBranchState(nodeId?: number): Promise<{
    story: StoryState;
    world: WorldState;
    foundation: FoundationState;
  }>;
  ```

`loadBranchState` reads the index, then fans out to exactly the record keys the
index names — it never calls `list()`, so it does not care whether `list()`
inherits.

- [ ] **Step 1: Write the failing test**

Create `tests/core/history-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { installHistoryFake, type HistoryFake } from "../helpers/history-fake";
import {
  captureNode,
  saveRecords,
  loadBranchState,
} from "../../src/core/store/persistence/history-store";
import { toRecords } from "../../src/core/store/persistence/keyspace";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import type { RootState, WorldEntity } from "../../src/core/store/types";

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: "",
  };
}

function stateWith(ids: string[]): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const id of ids) entitiesById[id] = entity(id, id.toUpperCase());
  return {
    story: initialStoryState,
    world: { ...initialWorldState, entitiesById, entityIds: ids },
    foundation: initialFoundationState,
  } as RootState;
}

describe("history-store", () => {
  let h: HistoryFake;
  beforeEach(() => {
    h = installHistoryFake();
  });

  it("loads back what it saved at the same node", async () => {
    const node = await captureNode();
    await saveRecords(toRecords(stateWith(["a"])), node);
    const out = await loadBranchState();
    expect(out.world.entityIds).toEqual(["a"]);
  });

  it("returns pristine state at a node that has never been written", async () => {
    const out = await loadBranchState();
    expect(out.world).toEqual(initialWorldState);
    expect(out.foundation).toEqual(initialFoundationState);
  });

  it("inherits a parent's records at a child node", async () => {
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());
    h.push();
    const out = await loadBranchState();
    expect(out.world.entityIds).toEqual(["a"]);
  });

  it("drops an entity created on a branch once you navigate away", async () => {
    const root = h.current();
    await saveRecords(toRecords(stateWith(["a"])), root);
    h.push();
    await saveRecords(toRecords(stateWith(["a", "b"])), await captureNode());
    expect((await loadBranchState()).world.entityIds).toEqual(["a", "b"]);

    h.goto(root);
    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
  });

  it("deletes branch-locally through the index, leaving the ancestor intact", async () => {
    const root = h.current();
    await saveRecords(toRecords(stateWith(["a", "b"])), root);
    h.push();
    // "Delete" b: write an index without it. The e:b record still exists at the
    // ancestor and is deliberately not removed.
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());

    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
    h.goto(root);
    expect((await loadBranchState()).world.entityIds).toEqual(["a", "b"]);
  });

  it("writes to the node it is given, not to wherever the cursor has moved", async () => {
    // The whole point of capturing at dispatch: the cursor can move between
    // capture and flush, and the write must still land where the state was.
    const node = await captureNode();
    h.push();
    await saveRecords(toRecords(stateWith(["a"])), node);

    expect((await loadBranchState()).world.entityIds).toEqual(["a"]); // inherited
    h.goto(node);
    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
  });

  it("never calls list() — the index is the enumeration", async () => {
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());
    await loadBranchState();
    expect(api.v1.historyStorage.list).not.toHaveBeenCalled();
  });

  it("never removes a record key", async () => {
    await saveRecords(toRecords(stateWith(["a", "b"])), await captureNode());
    await saveRecords(toRecords(stateWith(["a"])), await captureNode());
    expect(api.v1.historyStorage.remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/history-store.test.ts`
Expected: FAIL — cannot resolve `history-store`.

- [ ] **Step 3: Write the implementation**

Create `src/core/store/persistence/history-store.ts`:

```ts
// Async adapter over api.v1.historyStorage.
//
// Two rules live here, both measured rather than assumed (design §12.1, §6.3):
//
//   1. Every write passes its node EXPLICITLY. Reading currentNodeId() and then
//      calling set() without a node has been observed landing the value two
//      nodes away from the id just read; a debounced flush is far worse. Callers
//      capture the node when the action is dispatched and hand it back here.
//   2. Loading fans out from the index rather than calling list(). list() does
//      inherit ancestor keys, but the index is authoritative for existence
//      anyway, so enumerating through it is both correct and independent of
//      list()'s semantics.
//
// Nothing here removes a record key — see keyspace.ts for why deletion is an
// index write.

import type { StoryState, WorldState, FoundationState } from "../types";
import {
  INDEX_KEY,
  FOUNDATION_KEY,
  STORY_FLAGS_KEY,
  entityKey,
  groupKey,
  fieldKey,
  applyRecords,
  type PersistIndex,
  type PersistRecords,
} from "./keyspace";

/** The node to stamp a write with. Call this when the action is dispatched. */
export function captureNode(): Promise<number> {
  return api.v1.document.history.currentNodeId();
}

export async function saveRecords(
  records: PersistRecords,
  nodeId: number,
): Promise<void> {
  await Promise.all(
    Object.entries(records).map(([key, value]) =>
      api.v1.historyStorage.set(key, value, nodeId),
    ),
  );
}

export async function loadBranchState(nodeId?: number): Promise<{
  story: StoryState;
  world: WorldState;
  foundation: FoundationState;
}> {
  const node = nodeId ?? (await captureNode());
  const index = (await api.v1.historyStorage.get(INDEX_KEY, node)) as
    PersistIndex | undefined;

  if (!index) return applyRecords(undefined, {});

  const keys = [
    FOUNDATION_KEY,
    STORY_FLAGS_KEY,
    ...index.entityIds.map(entityKey),
    ...index.groupIds.map(groupKey),
    ...index.fieldIds.map(fieldKey),
  ];

  const values = await Promise.all(
    keys.map((key) => api.v1.historyStorage.get(key, node)),
  );

  const records: PersistRecords = {};
  keys.forEach((key, i) => {
    if (values[i] !== undefined) records[key] = values[i];
  });

  return applyRecords(index, records);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/core/history-store.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck, full suite, format**

Run: `npx tsc --noEmit && npm test && npm run format`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/core/store/persistence/history-store.ts tests/core/history-store.test.ts
git commit -m "feat(persistence): add the historyStorage adapter"
```

---

### Task 4: Rewrite autosave

**Files:**

- Modify: `src/core/store/effects/autosave.ts` (whole file)
- Modify: `src/core/keys.ts`
- Test: `tests/core/autosave.test.ts`

**Interfaces:**

- Consumes: `toRecords` (Task 2); `captureNode`, `saveRecords` (Task 3).
- Produces: `registerAutosaveEffects(subscribeEffect, getState)` — same signature as today, so `src/core/store/register-effects.ts` needs no change.

Chat moves to its own `storyStorage` key. In `src/core/keys.ts`, **add** the new
entry alongside the existing `PERSIST` one — do not remove `PERSIST` yet, because
`mount.ts` still reads it and Task 5 is what rewires that. Every task must leave
the tree typechecking.

```ts
  // Chat sessions — storyStorage, not historyStorage: brainstorms follow the
  // writer, not the branch (design §6.1).
  CHAT: "kse-chat",
```

- [ ] **Step 1: Write the failing test**

Create `tests/core/autosave.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installHistoryFake } from "../helpers/history-fake";
import { registerAutosaveEffects } from "../../src/core/store/effects/autosave";
import { loadBranchState } from "../../src/core/store/persistence/history-store";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import { initialUIState } from "../../src/core/store/slices/ui";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import type { RootState, WorldEntity } from "../../src/core/store/types";
import type { Action } from "nai-store";

function entity(id: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name: id,
    summary: "",
  };
}

/** Minimal stand-in for the store's subscribeEffect: captures the predicate and
 *  handler so the test can fire actions synchronously. */
function harness(state: RootState) {
  const handlers: Array<{
    match: (a: Action) => boolean;
    run: (a: Action) => void;
  }> = [];
  const subscribeEffect = ((match: never, run: never) => {
    handlers.push({ match, run });
    return () => {};
  }) as never;
  const fire = (type: string) => {
    const action = { type } as Action;
    for (const h of handlers) if (h.match(action)) h.run(action);
  };
  registerAutosaveEffects(subscribeEffect, () => state);
  return { fire };
}

function baseState(entityIds: string[] = []): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const id of entityIds) entitiesById[id] = entity(id);
  return {
    story: initialStoryState,
    world: { ...initialWorldState, entitiesById, entityIds },
    foundation: initialFoundationState,
    ui: initialUIState,
    runtime: initialRuntimeState,
    chat: { chats: [], activeChatId: null },
  } as RootState;
}

describe("autosave", () => {
  beforeEach(() => {
    installHistoryFake();
    vi.useFakeTimers();
  });

  it("writes branch-scoped records after the debounce", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("world/entityForged");
    await vi.runAllTimersAsync();
    expect((await loadBranchState()).world.entityIds).toEqual(["a"]);
  });

  it("does not write before the debounce elapses", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("world/entityForged");
    expect(api.v1.historyStorage.set).not.toHaveBeenCalled();
  });

  it("writes chat to storyStorage, never to historyStorage", async () => {
    const { fire } = harness(baseState());
    fire("chat/messageAdded");
    await vi.runAllTimersAsync();
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      "kse-chat",
      expect.anything(),
    );
  });

  it("ignores actions from slices it does not persist", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("ui/uiEditableActivate");
    fire("runtime/requestQueued");
    await vi.runAllTimersAsync();
    expect(api.v1.historyStorage.set).not.toHaveBeenCalled();
  });

  it("never removes a record key", async () => {
    const { fire } = harness(baseState(["a"]));
    fire("world/entityDeleted");
    await vi.runAllTimersAsync();
    expect(api.v1.historyStorage.remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/autosave.test.ts`
Expected: FAIL — the current autosave writes one `kse-persist` blob to
`storyStorage`, so `loadBranchState()` finds no index.

- [ ] **Step 3: Rewrite autosave**

Replace `src/core/store/effects/autosave.ts` entirely:

```ts
import { Store } from "nai-store";
import { RootState } from "../types";
import { STORAGE_KEYS } from "../../keys";
import { toRecords } from "../persistence/keyspace";
import { captureNode, saveRecords } from "../persistence/history-store";

const AUTOSAVE_DELAY_MS = 2000;

/** Slices whose actions mean "persist something". `ui` and `runtime` are
 *  ephemeral; `forge` has never been written and stays in memory. */
const BRANCH_PREFIXES = ["story/", "world/", "foundation/"];
const CHAT_PREFIX = "chat/";

export function registerAutosaveEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
): void {
  // Cancellation-flag debounce: avoids storing the async timer ID.
  let _cancel: (() => void) | null = null;
  // Captured when the action is dispatched, NOT when the flush runs. Ordinary
  // writing creates history nodes continuously and onHistoryNavigated does not
  // fire for them, so a 2s debounce can easily land after the cursor has moved
  // — writing this state onto a node it does not describe. See design §6.3.
  let pendingNode: Promise<number> | null = null;

  subscribeEffect(
    (action) =>
      BRANCH_PREFIXES.some((p) => action.type.startsWith(p)) ||
      action.type.startsWith(CHAT_PREFIX),
    (action) => {
      const branchScoped = BRANCH_PREFIXES.some((p) =>
        action.type.startsWith(p),
      );
      if (branchScoped && pendingNode === null) pendingNode = captureNode();

      if (_cancel !== null) _cancel();
      let cancelled = false;
      _cancel = () => {
        cancelled = true;
      };

      void api.v1.timers.setTimeout(async () => {
        if (cancelled) return;
        _cancel = null;
        const node = pendingNode;
        pendingNode = null;
        try {
          const state = getState();
          // Chat follows the writer, not the branch.
          await api.v1.storyStorage.set(STORAGE_KEYS.CHAT, state.chat);
          if (node !== null) {
            await saveRecords(toRecords(state), await node);
          }
        } catch (e) {
          /* ignore */
        }
      }, AUTOSAVE_DELAY_MS);
    },
  );
}
```

- [ ] **Step 4: Add the key constant**

In `src/core/keys.ts`, add this entry to `STORAGE_KEYS`, directly beneath the
existing `PERSIST` line. Leave `PERSIST` in place — `mount.ts` still reads it
until Task 5:

```ts
  // Chat sessions — storyStorage, not historyStorage: brainstorms follow the
  // writer, not the branch (design §6.1). The World, Foundation and story
  // fields live in historyStorage under the keyspace in
  // src/core/store/persistence/keyspace.ts.
  CHAT: "kse-chat",
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/core/autosave.test.ts && npx tsc --noEmit && npm test`
Expected: the new file's 5 tests pass, tsc is clean, and the full suite is green.
The old `kse-persist` blob is no longer written, but `mount.ts` still reads it
and simply finds nothing — harmless, and Task 5 removes the read.

- [ ] **Step 6: Commit**

```bash
git add src/core/store/effects/autosave.ts src/core/keys.ts tests/core/autosave.test.ts
git commit -m "feat(persistence): shard autosave into branch-scoped records"
```

---

### Task 5: Load path, and delete the migrations

**Files:**

- Modify: `src/ui/mount.ts`
- Modify: `src/core/store/index.ts`
- Delete: `src/core/store/migrations/brainstorm-to-chat.ts` (and its test if one exists)

**Interfaces:**

- Consumes: `loadBranchState` (Task 3), `STORAGE_KEYS.CHAT` (Task 4).
- Produces: `PersistedData` narrowed to `{ story?; chat?; world?; foundation? }`.

- [ ] **Step 1: Retire the PERSIST key**

In `src/core/keys.ts`, delete the now-unused entry:

```ts
  // Core persistence blob.
  PERSIST: "kse-persist",
```

`noUnusedLocals` does not catch an unused object property, so this one is on
you: after Step 3 nothing reads it.

- [ ] **Step 2: Narrow PersistedData and delete the world migration**

In `src/core/store/index.ts`:

1. Remove `forge` from the `PersistedData` interface and from the
   `PERSISTED_DATA_LOADED` branch of `rootReducer`. It has never been written by
   autosave, so the branch has always been dead.
2. Delete `migrateWorldState` and `backfillLifecycle` entirely, along with the
   `WorldEntity` import if it becomes unused. Replace the `world:` line in the
   reducer with a plain replace:

```ts
      world: data.world ?? current.world,
```

3. Delete the `forgeSlice`/`initialForgeState` imports only if they become
   unused — `forgeSlice.reducer` is still needed by `combineReducers`, so
   `initialForgeState` and the `ForgeSliceState` type import are the ones to
   check.

- [ ] **Step 3: Delete the brainstorm migration**

```bash
git rm src/core/store/migrations/brainstorm-to-chat.ts
ls tests | grep -i brainstorm   # delete any test for it too, with git rm
rmdir src/core/store/migrations 2>/dev/null || true
```

- [ ] **Step 4: Rewire the load in mount.ts**

In `src/ui/mount.ts`, replace this block:

```ts
const persisted = await api.v1.storyStorage.get(STORAGE_KEYS.PERSIST);
const migrated = migrateBrainstormToChat(persisted ?? {});
if (migrated.touched) {
  await api.v1.storyStorage.set(STORAGE_KEYS.PERSIST, migrated.data);
  api.v1.ui.toast("Brainstorm chats migrated to new chat system.", {
    type: "info",
  });
}
if (persisted) store.dispatch(persistedDataLoaded(migrated.data));
```

with:

```ts
// Branch-scoped state comes from historyStorage at the current node; chat
// follows the writer and stays in storyStorage. No migration path: Story
// Engine is alpha and upgrading drops Engine state — previously managed
// lorebook entries simply become unmanaged, and the Import wizard's Bind is
// the way back.
const [branch, chat] = await Promise.all([
  loadBranchState(),
  api.v1.storyStorage.get(STORAGE_KEYS.CHAT),
]);
store.dispatch(
  persistedDataLoaded({
    story: branch.story,
    world: branch.world,
    foundation: branch.foundation,
    ...(chat ? { chat } : {}),
  }),
);
```

Then fix the imports at the top of the file: remove
`import { migrateBrainstormToChat } from "../core/store/migrations/brainstorm-to-chat";`
and add
`import { loadBranchState } from "../core/store/persistence/history-store";`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. Any error naming `PERSIST`, `migrateWorldState`, or
`migrateBrainstormToChat` is a leftover from steps 1–4.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: green. If a test imports `migrateWorldState` or the brainstorm
migration, delete that test — the code it covered is gone by design, not by
accident.

- [ ] **Step 7: Build and format**

Run: `npm run build && npm run format`
Then: `git checkout -- external/ project.yaml`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(persistence): load branch state from historyStorage

Drops the kse-persist blob and both migrations with it. Story Engine is alpha
and upgrading drops Engine state by design: previously managed lorebook entries
become unmanaged rather than damaged, and the Import wizard's Bind is the path
back."
```

---

### Task 6: Rehydrate on history navigation

**Files:**

- Create: `src/core/store/effects/history-sync.ts`
- Modify: `src/core/store/effects/bootstrap-effects.ts`
- Modify: `src/core/store/register-effects.ts`
- Test: `tests/core/history-sync.test.ts`

**Interfaces:**

- Consumes: `loadBranchState` (Task 3); `persistedDataLoaded` from `src/core/store`; `documentHistoryNavigated` from `src/core/store/slices/runtime`.
- Produces: `registerHistorySyncEffects(dispatch: AppDispatch): void`.

**`api.v1.hooks.register` holds one callback per hook name.** `bootstrap-effects.ts`
currently registers `onHistoryNavigated` to bump `historyEpoch`. That
registration MOVES here — registering in both places means one silently replaces
the other.

- [ ] **Step 1: Write the failing test**

Create `tests/core/history-sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installHistoryFake, type HistoryFake } from "../helpers/history-fake";
import { registerHistorySyncEffects } from "../../src/core/store/effects/history-sync";
import { saveRecords } from "../../src/core/store/persistence/history-store";
import { toRecords } from "../../src/core/store/persistence/keyspace";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import type { RootState, WorldEntity } from "../../src/core/store/types";
import type { Action } from "nai-store";

function stateWith(ids: string[]): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const id of ids) {
    entitiesById[id] = {
      id,
      categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
      lifecycle: "live",
      name: id,
      summary: "",
    };
  }
  return {
    story: initialStoryState,
    world: { ...initialWorldState, entitiesById, entityIds: ids },
    foundation: initialFoundationState,
  } as RootState;
}

/** Grab the single onHistoryNavigated callback the effect registered. */
function registeredHook(): (params: { nodeId: number }) => Promise<void> {
  const calls = (
    api.v1.hooks.register as unknown as { mock: { calls: unknown[][] } }
  ).mock.calls;
  const entry = calls.filter((c) => c[0] === "onHistoryNavigated").pop();
  return entry?.[1] as (params: { nodeId: number }) => Promise<void>;
}

describe("history-sync", () => {
  let h: HistoryFake;
  let dispatched: Action[];

  beforeEach(() => {
    h = installHistoryFake();
    dispatched = [];
    vi.mocked(api.v1.hooks.register).mockClear();
  });

  it("registers exactly one onHistoryNavigated callback", () => {
    registerHistorySyncEffects((a: Action) => dispatched.push(a));
    const calls = vi
      .mocked(api.v1.hooks.register)
      .mock.calls.filter((c) => c[0] === "onHistoryNavigated");
    expect(calls).toHaveLength(1);
  });

  it("bumps the history epoch on navigation", async () => {
    registerHistorySyncEffects((a: Action) => dispatched.push(a));
    await registeredHook()({ nodeId: h.current() });
    expect(dispatched.map((a) => a.type)).toContain(
      "runtime/documentHistoryNavigated",
    );
  });

  it("replaces World state with the branch it navigated to", async () => {
    const root = h.current();
    await saveRecords(toRecords(stateWith(["a"])), root);
    const child = h.push();
    await saveRecords(toRecords(stateWith(["a", "b"])), child);

    registerHistorySyncEffects((a: Action) => dispatched.push(a));

    h.goto(root);
    await registeredHook()({ nodeId: root });

    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: { world: { entityIds: string[] } } } | undefined;
    expect(loaded?.payload.world.entityIds).toEqual(["a"]);
  });

  it("clears the World entirely when navigating to a node with no index", async () => {
    const root = h.current();
    h.push();
    await saveRecords(toRecords(stateWith(["a"])), h.current());

    registerHistorySyncEffects((a: Action) => dispatched.push(a));

    h.goto(root);
    await registeredHook()({ nodeId: root });

    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: { world: { entityIds: string[] } } } | undefined;
    expect(loaded?.payload.world.entityIds).toEqual([]);
  });

  it("does not touch chat — it follows the writer, not the branch", async () => {
    registerHistorySyncEffects((a: Action) => dispatched.push(a));
    await registeredHook()({ nodeId: h.current() });
    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: Record<string, unknown> } | undefined;
    expect(loaded?.payload).not.toHaveProperty("chat");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/history-sync.test.ts`
Expected: FAIL — cannot resolve `history-sync`.

- [ ] **Step 3: Write the implementation**

Create `src/core/store/effects/history-sync.ts`:

```ts
// The single onHistoryNavigated registration.
//
// api.v1.hooks.register holds ONE callback per hook name, so this is the only
// place in the codebase that may register this hook — bootstrap-effects.ts used
// to, for historyEpoch, and that job moved here rather than competing for the
// slot.
//
// The hook fires only on explicit navigation (undo/redo/retry/jump), never for
// nodes created by ordinary editing or generation, so this is a
// branch-exploration signal rather than something that runs while writing.
//
// nodeId arrives as a number despite the .d.ts declaring string — corrected in
// src/type-overrides.d.ts, measured in design §12.1.

import type { AppDispatch } from "../types";
import { persistedDataLoaded } from "../index";
import { documentHistoryNavigated } from "../slices/runtime";
import { loadBranchState } from "../persistence/history-store";

export function registerHistorySyncEffects(dispatch: AppDispatch): void {
  api.v1.hooks.register("onHistoryNavigated", async ({ nodeId }) => {
    // Re-derive anything keyed off document content (the opening-scene card).
    dispatch(documentHistoryNavigated());

    // Replace, never merge: an entity created on the branch we just left must
    // disappear, and applyRecords always returns a complete world — empty when
    // the target node carries no index — so the reducer's replace is total.
    const branch = await loadBranchState(nodeId);
    dispatch(
      persistedDataLoaded({
        story: branch.story,
        world: branch.world,
        foundation: branch.foundation,
      }),
    );
  });
}
```

- [ ] **Step 4: Remove the competing registration**

In `src/core/store/effects/bootstrap-effects.ts`, delete this block and its
comment:

```ts
api.v1.hooks.register("onHistoryNavigated", () => {
  dispatch(documentHistoryNavigated());
});
```

Then remove the `documentHistoryNavigated` import if nothing else in that file
uses it. `noUnusedLocals` will tell you.

- [ ] **Step 5: Register the new effects**

In `src/core/store/register-effects.ts` — NOT `effects/index.ts` — import
`registerHistorySyncEffects` and add it to the list inside `registerEffects`,
which already destructures `dispatch` off the store:

```ts
registerBootstrapEffects(subscribeEffect, dispatch, getState);
registerHistorySyncEffects(dispatch);
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/core/history-sync.test.ts && npm test`
Expected: the new file's 5 tests pass and the full suite is green.

- [ ] **Step 7: Guard the single-registration rule**

Append to `tests/core/history-sync.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

describe("onHistoryNavigated has exactly one home", () => {
  const SRC = join(__dirname, "../../src");

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
    });
  }

  it("is registered in history-sync.ts and nowhere else", () => {
    // api.v1.hooks.register holds one callback per hook name — a second
    // registration silently replaces the first.
    const offenders = files(SRC).filter(
      (f) =>
        readFileSync(f, "utf8").includes('register("onHistoryNavigated"') &&
        !f.endsWith("history-sync.ts"),
    );
    expect(offenders).toEqual([]);
  });
});
```

Run: `npx vitest run tests/core/history-sync.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Build, format, commit**

```bash
npm run build && npm run format
git checkout -- external/ project.yaml
git add -A
git commit -m "feat(persistence): rehydrate branch state on history navigation

Undo and redo now move the World, Foundation and story fields with the story.
The onHistoryNavigated registration moves out of bootstrap-effects: the hooks
API holds one callback per hook name, so two registrations meant one silently
replacing the other. A source guard keeps it that way."
```

---

### Task 7: Changelog

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the bullet**

Under the existing `## [0.15.0] - 2026-08-12` heading's `### Changed` list, append:

```markdown
- **Undo and redo now move the World with the story.** Everything Story Engine derives from your prose — the World, the Foundation, and the story fields — is stored against the point in history it belongs to. Undo past the scene where a character was created and that character goes with it; redo and it comes back. Explore two continuations from the same point and each keeps its own World. Your brainstorms are deliberately exempt: they follow you rather than the branch, so undoing a paragraph never hides the conversation that led to it.
```

- [ ] **Step 2: Note the upgrade cost under Removed**

The `## [0.15.0]` section already has a `### Removed` heading from the Continue
Scene work. Append to that list:

```markdown
- **Story Engine's saved state does not carry over from 0.14.x.** The storage layout changed so that undo can move the World, and Story Engine is still alpha, so there is no migration. Your lorebook, Memory and Author's Note are untouched — only Story Engine's own record of which entries it manages resets. The Import Wizard picks them back up.
```

- [ ] **Step 3: Verify and commit**

Run: `npm run format && npx prettier --check .`
Expected: "All matched files use Prettier code style!"

Do **not** bump `project.yaml` — it is already at `0.15.0` for this branch.

```bash
git add CHANGELOG.md
git commit -m "docs: note branch-scoped state and the 0.14.x reset"
```

---

## Verification

After Task 7, from a clean state:

```bash
npm ci && npm test && npx tsc --noEmit && npm run build && npx prettier --check .
```

Then load the build into a **scratch story** and check the behaviour that no
unit test can reach:

1. Create an entity in the World. Generate a paragraph. Undo the generation.
   The entity should still be there — the undo crossed a node the entity's
   record was inherited through, not the one it was written at.
2. Create an entity, then undo past the point where you created it. It should
   disappear from the World panel. Redo — it comes back.
3. Delete an entity, then undo past the deletion. It should return.
4. Fill a Foundation field, undo past it, and confirm the field empties; redo
   and confirm it refills.
5. Start a brainstorm, then undo several paragraphs. **The brainstorm must
   survive** — chat is deliberately story-scoped.
6. Reload the story. World, Foundation and chat all come back.

## Out of scope for this phase

- **The Engine loop itself** — trigger, triage, actions (phases 3–6). This phase
  builds the storage they write through and nothing more.
- **`lb:<entryId>` write-records, the observation `watermark`, and the intent
  `queue`** (§6.2). Those keys belong to the loop; adding them now would be
  speculative.
- **Renaming `WorldGroup` to `Thread`** (phase 5). The `t:` key prefix is chosen
  now so that rename needs no key change.
- **Branch-scoping `forge`.** It has never been persisted at all; this phase
  keeps it in memory rather than quietly changing its lifetime.
