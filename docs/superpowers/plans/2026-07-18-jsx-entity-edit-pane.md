# JSX Entity Edit Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A JSX entity editor (static editing half of SUI's SeEntityEditPane) reachable from add-entity and card-name-click, with draft→live promotion, name propagation, lorebook flush on Save, and the green "complete" card border.

**Architecture:** New `EntityEditPane` + a `StoryEngine` orchestrator that reads the existing `ui.activeEditId` singleton to swap between `<Foundation/><World/>` and the pane. Pure Save helpers in `entity-edit.ts` (tested). Local `useDraftField` drafts; lorebook content/keys/always-on async-seeded on open. The 3 generate zap buttons render disabled (streaming deferred).

**Tech Stack:** TypeScript (strict), Preact-style JSX (`h`/`Fragment`/`useState`/`useEffect`/`useRef` are NAI-runtime globals — never imported), nai-store, `nai:icons/feather`, vitest, nibs build.

## Global Constraints

- **No new store slices/reducers.** Every action used already exists: `entityForged`, `entityEdited`, `entityCategoryChanged`, `entityLorebookEntryBound`, `entitySummaryUpdated`, `entityDeleted` (world barrel); `uiEditableActivate`, `uiEditableDeactivate` (ui barrel). Helpers `ensureCategory` (`core/store/effects/lorebook-sync`), `nameKey`/`withNameKeyFirst` (`core/store/effects/handlers/lorebook`).
- **Colors: theme tokens only** (`T.*`, no hex). Category "selected" = `T.textHeadings` on `T.bg3`; Always-On "on" = `T.midIntensity`; complete border = `T.midIntensity`.
- **No DOM APIs** / no `console.log` (`api.v1.*`; `api` is a runtime global). No `setTimeout`.
- `useState`/`useEffect`/`useRef`/`useSlice`/`h`/`Fragment` — do NOT import (`useSlice` from `../bridge`/`../../bridge`; `useDraftField` from `../../hooks`).
- **`useSlice` selectors return primitives or stable store-owned refs** (`Object.is`).
- **Keys mandatory** on mapped lists.
- **No storyStorage draft slots** — local `useDraftField` only.
- **Text inputs/textareas are controlled** (`value={draft.value}` + `onInput`), matching the shipped Shape-title fix (`FieldEditor` input). Content/keys inputs are `disabled` until the async lorebook seed resolves, so the seed can't clobber an early edit.
- Strict TypeScript (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`); `npx tsc --noEmit` exit 0.
- Icon size 16. Format before commit: `npx prettier -w <files>`. Do NOT bump `project.yaml` version or touch CHANGELOG.
- Typecheck gate: `npx tsc --noEmit`. Logic tests: `npx vitest run <file>` / `npm test`.

## File Structure

- Create `src/ui-jsx/panels/world/entity-edit.ts` — pure Save helpers.
- Create `src/ui-jsx/panels/world/EntityEditPane.tsx` — the editor.
- Create `src/ui-jsx/panels/StoryEngine.tsx` — engine-tab orchestrator.
- Modify `src/ui-jsx/panels/world/world-select.ts` — `entityBorderKind` gains a `complete` kind.
- Modify `src/ui-jsx/panels/world/EntityCard.tsx` — async completeness border + clickable name.
- Modify `src/ui-jsx/panels/world/World.tsx` — enable add-entity.
- Modify `src/ui-jsx/components/ConfirmButton.tsx` — optional `label`.
- Modify `src/ui-jsx/App.tsx` — render `<StoryEngine/>` in the engine tab.
- Tests: `tests/ui-jsx/entity-edit.test.ts`; extend `tests/ui-jsx/world-select.test.ts`.

---

### Task 1: `entity-edit.ts` — pure Save helpers (TDD)

**Files:**
- Create: `src/ui-jsx/panels/world/entity-edit.ts`
- Test: `tests/ui-jsx/entity-edit.test.ts`

**Interfaces:**
- Consumes: type `WorldEntity` from `../../../core/store`.
- Produces:
  - `parseKeys(raw: string): string[]`
  - `applyEratoPrefix(content: string, erato: boolean): string`
  - `propagateNameInSummaries(entities: WorldEntity[], entityId: string, oldName: string, newName: string): Array<{ entityId: string; summary: string }>`

- [ ] **Step 1: Write the failing test**

Create `tests/ui-jsx/entity-edit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseKeys,
  applyEratoPrefix,
  propagateNameInSummaries,
} from "../../src/ui-jsx/panels/world/entity-edit";
import type { WorldEntity } from "../../src/core/store";

const ent = (id: string, over: Partial<WorldEntity> = {}): WorldEntity => ({
  id,
  categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
  name: id,
  summary: "",
  lifecycle: "live",
  ...over,
});

describe("parseKeys", () => {
  it("splits, trims, drops empties", () => {
    expect(parseKeys("a, b ,,c ")).toEqual(["a", "b", "c"]);
    expect(parseKeys("")).toEqual([]);
    expect(parseKeys("   ")).toEqual([]);
  });
});

describe("applyEratoPrefix", () => {
  it("prefixes non-empty content when erato and not already prefixed", () => {
    expect(applyEratoPrefix("hello", true)).toBe("----\nhello");
  });
  it("leaves already-prefixed content unchanged", () => {
    expect(applyEratoPrefix("----\nhello", true)).toBe("----\nhello");
  });
  it("no-ops when erato is false or content empty", () => {
    expect(applyEratoPrefix("hello", false)).toBe("hello");
    expect(applyEratoPrefix("", true)).toBe("");
  });
});

describe("propagateNameInSummaries", () => {
  it("renames old→new (case-insensitive) in other entities, excludes the edited one, returns only changed", () => {
    const entities = [
      ent("a", { name: "John", summary: "John and jane" }),
      ent("b", { summary: "JOHN went home" }),
      ent("c", { summary: "nothing here" }),
    ];
    const updates = propagateNameInSummaries(entities, "a", "John", "Jack");
    expect(updates).toEqual([{ entityId: "b", summary: "Jack went home" }]);
  });
  it("regex-escapes special chars in the old name", () => {
    const entities = [ent("x", { summary: "the (Guild) rose" })];
    const updates = propagateNameInSummaries(entities, "z", "(Guild)", "Order");
    expect(updates).toEqual([{ entityId: "x", summary: "the Order rose" }]);
  });
  it("returns empty when nothing matches", () => {
    const entities = [ent("x", { summary: "unrelated" })];
    expect(propagateNameInSummaries(entities, "z", "Foo", "Bar")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui-jsx/entity-edit.test.ts`
Expected: FAIL — cannot resolve module `entity-edit`.

- [ ] **Step 3: Write the implementation**

Create `src/ui-jsx/panels/world/entity-edit.ts`:

```ts
// Pure Save helpers for the entity edit pane. Framework-free, unit-tested.
// Mirrors the keys/erato/name-propagation logic in SUI SeEntityEditPane._save.

import type { WorldEntity } from "../../../core/store";

/** Split a comma string into trimmed, non-empty keys. */
export function parseKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/** Prepend the erato "----\n" divider to non-empty content when erato mode is on
 *  and it isn't already prefixed. */
export function applyEratoPrefix(content: string, erato: boolean): string {
  if (content && erato && !content.startsWith("----\n")) return "----\n" + content;
  return content;
}

/** Replace `oldName` with `newName` (case-insensitive) in every OTHER entity's
 *  summary, returning only the entities whose summary actually changed. */
export function propagateNameInSummaries(
  entities: WorldEntity[],
  entityId: string,
  oldName: string,
  newName: string,
): Array<{ entityId: string; summary: string }> {
  if (!oldName || oldName === newName) return [];
  const pattern = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const updates: Array<{ entityId: string; summary: string }> = [];
  for (const other of entities) {
    if (other.id === entityId) continue;
    const updated = other.summary.replace(pattern, newName);
    if (updated !== other.summary) {
      updates.push({ entityId: other.id, summary: updated });
    }
  }
  return updates;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui-jsx/entity-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/entity-edit.ts tests/ui-jsx/entity-edit.test.ts
git add src/ui-jsx/panels/world/entity-edit.ts tests/ui-jsx/entity-edit.test.ts
git commit -m "feat(jsx): entity-edit pure Save helpers (keys/erato/name-propagation)"
```

---

### Task 2: `world-select.ts` — `entityBorderKind` gains `complete` (TDD)

**Files:**
- Modify: `src/ui-jsx/panels/world/world-select.ts`
- Test: `tests/ui-jsx/world-select.test.ts` (extend)

**Interfaces:**
- Produces: `type BorderKind = "draft" | "pending" | "incomplete" | "complete"`;
  `entityBorderKind(entity: WorldEntity, pending: boolean, complete?: boolean): BorderKind`.

> `complete` is optional (default `false`) so `EntityCard`'s existing 2-arg call keeps compiling until Task 5 passes the real value — no inter-task tsc breakage.

- [ ] **Step 1: Extend the test**

In `tests/ui-jsx/world-select.test.ts`, replace the existing `describe("entityBorderKind", ...)` block with:

```ts
describe("entityBorderKind", () => {
  it("draft → draft (regardless of pending/complete)", () => {
    expect(entityBorderKind(ent("a", { lifecycle: "draft" }), true, true)).toBe("draft");
  });
  it("live + pending → pending (pending wins over complete)", () => {
    expect(entityBorderKind(ent("a"), true, true)).toBe("pending");
  });
  it("live + not pending + complete → complete", () => {
    expect(entityBorderKind(ent("a"), false, true)).toBe("complete");
  });
  it("live + not pending + not complete → incomplete", () => {
    expect(entityBorderKind(ent("a"), false, false)).toBe("incomplete");
  });
  it("complete defaults to false (2-arg call) → incomplete", () => {
    expect(entityBorderKind(ent("a"), false)).toBe("incomplete");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui-jsx/world-select.test.ts`
Expected: FAIL — the `complete` cases return "incomplete" (3rd arg ignored / not yet supported).

- [ ] **Step 3: Update `entityBorderKind`**

In `src/ui-jsx/panels/world/world-select.ts`, replace the `BorderKind` type and `entityBorderKind` function with:

```ts
export type BorderKind = "draft" | "pending" | "incomplete" | "complete";

/** Status border kind. Draft wins; then pending (an in-flight regen) wins over a
 *  stale complete; then complete (summary + lorebook text + keys) vs incomplete.
 *  `complete` defaults false so a 2-arg call yields the store-only behavior. */
export function entityBorderKind(
  entity: WorldEntity,
  pending: boolean,
  complete: boolean = false,
): BorderKind {
  if (entity.lifecycle === "draft") return "draft";
  if (pending) return "pending";
  return complete ? "complete" : "incomplete";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui-jsx/world-select.test.ts`
Expected: PASS (all cases, including the existing selectWorldBody/entityPending tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (EntityCard's existing 2-arg call still compiles via the default).

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/world-select.ts tests/ui-jsx/world-select.test.ts
git add src/ui-jsx/panels/world/world-select.ts tests/ui-jsx/world-select.test.ts
git commit -m "feat(jsx): entityBorderKind complete kind"
```

---

### Task 3: `ConfirmButton.tsx` — optional `label`

**Files:**
- Modify: `src/ui-jsx/components/ConfirmButton.tsx`

**Interfaces:**
- Produces: `ConfirmButton(props: { title: string; onConfirm: () => void; timeoutMs?: number; label?: string })`. When `label` is set, the button also renders the label text (idle) / "Confirm?" (armed). Existing icon-only callers omit `label` and are unchanged.

> Verified by `npx tsc --noEmit`; behavior in the final live pass.

- [ ] **Step 1: Add the `label` prop**

In `src/ui-jsx/components/ConfirmButton.tsx`, change the props type to add `label?: string`:

```tsx
export function ConfirmButton(props: {
  title: string;
  onConfirm: () => void;
  timeoutMs?: number;
  label?: string;
}) {
```

Then replace the `return (...)` button body's children (the single icon expression) so the icon is followed by an optional label span:

```tsx
      {armed ? <AlertTriangle size={ICON_SIZE} /> : <Trash2 size={ICON_SIZE} />}
      {props.label ? (
        <span style={{ marginLeft: "4px", fontSize: "0.85em" }}>
          {armed ? "Confirm?" : props.label}
        </span>
      ) : null}
```

Also add `display: "inline-flex"` and `alignItems: "center"` to the button's existing `style` object so the icon + label align:

```tsx
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: armed ? T.warning : T.text,
        opacity: armed ? 1 : 0.6,
        display: "inline-flex",
        alignItems: "center",
      }}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Format + commit**

```bash
npx prettier -w src/ui-jsx/components/ConfirmButton.tsx
git add src/ui-jsx/components/ConfirmButton.tsx
git commit -m "feat(jsx): ConfirmButton optional label"
```

---

### Task 4: `EntityEditPane.tsx` — the editor

**Files:**
- Create: `src/ui-jsx/panels/world/EntityEditPane.tsx`

**Interfaces:**
- Consumes: `useSlice` from `../../bridge`; `useDraftField` from `../../hooks`; `T`, `SP` from `../../style`; `store`, `entityEdited`, `entityCategoryChanged`, `entityLorebookEntryBound`, `entitySummaryUpdated`, `entityDeleted`, `uiEditableDeactivate` from `../../../core/store`; `ensureCategory` from `../../../core/store/effects/lorebook-sync`; `nameKey`, `withNameKeyFirst` from `../../../core/store/effects/handlers/lorebook`; `FieldID`, `type DulfsFieldID` from `../../../config/field-definitions`; `parseKeys`, `applyEratoPrefix`, `propagateNameInSummaries` from `./entity-edit`; `ConfirmButton` from `../../components/ConfirmButton`; `ArrowLeft`, `Zap`, `User`, `Cpu`, `MapPin`, `Shield`, `Activity`, `Hash` from `nai:icons/feather`.
- Produces: `EntityEditPane(props: { entityId: string })`.

> No render-test harness for components; verified by `npx tsc --noEmit` + the final live pass. The live pass MUST confirm the content/keys textareas display their async-seeded text and accept typing (controlled inputs). If the runtime ignores textarea `value`, the fallback is: render content/keys only after `loading` clears, seeding via stable child text captured at load. Note that outcome in the report if observed.

- [ ] **Step 1: Write the component**

Create `src/ui-jsx/panels/world/EntityEditPane.tsx`:

```tsx
// EntityEditPane — static entity editor (editing half of SUI SeEntityEditPane).
// Category, name, summary, lorebook content, keys, Always-On, Delete, Save.
// Save promotes a draft to a live lorebook entry, propagates a name change into
// other entities' summaries, and flushes content/keys/always-on to the lorebook.
// The 3 generate zap buttons stream into the pane (unsolved in JSX) and render
// disabled; the card's regen bolt already generates for live entities.

import { useSlice } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  entityEdited,
  entityCategoryChanged,
  entityLorebookEntryBound,
  entitySummaryUpdated,
  entityDeleted,
  uiEditableDeactivate,
} from "../../../core/store";
import { ensureCategory } from "../../../core/store/effects/lorebook-sync";
import {
  nameKey,
  withNameKeyFirst,
} from "../../../core/store/effects/handlers/lorebook";
import { FieldID, type DulfsFieldID } from "../../../config/field-definitions";
import {
  parseKeys,
  applyEratoPrefix,
  propagateNameInSummaries,
} from "./entity-edit";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  ArrowLeft,
  Zap,
  User,
  Cpu,
  MapPin,
  Shield,
  Activity,
  Hash,
} from "nai:icons/feather";

const ICON_SIZE = 16;

const CATEGORIES: { id: DulfsFieldID; label: string; Icon: typeof User }[] = [
  { id: FieldID.DramatisPersonae, label: "Characters", Icon: User },
  { id: FieldID.UniverseSystems, label: "Systems", Icon: Cpu },
  { id: FieldID.Locations, label: "Locations", Icon: MapPin },
  { id: FieldID.Factions, label: "Factions", Icon: Shield },
  { id: FieldID.SituationalDynamics, label: "Vectors", Icon: Activity },
  { id: FieldID.Topics, label: "Topics", Icon: Hash },
];

const inputStyle = {
  background: T.bg2,
  color: T.text,
  fontFamily: T.fontDefault,
  padding: SP.md,
  border: "none",
} as const;
const sectionRow = { display: "flex", alignItems: "center", gap: SP.sm } as const;
const sectionLabel = {
  flex: 1,
  fontSize: "0.8em",
  fontWeight: "bold",
  color: T.textHeadings,
} as const;
const disabledZap = {
  background: "none",
  border: "none",
  cursor: "default",
  opacity: 0.35,
} as const;

/** Resolve, or create+bind, the lorebook entry for this entity. Idempotent —
 *  returns the existing id for live entities, lazily promotes drafts. */
async function ensureLiveEntryId(entityId: string): Promise<string | undefined> {
  const existing =
    store.getState().world.entitiesById[entityId]?.lorebookEntryId;
  if (existing) return existing;
  const current = store.getState().world.entitiesById[entityId];
  if (!current) return undefined;
  const categoryId = await ensureCategory(current.categoryId);
  const newEntryId = api.v1.uuid();
  await api.v1.lorebook.createEntry({
    id: newEntryId,
    displayName: current.name,
    text: "",
    keys: current.name ? [nameKey(current.name)] : [],
    enabled: true,
    category: categoryId,
  });
  store.dispatch(
    entityLorebookEntryBound({ entityId, lorebookEntryId: newEntryId }),
  );
  return newEntryId;
}

export function EntityEditPane(props: { entityId: string }) {
  const { entityId } = props;
  const entity = useSlice((s) => s.world.entitiesById[entityId]);

  const name = useDraftField(entity?.name ?? "");
  const summary = useDraftField(entity?.summary ?? "");
  const content = useDraftField("");
  const keys = useDraftField("");
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [category, setCategory] = useState<string>(
    entity?.categoryId ?? FieldID.DramatisPersonae,
  );
  const [loading, setLoading] = useState(true);

  // Seed lorebook content/keys/always-on from the entry once, on open.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const eid = store.getState().world.entitiesById[entityId]?.lorebookEntryId;
      if (eid) {
        const entry = await api.v1.lorebook.entry(eid);
        if (!cancelled && entry) {
          content.setValue(entry.text ?? "");
          keys.setValue(entry.keys?.join(", ") ?? "");
          setAlwaysOn(entry.forceActivation ?? false);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!entity) return null;

  const close = () => store.dispatch(uiEditableDeactivate());

  const onCategory = (id: DulfsFieldID) => {
    setCategory(id);
    store.dispatch(entityCategoryChanged({ entityId, categoryId: id }));
  };

  const onSave = () => {
    void (async () => {
      const newName = name.value.trim() || entity.name;
      const newSummary = summary.value.trim();
      const oldName = entity.name;
      store.dispatch(entityEdited({ entityId, name: newName, summary: newSummary }));

      for (const u of propagateNameInSummaries(
        Object.values(store.getState().world.entitiesById),
        entityId,
        oldName,
        newName,
      )) {
        store.dispatch(
          entitySummaryUpdated({ entityId: u.entityId, summary: u.summary }),
        );
      }

      const liveId = await ensureLiveEntryId(entityId);
      if (liveId) {
        const erato = (await api.v1.config.get("erato_compatibility")) || false;
        await api.v1.lorebook.updateEntry(liveId, {
          displayName: newName,
          text: applyEratoPrefix(content.value, !!erato),
          keys: withNameKeyFirst(parseKeys(keys.value), newName),
          forceActivation: alwaysOn,
        });
      }
      close();
    })();
  };

  const onDelete = () => {
    store.dispatch(entityDeleted({ entityId }));
    close();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        paddingBottom: "32px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          title="Back"
          onClick={close}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.text,
            display: "flex",
            alignItems: "center",
            padding: 0,
          }}
        >
          <ArrowLeft size={ICON_SIZE} />
        </button>
        <span style={{ flex: 1, color: T.textHeadings, fontWeight: "bold" }}>
          {name.value || "(unnamed)"}
        </span>
        <ConfirmButton title="Delete entity" label="Delete" onConfirm={onDelete} />
        <button onClick={onSave} style={{ padding: "4px 16px" }}>
          Save
        </button>
      </div>

      {/* Category bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: SP.sm }}>
        {CATEGORIES.map((cat) => {
          const selected = cat.id === category;
          return (
            <button
              key={cat.id}
              onClick={() => onCategory(cat.id)}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: "0.775rem",
                borderRadius: "3px",
                display: "flex",
                alignItems: "center",
                gap: SP.xs,
                background: selected ? T.bg3 : "transparent",
                color: selected ? T.textHeadings : T.textDisabled,
                opacity: selected ? 1 : 0.5,
              }}
            >
              <cat.Icon size={ICON_SIZE} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Name */}
      <input
        placeholder="Entity name…"
        value={name.value}
        onInput={(e) => name.setValue(e.target.value ?? "")}
        style={inputStyle}
      />

      {/* Summary */}
      <div style={sectionRow}>
        <span style={sectionLabel}>Summary</span>
        <button title="Generate (coming soon)" disabled style={disabledZap}>
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <textarea
        placeholder="Brief description of this entity…"
        rows={4}
        value={summary.value}
        onInput={(e) => summary.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, resize: "vertical" }}
      />

      {/* Lorebook section */}
      <div
        style={{
          marginTop: SP.sm,
          borderTop: `1px solid ${T.bg3}`,
          paddingTop: SP.sm,
          display: "flex",
          flexDirection: "column",
          gap: SP.sm,
        }}
      >
        <div style={sectionRow}>
          <span style={sectionLabel}>Content</span>
          <button title="Generate (coming soon)" disabled style={disabledZap}>
            <Zap size={ICON_SIZE} />
          </button>
        </div>
        <textarea
          placeholder="Lorebook content…"
          rows={6}
          disabled={loading}
          value={content.value}
          onInput={(e) => content.setValue(e.target.value ?? "")}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <div style={sectionRow}>
          <span style={{ ...sectionLabel, flex: "none" }}>Keys</span>
          <input
            placeholder="comma, separated, keys"
            disabled={loading}
            value={keys.value}
            onInput={(e) => keys.setValue(e.target.value ?? "")}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button title="Generate (coming soon)" disabled style={disabledZap}>
            <Zap size={ICON_SIZE} />
          </button>
          <button
            title="Always On"
            onClick={() => setAlwaysOn((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              padding: "2px 6px",
              color: alwaysOn ? T.midIntensity : T.textDisabled,
              opacity: alwaysOn ? 1 : 0.5,
            }}
          >
            Always On
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If an icon name doesn't resolve, adjust per feather PascalCase; do not change logic.)

- [ ] **Step 3: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/EntityEditPane.tsx
git add src/ui-jsx/panels/world/EntityEditPane.tsx
git commit -m "feat(jsx): entity edit pane — category/name/summary/lorebook + Save/Delete"
```

---

### Task 5: `EntityCard.tsx` — completeness border + clickable name

**Files:**
- Modify: `src/ui-jsx/panels/world/EntityCard.tsx`

**Interfaces:**
- Consumes: adds `uiEditableActivate` from `../../../core/store`.

> Verified by `npx tsc --noEmit`; behavior in the final live pass.

- [ ] **Step 1: Add the `uiEditableActivate` import**

In `src/ui-jsx/panels/world/EntityCard.tsx`, change the core-store import line:

```tsx
import { store, entityDiscardRequested, uiEditableActivate } from "../../../core/store";
```

- [ ] **Step 2: Extend `borderColor` for the `complete` kind**

Replace the `borderColor` function with:

```tsx
function borderColor(kind: BorderKind): string {
  if (kind === "draft") return T.lowIntensity;
  if (kind === "pending") return T.warning;
  if (kind === "complete") return T.midIntensity;
  return T.textDisabled;
}
```

- [ ] **Step 3: Add async completeness + pass it to the border**

Inside `EntityCard`, after the existing `pending` selector line, add the completeness state + effect:

```tsx
  const [complete, setComplete] = useState(false);

  // Green "complete" needs a lorebook read (text + keys). Re-fetch when the
  // entity object changes (a Save produces a new object) or a regen settles.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const eid = entity?.lorebookEntryId;
      if (!entity || entity.lifecycle === "draft" || !eid) {
        if (!cancelled) setComplete(false);
        return;
      }
      const entry = await api.v1.lorebook.entry(eid);
      const keysOk =
        !!entry?.forceActivation || !!(entry?.keys && entry.keys.length > 0);
      if (!cancelled) {
        setComplete(!!entity.summary && !!entry?.text && keysOk);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, pending]);
```

Then change the `kind` line to pass `complete`:

```tsx
  const kind = entityBorderKind(entity, pending, complete);
```

- [ ] **Step 4: Make the name clickable (opens the edit pane)**

Replace the name `<span>` with a name button that opens the editor:

```tsx
        <button
          title="Edit entity"
          onClick={() => store.dispatch(uiEditableActivate({ id: entityId }))}
          style={{
            flex: 1,
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.text,
            padding: 0,
            font: "inherit",
          }}
        >
          {entity.name || "(unnamed)"}
        </button>
```

Update the file's top comment to drop the "non-interactive / deferred" note (the name now opens the editor and the green border is live):

```tsx
// One entity card: category icon + name (click → edit pane) + collapsible summary
// (follows ui.worldExpanded) + status border (draft/pending/complete/incomplete).
// Live cards show a regen bolt that dims while pending; draft cards show discard.
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/EntityCard.tsx
git add src/ui-jsx/panels/world/EntityCard.tsx
git commit -m "feat(jsx): entity card complete border + clickable name"
```

---

### Task 6: `World.tsx` — enable add-entity

**Files:**
- Modify: `src/ui-jsx/panels/world/World.tsx`

**Interfaces:**
- Consumes: adds `entityForged`, `uiEditableActivate` from `../../../core/store`; `FieldID` from `../../../config/field-definitions`.

> Verified by `npx tsc --noEmit`; behavior in the final live pass. Only add-entity is enabled; add-thread stays disabled (thread edit pane is a later slice).

- [ ] **Step 1: Add imports**

In `src/ui-jsx/panels/world/World.tsx`, extend the core-store import to include `entityForged` and `uiEditableActivate`, and add the FieldID import:

```tsx
import {
  store,
  segaToggled,
  worldExpansionSet,
  worldCleared,
  entityForged,
  uiEditableActivate,
} from "../../../core/store";
import { FieldID } from "../../../config/field-definitions";
```

- [ ] **Step 2: Add the add-entity handler**

Inside `World`, before the `return`, add:

```tsx
  const onAddEntity = () => {
    const id = api.v1.uuid();
    store.dispatch(
      entityForged({
        entity: {
          id,
          categoryId: FieldID.DramatisPersonae,
          name: "",
          summary: "",
          lifecycle: "draft",
        },
      }),
    );
    store.dispatch(uiEditableActivate({ id }));
  };
```

- [ ] **Step 3: Wire the add-entity button (replace the disabled one)**

Replace the disabled add-entity button:

```tsx
        <button title="Add entity (coming soon)" disabled style={DISABLED_BTN}>
          <Plus size={ICON_SIZE} />
        </button>
```

with an enabled one:

```tsx
        <button title="Add entity" onClick={onAddEntity} style={ICON_BTN}>
          <Plus size={ICON_SIZE} />
        </button>
```

(Leave the add-thread button disabled — unchanged.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/World.tsx
git add src/ui-jsx/panels/world/World.tsx
git commit -m "feat(jsx): enable add-entity (create draft + open edit pane)"
```

---

### Task 7: `StoryEngine.tsx` orchestrator + App wiring

**Files:**
- Create: `src/ui-jsx/panels/StoryEngine.tsx`
- Modify: `src/ui-jsx/App.tsx`

**Interfaces:**
- `StoryEngine.tsx` consumes: `useSlice` from `../bridge`; `SP` from `../style`; `Foundation` from `./foundation/Foundation`; `World` from `./world/World`; `EntityEditPane` from `./world/EntityEditPane`.
- Produces: `StoryEngine()`.

> Verified by `npx tsc --noEmit` + `npm test`; then the final manual harness pass (CONTROLLER + user — the implementer stops after the build step).

- [ ] **Step 1: Write the orchestrator**

Create `src/ui-jsx/panels/StoryEngine.tsx`:

```tsx
// Story Engine tab body. Swaps between the Foundation + World stack and the
// entity edit pane based on the ui.activeEditId singleton. add-entity and a card
// name-click set activeEditId; the pane's Back/Save/Delete clear it. Guarded by
// entitiesById membership so only entity edits route here (threads come later).

import { useSlice } from "../bridge";
import { SP } from "../style";
import { Foundation } from "./foundation/Foundation";
import { World } from "./world/World";
import { EntityEditPane } from "./world/EntityEditPane";

export function StoryEngine() {
  const editId = useSlice((s) => s.ui.activeEditId);
  const isEntity = useSlice((s) =>
    editId ? !!s.world.entitiesById[editId] : false,
  );

  if (editId && isEntity) {
    return <EntityEditPane entityId={editId} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <Foundation />
      <World />
    </div>
  );
}
```

- [ ] **Step 2: Render `<StoryEngine/>` in App**

In `src/ui-jsx/App.tsx`:

Replace the two imports (lines ~4-5):

```tsx
import { Foundation } from "./panels/foundation/Foundation";
import { World } from "./panels/world/World";
```

with a single import:

```tsx
import { StoryEngine } from "./panels/StoryEngine";
```

Then replace the engine-tab body (the inner column that renders `<Foundation />` + `<World />`) so the scroll box holds `<StoryEngine/>`:

```tsx
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: SP.md }}>
          <StoryEngine />
        </div>
      )}
```

(Do not change the tab shell, tab-switch effects, or the Chat branch. `SP` stays imported — it's still used by the Chat branch / layout.)

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit`
Expected: exit 0 (a leftover `World`/`Foundation` import in App would fail here).

Run: `npm test`
Expected: PASS — all suites including `tests/ui-jsx/entity-edit.test.ts` and `tests/ui-jsx/world-select.test.ts`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript` with no errors. (If it fails with a `ModuleKind` / `@rollup/plugin-typescript` error, that is the known typescript-pin environment issue — report it as a concern, do not modify package.json.)

- [ ] **Step 5: Manual harness verification** — CONTROLLER + USER ONLY, not the implementer.

(For reference — the controller runs this with the user. The implementer does NOT perform this step.) In NovelAI, Story Engine (JSX) tab: add-entity creates a draft and opens the pane; a card name-click opens the pane; category switch highlights; edit name/summary/content/keys (confirm the async-seeded content/keys textareas show existing text and accept typing); Always-On toggles; Save promotes a draft to live and the card's border goes green when summary+content+keys present; renaming an entity updates a referencing summary; Delete-confirm removes the entity; the 3 generate zap buttons render disabled; Back returns to Foundation+World.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/StoryEngine.tsx src/ui-jsx/App.tsx
git add src/ui-jsx/panels/StoryEngine.tsx src/ui-jsx/App.tsx
git commit -m "feat(jsx): StoryEngine orchestrator — entity edit pane via activeEditId"
```

---

## Self-Review Notes

- **Spec coverage:** pure Save helpers + tests (Task 1); complete border-kind + tests (Task 2); ConfirmButton label (Task 3); EntityEditPane with category/name/summary/lorebook/save(promote+propagate+flush)/delete + disabled generate buttons (Task 4); EntityCard async completeness + clickable name (Task 5); enable add-entity (Task 6); StoryEngine orchestrator via activeEditId + App wiring (Task 7). Local drafts, no storyStorage, theme tokens, keys on lists, deferred generate buttons — all covered.
- **Type consistency:** `parseKeys`/`applyEratoPrefix`/`propagateNameInSummaries` defined in Task 1, consumed unchanged in Task 4; `BorderKind`/`entityBorderKind(entity, pending, complete?)` defined in Task 2, consumed in Task 5; `ConfirmButton` `label?` defined in Task 3, used in Task 4; `EntityEditPane({entityId})` produced in Task 4, consumed in Task 7; `uiEditableActivate({id})` used consistently in Tasks 5/6, cleared by `uiEditableDeactivate()` in Task 4.
- **Placeholders:** none — every code step is complete. The feather icon-name and controlled-textarea caveats are noted inline (Task 4).
