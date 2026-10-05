# JSX Import Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the SUI Import wizard to JSX — a full-view takeover of the Story Engine tab (opened from a header Import button) that imports Memory→ATTG / A/N→Style, generates Shape+Intent, and binds unmanaged lorebook entries to Story Engine entities.

**Architecture:** Pure JSX presentation over existing actions/APIs. A data hook loads memory/A-N/lorebook; the unmanaged-entries list is reactive (a primitive `useSlice` on the managed-id set recomputes it when a Bind changes `world.entitiesById`). No imperative rebuild.

**Tech Stack:** TypeScript (strict), Preact/JSX (NAI runtime globals `h`/`Fragment`/`useState`/`useEffect`/`useRef` — no import), nai-store, vitest. QuickJS (no DOM, no setTimeout, no console.log).

## Global Constraints

- No backend/state/prompt changes; no `project.yaml` version bump. The build stamps `updatedAt` — revert it (`git checkout project.yaml`) before committing.
- `useSlice` selectors return primitives only (string/number/boolean) — the managed set is read as a joined-sorted string, never a Set/array.
- Hooks unconditional and before any early `return`.
- Feather icons take only `size` — no color prop.
- Async loads are cancelled-guarded (mirror other JSX async effects).
- DULFS category is a local wizard concern (`dulfsMap`), seeded by `detectCategory`, committed to the store only at Bind time as the entity `categoryId`.
- The startup auto-trigger is OUT OF SCOPE (deferred).
- Verify live on the **Story Engine (JSX)** tab only (icon-only S.E.G.A.; the legacy SUI panel shows the text "S.E.G.A.").

Exact action/API signatures (verbatim):
- `attgUpdated({ attg })`, `attgSyncSet({ enabled })`, `styleUpdated({ style })`, `styleSyncSet({ enabled })`, `shapeGenerationRequested()`, `intentGenerationRequested()` (foundation slice, `core/store` barrel).
- `entityBound({ entity })`, `entitiesBoundBatch(entities)` (world slice, barrel). `entitiesBoundBatch` takes an array (not an object).
- `detectCategory(text): DulfsFieldID`, `cycleDulfsCategory(current): DulfsFieldID` (`core/utils/category-detect`).
- `api.v1.memory.get()/set(s)`, `api.v1.an.get()`, `api.v1.lorebook.entries(): Promise<LorebookEntry[]>`, `api.v1.lorebook.categories(): Promise<LorebookCategory[]>`, `api.v1.ui.toast(msg, { type })`, `api.v1.uuid()`.
- `LorebookEntry { id: string; displayName?: string; category?: string; text?: string }`; `LorebookCategory { id: string; name?: string }`.
- `WorldEntity { id, categoryId, lorebookEntryId?, name, summary, lifecycle }`.

---

### Task 1: `import-data.ts` — helpers + loader hook

Pure grouping/filtering helpers (unit-tested) + the async data hook.

**Files:**
- Create: `src/ui-jsx/panels/import/import-data.ts`
- Test: `tests/ui-jsx/import-data.test.ts`

**Interfaces:**
- Produces: `DULFS_SHORT`; `unmanagedEntries(entries, managedIds): LorebookEntry[]`; `groupAndSortEntries(entries, categoryNames): { key; label; entries }[]`; `useImportData(): { memText; anText; entries; categoryNames; loading; refresh }`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui-jsx/import-data.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  unmanagedEntries,
  groupAndSortEntries,
} from "../../src/ui-jsx/panels/import/import-data";
import type { LorebookEntry } from "../../src/ui-jsx/panels/import/import-data";

const e = (id: string, over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id,
  displayName: id,
  ...over,
});

describe("unmanagedEntries", () => {
  it("drops entries whose id is in the managed set, keeps the rest", () => {
    const entries = [e("a"), e("b"), e("c")];
    const managed = new Set(["b"]);
    expect(unmanagedEntries(entries, managed).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("returns all when nothing is managed", () => {
    const entries = [e("a"), e("b")];
    expect(unmanagedEntries(entries, new Set()).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("groupAndSortEntries", () => {
  it("groups by category, names alphabetical, uncategorized last", () => {
    const entries = [
      e("1", { category: "cat-z" }),
      e("2", { category: "cat-a" }),
      e("3", {}), // no category → uncategorized
      e("4", { category: "cat-a" }),
    ];
    const names = new Map([
      ["cat-z", "Zeta"],
      ["cat-a", "Alpha"],
    ]);
    const groups = groupAndSortEntries(entries, names);
    expect(groups.map((g) => g.label)).toEqual(["Alpha", "Zeta", "Uncategorized"]);
    expect(groups[0].entries.map((x) => x.id)).toEqual(["2", "4"]);
    expect(groups[2].entries.map((x) => x.id)).toEqual(["3"]);
  });

  it("falls back to the category key when no display name is known", () => {
    const groups = groupAndSortEntries([e("1", { category: "raw-key" })], new Map());
    expect(groups[0].label).toBe("raw-key");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (helpers not found)

Run: `npx vitest run tests/ui-jsx/import-data.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `import-data.ts`**

Create `src/ui-jsx/panels/import/import-data.ts`:
```ts
// Data layer for the JSX Import wizard: pure grouping/filtering helpers (unit-
// tested) + a loader hook that reads memory, A/N, and the lorebook. NAI runtime
// globals (useState/useEffect) are available in .ts files (see hooks.ts).

import { FieldID, type DulfsFieldID } from "../../../config/field-definitions";

export type LorebookEntry = {
  id: string;
  displayName?: string;
  category?: string;
  text?: string;
};

export const DULFS_SHORT: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Char",
  [FieldID.UniverseSystems]: "Sys",
  [FieldID.Locations]: "Loc",
  [FieldID.Factions]: "Fac",
  [FieldID.SituationalDynamics]: "Dyn",
  [FieldID.Topics]: "Topic",
};

/** Lorebook entries not bound to any Story Engine entity. */
export function unmanagedEntries(
  entries: LorebookEntry[],
  managedIds: Set<string>,
): LorebookEntry[] {
  return entries.filter((e) => !managedIds.has(e.id));
}

/** Group entries by lorebook category — named categories alphabetical by display
 *  name, "uncategorized" (missing category) last. Label falls back to the key. */
export function groupAndSortEntries(
  entries: LorebookEntry[],
  categoryNames: Map<string, string>,
): { key: string; label: string; entries: LorebookEntry[] }[] {
  const groups = new Map<string, LorebookEntry[]>();
  for (const entry of entries) {
    const key = entry.category ?? "uncategorized";
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "uncategorized") return 1;
    if (b === "uncategorized") return -1;
    return (categoryNames.get(a) ?? a).localeCompare(categoryNames.get(b) ?? b);
  });
  return keys.map((key) => ({
    key,
    label:
      key === "uncategorized"
        ? "Uncategorized"
        : (categoryNames.get(key) ?? key),
    entries: groups.get(key)!,
  }));
}

/** Loads memory / A-N / lorebook entries + categories on mount; `refresh`
 *  reloads the lorebook. All async reads are cancelled-guarded. */
export function useImportData(): {
  memText: string;
  anText: string;
  entries: LorebookEntry[];
  categoryNames: Map<string, string>;
  loading: boolean;
  refresh: () => void;
} {
  const [memText, setMemText] = useState("");
  const [anText, setAnText] = useState("");
  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [mem, an, es, cats] = await Promise.all([
        api.v1.memory.get(),
        api.v1.an.get(),
        api.v1.lorebook.entries(),
        api.v1.lorebook.categories(),
      ]);
      if (cancelled) return;
      setMemText(mem ?? "");
      setAnText(an ?? "");
      setEntries(es as LorebookEntry[]);
      setCategoryNames(new Map(cats.map((c) => [c.id, c.name ?? c.id])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [epoch]);

  return {
    memText,
    anText,
    entries,
    categoryNames,
    loading,
    refresh: () => setEpoch((n) => n + 1),
  };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run tests/ui-jsx/import-data.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui-jsx/panels/import/import-data.ts tests/ui-jsx/import-data.test.ts
git commit -m "feat(jsx): import wizard data layer — helpers + useImportData hook"
```

---

### Task 2: `ImportFoundation.tsx`

The three foundation-import rows.

**Files:**
- Create: `src/ui-jsx/panels/import/ImportFoundation.tsx`

**Interfaces:**
- Consumes: `store`, `attgUpdated`, `attgSyncSet`, `styleUpdated`, `styleSyncSet`, `shapeGenerationRequested`, `intentGenerationRequested` (`../../../core/store`); `T`, `SP` (`../../style`).
- Produces: `ImportFoundation({ memText, anText })`.

- [ ] **Step 1: Create `ImportFoundation.tsx`**

```tsx
// Foundation-import rows of the JSX Import wizard: Memory→ATTG, A/N→Style (each a
// one-click import that marks itself done), and Story→Shape+Intent generation.

import { T, SP } from "../../style";
import {
  store,
  attgUpdated,
  attgSyncSet,
  styleUpdated,
  styleSyncSet,
  shapeGenerationRequested,
  intentGenerationRequested,
} from "../../../core/store";

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

const row = {
  display: "flex",
  alignItems: "center",
  gap: SP.sm,
  padding: "6px 0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
} as const;
const label = {
  flexShrink: 0,
  fontSize: "0.8em",
  fontWeight: "bold",
  opacity: 0.8,
  minWidth: "84px",
} as const;
const preview = {
  flex: 1,
  fontSize: "0.75em",
  opacity: 0.5,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
} as const;
const btn = {
  flexShrink: 0,
  fontSize: "0.75em",
  padding: "2px 8px",
  background: T.bg2,
  color: T.text,
  border: "none",
  cursor: "pointer",
} as const;

export function ImportFoundation(props: { memText: string; anText: string }) {
  const [attgDone, setAttgDone] = useState(false);
  const [styleDone, setStyleDone] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {props.memText.trim() ? (
        <div style={{ ...row, opacity: attgDone ? 0.4 : 1 }}>
          <span style={label}>Memory → ATTG</span>
          <span style={preview}>{truncate(props.memText, 60)}</span>
          <button
            style={btn}
            disabled={attgDone}
            onClick={() => {
              store.dispatch(attgUpdated({ attg: props.memText }));
              store.dispatch(attgSyncSet({ enabled: true }));
              void api.v1.memory.set(props.memText);
              setAttgDone(true);
            }}
          >
            {attgDone ? "Imported ✓" : "Import"}
          </button>
        </div>
      ) : null}

      {props.anText.trim() ? (
        <div style={{ ...row, opacity: styleDone ? 0.4 : 1 }}>
          <span style={label}>A/N → Style</span>
          <span style={preview}>{truncate(props.anText, 60)}</span>
          <button
            style={btn}
            disabled={styleDone}
            onClick={() => {
              store.dispatch(styleUpdated({ style: props.anText }));
              store.dispatch(styleSyncSet({ enabled: true }));
              setStyleDone(true);
            }}
          >
            {styleDone ? "Imported ✓" : "Import"}
          </button>
        </div>
      ) : null}

      <div style={row}>
        <span style={label}>Story → Shape + Intent</span>
        <span style={preview} />
        <button
          style={btn}
          onClick={() => store.dispatch(shapeGenerationRequested())}
        >
          Shape
        </button>
        <button
          style={btn}
          onClick={() => store.dispatch(intentGenerationRequested())}
        >
          Intent
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → `✅ Built`. Then `git checkout project.yaml`.

- [ ] **Step 3: Commit**

```bash
git add src/ui-jsx/panels/import/ImportFoundation.tsx
git commit -m "feat(jsx): import wizard foundation rows (ATTG/Style/Shape+Intent)"
```

---

### Task 3: `ImportLorebook.tsx`

Unmanaged lorebook entries grouped by category, each with a DULFS picker + Bind. Reactive to binds.

**Files:**
- Create: `src/ui-jsx/panels/import/ImportLorebook.tsx`

**Interfaces:**
- Consumes: `useSlice` (`../../bridge`); `store`, `entityBound` (`../../../core/store`); `detectCategory`, `cycleDulfsCategory` (`../../../core/utils/category-detect`); `DULFS_SHORT`, `groupAndSortEntries`, `unmanagedEntries`, `LorebookEntry` (`./import-data`); `DulfsFieldID` (`../../../config/field-definitions`); `T`, `SP` (`../../style`).
- Produces: `ImportLorebook({ entries, categoryNames })`.

- [ ] **Step 1: Create `ImportLorebook.tsx`**

```tsx
// Lorebook-binding section of the JSX Import wizard: unmanaged lorebook entries
// grouped by category, each with a DULFS category picker (local, seeded by
// detectCategory) and a Bind button. `unmanaged` is reactive — binding an entry
// changes world.entitiesById, so the managedKey selector drops the row.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, entityBound } from "../../../core/store";
import {
  detectCategory,
  cycleDulfsCategory,
} from "../../../core/utils/category-detect";
import type { DulfsFieldID } from "../../../config/field-definitions";
import {
  DULFS_SHORT,
  groupAndSortEntries,
  unmanagedEntries,
  type LorebookEntry,
} from "./import-data";

const groupHeader = {
  fontSize: "0.7em",
  fontWeight: "bold",
  opacity: 0.5,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "10px 0 2px",
} as const;
const entryRow = {
  display: "flex",
  alignItems: "center",
  gap: SP.sm,
  padding: "4px 0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
} as const;
const entryName = {
  flex: 1,
  fontSize: "0.85em",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
} as const;
const smallBtn = {
  flexShrink: 0,
  fontSize: "0.72em",
  padding: "2px 7px",
  background: T.bg2,
  color: T.text,
  border: "none",
  cursor: "pointer",
} as const;

export function ImportLorebook(props: {
  entries: LorebookEntry[];
  categoryNames: Map<string, string>;
}) {
  // Primitive: the sorted, joined set of bound lorebookEntryIds. Changes on Bind.
  const managedKey = useSlice((s) =>
    Object.values(s.world.entitiesById)
      .map((e) => e.lorebookEntryId)
      .filter((id): id is string => !!id)
      .sort()
      .join(","),
  );
  const [dulfsMap, setDulfsMap] = useState<Record<string, DulfsFieldID>>({});

  const managed = new Set(managedKey ? managedKey.split(",") : []);
  const unmanaged = unmanagedEntries(props.entries, managed);

  if (unmanaged.length === 0) {
    return (
      <div style={{ opacity: 0.5, fontSize: "0.85em", padding: "8px 0" }}>
        {props.entries.length === 0
          ? "No lorebook entries found. Refresh after adding entries."
          : "All lorebook entries are already bound to Story Engine entities."}
      </div>
    );
  }

  const catFor = (e: LorebookEntry): DulfsFieldID =>
    dulfsMap[e.id] ?? detectCategory(e.text ?? "");

  const groups = groupAndSortEntries(unmanaged, props.categoryNames);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((g) => (
        <div key={g.key} style={{ display: "flex", flexDirection: "column" }}>
          <span style={groupHeader}>{g.label}</span>
          {g.entries.map((entry) => {
            const cat = catFor(entry);
            return (
              <div key={entry.id} style={entryRow}>
                <span style={entryName}>{entry.displayName || "(unnamed)"}</span>
                <button
                  style={{ ...smallBtn, opacity: 0.7 }}
                  title="Cycle category"
                  onClick={() =>
                    setDulfsMap((m) => ({
                      ...m,
                      [entry.id]: cycleDulfsCategory(cat),
                    }))
                  }
                >
                  {DULFS_SHORT[cat]} ▶
                </button>
                <button
                  style={smallBtn}
                  onClick={() => {
                    store.dispatch(
                      entityBound({
                        entity: {
                          id: api.v1.uuid(),
                          categoryId: cat,
                          lorebookEntryId: entry.id,
                          name: entry.displayName || "Unknown",
                          summary: "",
                          lifecycle: "live",
                        },
                      }),
                    );
                    void api.v1.ui.toast(
                      `Bound: ${entry.displayName || "entry"}`,
                      { type: "success" },
                    );
                  }}
                >
                  ⚡ Bind
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → `✅ Built`. Then `git checkout project.yaml`.

- [ ] **Step 3: Commit**

```bash
git add src/ui-jsx/panels/import/ImportLorebook.tsx
git commit -m "feat(jsx): import wizard lorebook binding (grouped, category cycle, bind)"
```

---

### Task 4: `ImportWizard` shell + Header button + StoryEngine wiring

Assemble the wizard, add the header Import button, and wire open/close.

**Files:**
- Create: `src/ui-jsx/panels/import/ImportWizard.tsx`
- Modify: `src/ui-jsx/panels/header/Header.tsx`
- Modify: `src/ui-jsx/panels/StoryEngine.tsx`

**Interfaces:**
- Consumes: `useImportData`, `unmanagedEntries` (`./import-data`); `store`, `attgUpdated`, `attgSyncSet`, `styleUpdated`, `styleSyncSet`, `shapeGenerationRequested`, `intentGenerationRequested`, `entitiesBoundBatch` (`../../../core/store`); `detectCategory` (`../../../core/utils/category-detect`); `ImportFoundation`, `ImportLorebook`; `T`, `SP`; feather `ArrowLeft`, `RefreshCw`, `Download`.

- [ ] **Step 1: Create `ImportWizard.tsx`**

```tsx
// Import wizard shell — a full-view takeover of the Story Engine tab. Header
// (Back / title / Refresh / Import All) over the foundation + lorebook sections.
// Import All batches ATTG+Style+bind-all-unmanaged+Shape+Intent, then closes.

import { T, SP } from "../../style";
import {
  store,
  attgUpdated,
  attgSyncSet,
  styleUpdated,
  styleSyncSet,
  shapeGenerationRequested,
  intentGenerationRequested,
  entitiesBoundBatch,
} from "../../../core/store";
import { detectCategory } from "../../../core/utils/category-detect";
import { useImportData, unmanagedEntries } from "./import-data";
import { ImportFoundation } from "./ImportFoundation";
import { ImportLorebook } from "./ImportLorebook";
import { ArrowLeft, RefreshCw, Download } from "nai:icons/feather";

const sectionLabel = {
  fontSize: "0.7em",
  fontWeight: "bold",
  opacity: 0.5,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "10px 0 4px",
} as const;
const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  display: "flex",
  alignItems: "center",
  padding: "2px",
} as const;

export function ImportWizard(props: { onClose: () => void }) {
  const data = useImportData();

  const onImportAll = () => {
    if (data.memText.trim()) {
      store.dispatch(attgUpdated({ attg: data.memText }));
      store.dispatch(attgSyncSet({ enabled: true }));
      void api.v1.memory.set(data.memText);
    }
    if (data.anText.trim()) {
      store.dispatch(styleUpdated({ style: data.anText }));
      store.dispatch(styleSyncSet({ enabled: true }));
    }
    // Bind every currently-unmanaged entry (fresh managed set from the store).
    const managed = new Set(
      Object.values(store.getState().world.entitiesById)
        .map((e) => e.lorebookEntryId)
        .filter((id): id is string => !!id),
    );
    const unmanaged = unmanagedEntries(data.entries, managed);
    if (unmanaged.length > 0) {
      store.dispatch(
        entitiesBoundBatch(
          unmanaged.map((entry) => ({
            id: api.v1.uuid(),
            categoryId: detectCategory(entry.text ?? ""),
            lorebookEntryId: entry.id,
            name: entry.displayName || "Unknown",
            summary: "",
            lifecycle: "live" as const,
          })),
        ),
      );
    }
    store.dispatch(shapeGenerationRequested());
    store.dispatch(intentGenerationRequested());
    props.onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, paddingBottom: "32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button title="Back" onClick={props.onClose} style={iconBtn}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ flex: 1, fontWeight: "bold", color: T.textHeadings }}>
          Import Existing Content
        </span>
        <button
          title="Refresh lorebook"
          onClick={() => {
            data.refresh();
            void api.v1.ui.toast("Lorebook refreshed", { type: "info" });
          }}
          style={iconBtn}
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={onImportAll}
          style={{
            display: "flex",
            alignItems: "center",
            gap: SP.xs,
            padding: "4px 10px",
            background: T.bg2,
            border: "none",
            cursor: "pointer",
            color: T.textHeadings,
            fontSize: "0.85em",
          }}
        >
          <Download size={14} /> Import All
        </button>
      </div>

      <span style={sectionLabel}>Foundation Fields</span>
      <ImportFoundation memText={data.memText} anText={data.anText} />

      <span style={sectionLabel}>Lorebook Entries</span>
      <ImportLorebook entries={data.entries} categoryNames={data.categoryNames} />
    </div>
  );
}
```

- [ ] **Step 2: Add the Import button to `Header.tsx`**

Change `Header` to accept `onOpenImport` and render a Download button next to the bootstrap button:
```tsx
import { SP, T } from "../../style";
import { GenxStatus } from "./GenxStatus";
import { BootstrapButton } from "./BootstrapButton";
import { Download } from "nai:icons/feather";

export function Header(props: { onOpenImport: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.sm, paddingBottom: SP.sm }}>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex" }}>
        <GenxStatus />
      </div>
      <button
        title="Import existing content"
        onClick={props.onOpenImport}
        style={{ background: "none", border: "none", cursor: "pointer", color: T.text, display: "flex", alignItems: "center", padding: "2px" }}
      >
        <Download size={16} />
      </button>
      <BootstrapButton />
    </div>
  );
}
```
(Add `T` to the `../../style` import if not present.)

- [ ] **Step 3: Wire open/close in `StoryEngine.tsx`**

Add import + local state + the early-return takeover (after the edit-pane returns so an open edit pane still wins), and pass `onOpenImport` to `Header`:
```tsx
import { ImportWizard } from "./import/ImportWizard";
...
  const [importOpen, setImportOpen] = useState(false);

  if (editId && isEntity) return <EntityEditPane entityId={editId} />;
  if (editId && isThread) return <ThreadEditPane groupId={editId} />;
  if (importOpen) return <ImportWizard onClose={() => setImportOpen(false)} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <Header onOpenImport={() => setImportOpen(true)} />
      <Foundation />
      <ForgeSection />
      <World />
    </div>
  );
```
(`useState` must precede the early returns — place it with the other hooks.)

- [ ] **Step 4: tsc + build + full suite**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → `✅ Built`. Then `git checkout project.yaml`.
Run: `npx vitest run` → all passing (Task 1's import-data test + no regressions).

- [ ] **Step 5: Update CHANGELOG + commit**

Add to `## [0.14.0]` `### Added` a release-note bullet: the JSX panel gains an **Import** flow — a header button opens a wizard that imports Memory→ATTG and A/N→Style, generates Shape/Intent from the story, and binds existing lorebook entries to Story Engine entities (per-entry category picker + Bind, or Import All). Match the existing 0.14.0 voice.

```bash
git add src/ui-jsx/panels/import/ImportWizard.tsx src/ui-jsx/panels/header/Header.tsx src/ui-jsx/panels/StoryEngine.tsx CHANGELOG.md
git commit -m "feat(jsx): Import wizard shell + header button + Story Engine wiring"
```

---

## Live Verification (after all tasks, batched with the user)

On the **Story Engine (JSX)** tab (confirm icon-only S.E.G.A.):

1. Click the header **Import** (download) button → the wizard takes over the view.
2. If Memory/A-N have content: **Memory → ATTG** and **A/N → Style** rows show previews; click Import → each marks **Imported ✓** and the ATTG/Style fields update (visible after Back).
3. A lorebook entry row: click the category button → it cycles (Char▶Sys▶…); click **⚡ Bind** → a success toast, the row disappears (bound), and the entity appears in the World.
4. **Import All** → binds the remaining unmanaged entries + triggers Shape/Intent, then closes.
5. **Refresh** reloads the lorebook list. **Back** closes with no further changes.

## Notes for the executor

- `useState`/`useEffect`/`h`/`Fragment` are NAI globals in `.ts`/`.tsx` — no import.
- `entitiesBoundBatch` takes an ARRAY, not `{ entities }`.
- Match sibling `T`/`SP` import path (`../../style` from `panels/import/`).
- Remove any import `noUnusedLocals` flags; do not suppress. Do not bump `project.yaml`.
- `api.v1.lorebook.entries()` returns the full `LorebookEntry[]`; the local `LorebookEntry` type in `import-data.ts` is a structural subset (id/displayName/category/text) — cast with `as LorebookEntry[]` at the load site (already in the Task 1 code).
