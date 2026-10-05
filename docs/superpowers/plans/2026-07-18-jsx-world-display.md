# JSX World Display Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the World section (Threads + entity cards) below Foundation in the JSX Story Engine tab, reactive to the store, with store-only status borders and cheap one-dispatch actions.

**Architecture:** New `src/ui-jsx/panels/world/` folder with a pure `world-select.ts` (tested) driving three components (`World`, `ThreadItem`, `EntityCard`), plus a shared `components/ConfirmButton.tsx`. Preact `useSlice` selects store-owned refs; the body is computed in render via `selectWorldBody`. Edit panes, creation, and the thread lorebook toggle are deferred to later slices and render shown-but-disabled.

**Tech Stack:** TypeScript (strict), Preact-style JSX (`h`/`Fragment`/`useState`/`useEffect`/`useRef` are NAI-runtime globals — never imported), nai-store, `nai:icons/feather`, vitest, nibs build.

## Global Constraints

- **No store/effect/prompt/slice changes.** Pure UI. Every action/selector already exists.
- **Colors: theme tokens only** (`T.*` from `src/ui-jsx/style.ts`) — no static hex. `style.ts` is `satisfies Record<string, ThemeVarRef>`, so any new token must be a `var(--theme-*)` ref.
- **No DOM APIs.** QuickJS worker: no `setTimeout`/`console.log`; use `api.v1.timers` / `api.v1.log`. `api` is a runtime global.
- `useState`/`useEffect`/`useRef`/`useSlice`/`h`/`Fragment` — do NOT import (runtime globals; `useSlice` from `../bridge`/`../../bridge`).
- **`useSlice` selectors must return primitives or stable store-owned refs** (compared by `Object.is`; a fresh-object selector loops).
- **Keys mandatory** on every mapped list (`key={...}`) — prior keyed-reconciliation bugs in this repo.
- Strict TypeScript (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`); `npx tsc --noEmit` must exit 0.
- **Deferred = shown-disabled**: add-entity, add-thread, thread lorebook toggle render greyed/inert (opacity ~0.35, `cursor: default`, no `onClick`); entity + thread names are plain non-interactive text.
- **Thread delete is immediate** (`groupDeleted`, no confirm) — matches SUI. Entity discard + world clear use `ConfirmButton`.
- Icon size 16. Format before commit: `npx prettier -w <files>`. Do NOT bump `project.yaml` version or touch CHANGELOG.
- Typecheck gate: `npx tsc --noEmit`. Logic tests: `npx vitest run <file>` / `npm test`.

## File Structure

- Create `src/ui-jsx/panels/world/world-select.ts` — pure helpers (`selectWorldBody`, `entityRequestIds`, `entityPending`, `entityBorderKind`, `BorderKind`).
- Create `src/ui-jsx/components/ConfirmButton.tsx` — shared arm→confirm trash button.
- Create `src/ui-jsx/panels/world/EntityCard.tsx` — entity card.
- Create `src/ui-jsx/panels/world/ThreadItem.tsx` — thread card + member cards.
- Create `src/ui-jsx/panels/world/World.tsx` — the World section.
- Modify `src/ui-jsx/style.ts` — add `lowIntensity` token (Task 3).
- Modify `src/ui-jsx/App.tsx` — render `<World/>` under `<Foundation/>` (Task 5).
- Create `tests/ui-jsx/world-select.test.ts`.

---

### Task 1: `world-select.ts` — pure helpers (TDD)

**Files:**
- Create: `src/ui-jsx/panels/world/world-select.ts`
- Test: `tests/ui-jsx/world-select.test.ts`

**Interfaces:**
- Consumes: `isForgeDraft` from `../../../core/store/selectors/forge`; types `RootState`, `WorldEntity`, `WorldGroup` from `../../../core/store`.
- Produces:
  - `selectWorldBody(entitiesById: Record<string, WorldEntity>, groups: WorldGroup[]): { groups: WorldGroup[]; loose: WorldEntity[] }`
  - `entityRequestIds(entityId: string): string[]`
  - `entityPending(runtime: RootState["runtime"], entityId: string): boolean`
  - `type BorderKind = "draft" | "pending" | "incomplete"`
  - `entityBorderKind(entity: WorldEntity, pending: boolean): BorderKind`

- [ ] **Step 1: Write the failing test**

Create `tests/ui-jsx/world-select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  selectWorldBody,
  entityRequestIds,
  entityPending,
  entityBorderKind,
} from "../../src/ui-jsx/panels/world/world-select";
import type { WorldEntity, WorldGroup, RootState } from "../../src/core/store";

const ent = (id: string, over: Partial<WorldEntity> = {}): WorldEntity => ({
  id,
  categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
  name: id,
  summary: "",
  lifecycle: "live",
  ...over,
});

const group = (id: string, entityIds: string[]): WorldGroup => ({
  id,
  title: id,
  summary: "",
  entityIds,
});

describe("selectWorldBody", () => {
  it("loose = live + manual-draft, ungrouped; forge drafts hidden", () => {
    const entitiesById = {
      a: ent("a"),
      b: ent("b", { lifecycle: "draft" }), // manual draft (no sourceChatId) → visible
      c: ent("c", { lifecycle: "draft", sourceChatId: "chat1" }), // forge draft → hidden
    };
    const { groups, loose } = selectWorldBody(entitiesById, []);
    expect(groups).toEqual([]);
    expect(loose.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("grouped entities are excluded from loose", () => {
    const entitiesById = { a: ent("a"), b: ent("b") };
    const { groups, loose } = selectWorldBody(entitiesById, [group("g1", ["a"])]);
    expect(groups.map((g) => g.id)).toEqual(["g1"]);
    expect(loose.map((e) => e.id)).toEqual(["b"]);
  });

  it("hides a group whose only members are forge drafts", () => {
    const entitiesById = {
      d: ent("d", { lifecycle: "draft", sourceChatId: "c" }),
    };
    expect(selectWorldBody(entitiesById, [group("g", ["d"])]).groups).toEqual([]);
  });
});

describe("entityPending", () => {
  const rt = (over: Partial<RootState["runtime"]>): RootState["runtime"] =>
    ({
      activeRequest: null,
      queue: [],
      sega: { activeRequestIds: [] },
      ...over,
    }) as unknown as RootState["runtime"];

  it("true when active/queued/sega id matches; false otherwise", () => {
    expect(
      entityPending(rt({ activeRequest: { id: "lb-entity-x-content" } as never }), "x"),
    ).toBe(true);
    expect(
      entityPending(rt({ queue: [{ id: "se-entity-summary-x" } as never] }), "x"),
    ).toBe(true);
    expect(
      entityPending(rt({ sega: { activeRequestIds: ["lb-entity-x-keys"] } as never }), "x"),
    ).toBe(true);
    expect(entityPending(rt({ queue: [{ id: "other" } as never] }), "x")).toBe(false);
    expect(entityPending(rt({ activeRequest: { id: "lb-entity-x-content" } as never }), "y")).toBe(false);
  });
});

describe("entityBorderKind", () => {
  it("draft → draft (even if pending); live+pending → pending; live+idle → incomplete", () => {
    expect(entityBorderKind(ent("a", { lifecycle: "draft" }), true)).toBe("draft");
    expect(entityBorderKind(ent("a"), true)).toBe("pending");
    expect(entityBorderKind(ent("a"), false)).toBe("incomplete");
  });
});

describe("entityRequestIds", () => {
  it("lists the four entity request ids", () => {
    expect(entityRequestIds("x")).toEqual([
      "se-entity-summary-x",
      "entity-summary-bind-x",
      "lb-entity-x-content",
      "lb-entity-x-keys",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui-jsx/world-select.test.ts`
Expected: FAIL — cannot resolve `src/ui-jsx/panels/world/world-select` (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/ui-jsx/panels/world/world-select.ts`:

```ts
// Pure, framework-free selectors for the World display. Mirrors SUI
// SeWorldSection._selectBody and SeEntityCard's status logic, but store-only
// (no async lorebook reads this slice). Unit-tested headless — no icon imports.

import { isForgeDraft } from "../../../core/store/selectors/forge";
import type { RootState, WorldEntity, WorldGroup } from "../../../core/store";

/** Visible World body: threads with >=1 non-forge-draft member, plus loose
 *  (ungrouped, non-forge-draft) entities. Mirrors SUI _selectBody. */
export function selectWorldBody(
  entitiesById: Record<string, WorldEntity>,
  groups: WorldGroup[],
): { groups: WorldGroup[]; loose: WorldEntity[] } {
  const isVisibleMember = (id: string): boolean => {
    const e = entitiesById[id];
    return !!e && !isForgeDraft(e);
  };
  const visibleGroups = groups.filter((g) => g.entityIds.some(isVisibleMember));
  const grouped = new Set(groups.flatMap((g) => g.entityIds));
  const loose = Object.values(entitiesById).filter(
    (e) => !grouped.has(e.id) && !isForgeDraft(e),
  );
  return { groups: visibleGroups, loose };
}

/** The four request ids that represent in-flight work for an entity. */
export function entityRequestIds(entityId: string): string[] {
  return [
    `se-entity-summary-${entityId}`,
    `entity-summary-bind-${entityId}`,
    `lb-entity-${entityId}-content`,
    `lb-entity-${entityId}-keys`,
  ];
}

/** True while any of the entity's requests is active, queued, or SEGA-active. */
export function entityPending(
  runtime: RootState["runtime"],
  entityId: string,
): boolean {
  const ids = new Set(entityRequestIds(entityId));
  return (
    ids.has(runtime.activeRequest?.id ?? "") ||
    runtime.queue.some((q) => ids.has(q.id)) ||
    runtime.sega.activeRequestIds.some((id) => ids.has(id))
  );
}

export type BorderKind = "draft" | "pending" | "incomplete";

/** Store-only status border kind. Green "complete" (needs lorebook reads) is
 *  deferred to the entity-edit slice. */
export function entityBorderKind(
  entity: WorldEntity,
  pending: boolean,
): BorderKind {
  if (entity.lifecycle === "draft") return "draft";
  return pending ? "pending" : "incomplete";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui-jsx/world-select.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/world-select.ts tests/ui-jsx/world-select.test.ts
git add src/ui-jsx/panels/world/world-select.ts tests/ui-jsx/world-select.test.ts
git commit -m "feat(jsx): World display selectors + pure helpers"
```

---

### Task 2: `ConfirmButton.tsx` — shared arm→confirm button

**Files:**
- Create: `src/ui-jsx/components/ConfirmButton.tsx`

**Interfaces:**
- Consumes: `T` from `../style`; `Trash2`, `AlertTriangle` from `nai:icons/feather`.
- Produces: `ConfirmButton(props: { title: string; onConfirm: () => void; timeoutMs?: number })`.

> Specialized to destructive (trash) confirms — both current callers (entity discard, world clear) are trash. Idle shows Trash2; armed shows AlertTriangle. No render-test harness for components (repo JSX tests are pure-logic); verified by `npx tsc --noEmit` + Task 5's live pass.

- [ ] **Step 1: Write the component**

Create `src/ui-jsx/components/ConfirmButton.tsx`:

```tsx
// Two-click destructive confirm. First click arms (warning icon/color); a second
// click within timeoutMs fires onConfirm; otherwise it auto-resets. Uses
// api.v1.timers (no setTimeout in QuickJS). Mirrors SUI SuiConfirmButton.

import { T } from "../style";
import { Trash2, AlertTriangle } from "nai:icons/feather";

const ICON_SIZE = 16;

export function ConfirmButton(props: {
  title: string;
  onConfirm: () => void;
  timeoutMs?: number;
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      void api.v1.timers.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Clear any pending reset timer when the button unmounts.
  useEffect(() => () => clearTimer(), []);

  const onClick = async () => {
    if (armed) {
      clearTimer();
      setArmed(false);
      props.onConfirm();
      return;
    }
    setArmed(true);
    const id = await api.v1.timers.setTimeout(() => {
      timerRef.current = null;
      setArmed(false);
    }, props.timeoutMs ?? 4000);
    timerRef.current = id;
  };

  return (
    <button
      title={armed ? `${props.title}? Click again to confirm` : props.title}
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: armed ? T.warning : T.text,
        opacity: armed ? 1 : 0.6,
      }}
    >
      {armed ? <AlertTriangle size={ICON_SIZE} /> : <Trash2 size={ICON_SIZE} />}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Format + commit**

```bash
npx prettier -w src/ui-jsx/components/ConfirmButton.tsx
git add src/ui-jsx/components/ConfirmButton.tsx
git commit -m "feat(jsx): shared arm→confirm trash button"
```

---

### Task 3: `EntityCard.tsx` — entity card

**Files:**
- Create: `src/ui-jsx/panels/world/EntityCard.tsx`
- Modify: `src/ui-jsx/style.ts` (add `lowIntensity` token)

**Interfaces:**
- Consumes: `useSlice` from `../../bridge`; `T`, `SP` from `../../style`; `store`, `entityDiscardRequested` (from `../../../core/store` barrel — re-exported), `entityRegenRequested` from `../../../core/store/effects/summary-generation`; `entityPending`, `entityBorderKind`, `type BorderKind` from `./world-select`; `ConfirmButton` from `../../components/ConfirmButton`; `User`, `Cpu`, `MapPin`, `Shield`, `Activity`, `Hash`, `Zap` from `nai:icons/feather`.
- Produces: `EntityCard(props: { entityId: string })`.

> `entityDiscardRequested` is re-exported from the `core/store` barrel (it lives in `effects/forge-chat-effects`, which the barrel re-exports); `entityRegenRequested` is NOT in the barrel — import it from `../../../core/store/effects/summary-generation`. Verified by `npx tsc --noEmit`; behavior in Task 5's live pass.

- [ ] **Step 1: Add the `lowIntensity` theme token**

In `src/ui-jsx/style.ts`, add one line to the `T` object (after `midIntensity`):

```ts
  // Cool accent for "draft" entity borders (not-yet-live).
  lowIntensity: "var(--theme-low-intensity)",
```

- [ ] **Step 2: Write the component**

Create `src/ui-jsx/panels/world/EntityCard.tsx`:

```tsx
// One entity card: category icon + name (non-interactive — edit deferred) +
// collapsible summary (follows ui.worldExpanded) + store-only status border.
// Live cards show a regen bolt that dims while pending; draft cards show a
// discard confirm. Name-click editing and the green "complete" border are
// deferred to the entity-edit slice.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, entityDiscardRequested } from "../../../core/store";
import { entityRegenRequested } from "../../../core/store/effects/summary-generation";
import { entityPending, entityBorderKind, type BorderKind } from "./world-select";
import { ConfirmButton } from "../../components/ConfirmButton";
import { User, Cpu, MapPin, Shield, Activity, Hash, Zap } from "nai:icons/feather";

const ICON_SIZE = 16;

// All feather icons share one component type; deriving from `User` keeps the map
// values valid JSX elements (a `(props) => unknown` type would fail `<Icon/>`).
const CATEGORY_ICON: Record<string, typeof User> = {
  dramatisPersonae: User,
  universeSystems: Cpu,
  locations: MapPin,
  factions: Shield,
  situationalDynamics: Activity,
  topics: Hash,
};

function borderColor(kind: BorderKind): string {
  if (kind === "draft") return T.lowIntensity;
  if (kind === "pending") return T.warning;
  return T.textDisabled;
}

export function EntityCard(props: { entityId: string }) {
  const { entityId } = props;
  const entity = useSlice((s) => s.world.entitiesById[entityId]);
  const worldExpanded = useSlice((s) => s.ui.worldExpanded ?? true);
  const pending = useSlice((s) => entityPending(s.runtime, entityId));

  if (!entity) return null;

  const kind = entityBorderKind(entity, pending);
  const Icon = CATEGORY_ICON[entity.categoryId];
  const isDraft = entity.lifecycle === "draft";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderLeft: `2px solid ${borderColor(kind)}`,
        borderRadius: "2px",
        paddingLeft: SP.sm,
        background: T.bg2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: SP.sm }}>
        {Icon ? <Icon size={ICON_SIZE} /> : null}
        <span style={{ flex: 1, color: T.text }}>{entity.name || "(unnamed)"}</span>
        {isDraft ? (
          <ConfirmButton
            title="Discard entity"
            onConfirm={() => store.dispatch(entityDiscardRequested({ entityId }))}
          />
        ) : (
          <button
            title={pending ? "Generating…" : "Generate"}
            disabled={pending}
            onClick={() => {
              if (!pending) store.dispatch(entityRegenRequested({ entityId }));
            }}
            style={{
              background: "none",
              border: "none",
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.4 : 1,
            }}
          >
            <Zap size={ICON_SIZE} />
          </button>
        )}
      </div>
      {worldExpanded && entity.summary ? (
        <div
          style={{
            fontSize: "0.82em",
            opacity: 0.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: "0 8px 4px",
            color: T.text,
          }}
        >
          {entity.summary}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `nai:icons/feather` lacks a PascalCase name used here, check the nibs feather export names and adjust the import — the names map from feather kebab-case: `map-pin`→`MapPin`, `trash-2`→`Trash2`, etc.)

- [ ] **Step 4: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/EntityCard.tsx src/ui-jsx/style.ts
git add src/ui-jsx/panels/world/EntityCard.tsx src/ui-jsx/style.ts
git commit -m "feat(jsx): World entity card (store-only border, regen/discard)"
```

---

### Task 4: `ThreadItem.tsx` — thread card + member cards

**Files:**
- Create: `src/ui-jsx/panels/world/ThreadItem.tsx`

**Interfaces:**
- Consumes: `useSlice` from `../../bridge`; `T`, `SP` from `../../style`; `store`, `groupDeleted` from `../../../core/store`; `isForgeDraft` from `../../../core/store/selectors/forge`; `EntityCard` from `./EntityCard`; `Layers`, `Trash2`, `ToggleLeft` from `nai:icons/feather`.
- Produces: `ThreadItem(props: { groupId: string })`.

> Verified by `npx tsc --noEmit`; behavior in Task 5's live pass.

- [ ] **Step 1: Write the component**

Create `src/ui-jsx/panels/world/ThreadItem.tsx`:

```tsx
// One Thread card: layers icon + title (non-interactive — edit deferred) +
// disabled lorebook toggle (deferred) + immediate delete + member entity cards.
// Members exclude forge drafts (they render in their forge chat). worldExpanded
// drives each member card's summary; the member list itself always shows.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, groupDeleted } from "../../../core/store";
import { isForgeDraft } from "../../../core/store/selectors/forge";
import { EntityCard } from "./EntityCard";
import { Layers, Trash2, ToggleLeft } from "nai:icons/feather";

const ICON_SIZE = 16;

export function ThreadItem(props: { groupId: string }) {
  const { groupId } = props;
  const group = useSlice((s) => s.world.groups.find((g) => g.id === groupId));
  const entitiesById = useSlice((s) => s.world.entitiesById);

  if (!group) return null;

  const memberIds = group.entityIds.filter((id) => {
    const e = entitiesById[id];
    return !!e && !isForgeDraft(e);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SP.sm,
          padding: SP.sm,
          background: T.bg2,
        }}
      >
        <Layers size={ICON_SIZE} />
        <span style={{ flex: 1, color: T.textHeadings }}>
          {group.title || "New Thread"}
        </span>
        {/* Deferred: thread lorebook sync — shown disabled. */}
        <button
          title="Lorebook sync (coming soon)"
          disabled
          style={{ background: "none", border: "none", cursor: "default", opacity: 0.35 }}
        >
          <ToggleLeft size={ICON_SIZE} />
        </button>
        <button
          title="Delete thread"
          onClick={() => store.dispatch(groupDeleted({ groupId }))}
          style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}
        >
          <Trash2 size={ICON_SIZE} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: SP.xs, paddingLeft: SP.sm }}>
        {memberIds.map((id) => (
          <EntityCard key={`${groupId}:${id}`} entityId={id} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/ThreadItem.tsx
git add src/ui-jsx/panels/world/ThreadItem.tsx
git commit -m "feat(jsx): World thread item + member cards"
```

---

### Task 5: `World.tsx` section + App integration

**Files:**
- Create: `src/ui-jsx/panels/world/World.tsx`
- Modify: `src/ui-jsx/App.tsx`

**Interfaces:**
- Consumes: `useSlice` from `../../bridge`; `T`, `SP` from `../../style`; `store`, `segaToggled`, `worldExpansionSet`, `worldCleared` from `../../../core/store`; `selectWorldBody` from `./world-select`; `ThreadItem` from `./ThreadItem`; `EntityCard` from `./EntityCard`; `ConfirmButton` from `../../components/ConfirmButton`; `Globe`, `Layers`, `Plus`, `PlayCircle`, `FastForward`, `Minimize2`, `Maximize2` from `nai:icons/feather`. `useState` is a runtime global.
- Produces: `World()`.

> Verified by `npx tsc --noEmit` + `npm test`; then Task 5's manual harness pass (CONTROLLER + user — the implementer stops after the build step).

- [ ] **Step 1: Write the World section**

Create `src/ui-jsx/panels/world/World.tsx`:

```tsx
// World section: header (World + globe, section-collapse, expand/collapse-all,
// SEGA start/stop, disabled add-entity/add-thread, clear-confirm) + body
// (Threads then loose entity cards). Body recomputed in render via
// selectWorldBody from store-owned refs. Creation + editing are deferred, so
// add-entity/add-thread render disabled.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, segaToggled, worldExpansionSet, worldCleared } from "../../../core/store";
import { selectWorldBody } from "./world-select";
import { ThreadItem } from "./ThreadItem";
import { EntityCard } from "./EntityCard";
import { ConfirmButton } from "../../components/ConfirmButton";
import { Globe, Layers, Plus, PlayCircle, FastForward, Minimize2, Maximize2 } from "nai:icons/feather";

const ICON_SIZE = 16;
const ICON_BTN = { background: "none", border: "none", cursor: "pointer", opacity: 0.6 } as const;
const DISABLED_BTN = { background: "none", border: "none", cursor: "default", opacity: 0.35 } as const;

export function World() {
  const entitiesById = useSlice((s) => s.world.entitiesById);
  const groups = useSlice((s) => s.world.groups);
  const worldExpanded = useSlice((s) => s.ui.worldExpanded ?? true);
  const segaRunning = useSlice((s) => s.runtime.segaRunning);
  const [collapsed, setCollapsed] = useState(false);

  const { groups: visibleGroups, loose } = selectWorldBody(entitiesById, groups);
  const isEmpty = visibleGroups.length === 0 && loose.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: SP.sm,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.textHeadings,
            padding: 0,
          }}
        >
          <Globe size={ICON_SIZE} />
          <span style={{ fontWeight: "bold" }}>World</span>
        </button>
        <button
          title={worldExpanded ? "Collapse all" : "Expand all"}
          onClick={() => store.dispatch(worldExpansionSet({ expanded: !worldExpanded }))}
          style={ICON_BTN}
        >
          {worldExpanded ? <Minimize2 size={ICON_SIZE} /> : <Maximize2 size={ICON_SIZE} />}
        </button>
        <button
          title="S.E.G.A."
          onClick={() => store.dispatch(segaToggled())}
          style={{ ...ICON_BTN, color: segaRunning ? T.warning : T.text }}
        >
          {segaRunning ? <FastForward size={ICON_SIZE} /> : <PlayCircle size={ICON_SIZE} />}
        </button>
        {/* Deferred: creation — shown disabled. */}
        <button title="Add entity (coming soon)" disabled style={DISABLED_BTN}>
          <Plus size={ICON_SIZE} />
        </button>
        <button title="Add thread (coming soon)" disabled style={DISABLED_BTN}>
          <Layers size={ICON_SIZE} />
        </button>
        <ConfirmButton title="Clear world" onConfirm={() => store.dispatch(worldCleared())} />
      </div>

      {!collapsed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
          {visibleGroups.map((g) => (
            <ThreadItem key={g.id} groupId={g.id} />
          ))}
          {loose.map((e) => (
            <EntityCard key={e.id} entityId={e.id} />
          ))}
          {isEmpty ? (
            <div style={{ color: T.textDisabled, fontSize: "0.85em", padding: SP.sm }}>
              No world entities yet.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Render `<World/>` under `<Foundation/>` in App**

In `src/ui-jsx/App.tsx`: add the import near the Foundation import (line ~4):

```tsx
import { World } from "./panels/world/World";
```

Then replace the Story Engine tab's body (the `else` branch that renders `<Foundation />` inside the `overflow: auto` box) with a stacked column:

```tsx
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: SP.md }}>
          <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
            <Foundation />
            <World />
          </div>
        </div>
      )}
```

(The existing branch wraps only `<Foundation />` in the scroll box — wrap both in an inner column. Do not change the tab shell, tab-switch effects, or the Chat branch.)

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: PASS — all suites including `tests/ui-jsx/world-select.test.ts`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript` with no errors.

- [ ] **Step 5: Manual harness verification** — CONTROLLER + USER ONLY, not the implementer.

(For reference — the controller runs this with the user. The implementer stops after Step 4.) In NovelAI, Story Engine (JSX) tab, with a world that has entities/threads (side-by-side with SUI): World section renders below Foundation; Threads show their member cards; loose live entities render; category icons + summaries show; draft cards show blue border + discard-confirm; live cards show grey/orange border + regen bolt (dims while pending); expand/collapse-all toggles summaries; section title collapses the body; SEGA toggles play/fast-forward + orange; clear + discard arm→confirm; add-entity/add-thread/thread-lorebook render disabled/inert; names are non-clickable.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/World.tsx src/ui-jsx/App.tsx
git add src/ui-jsx/panels/world/World.tsx src/ui-jsx/App.tsx
git commit -m "feat(jsx): World section + stack under Foundation in Story Engine tab"
```

---

## Self-Review Notes

- **Spec coverage:** selectWorldBody/entityPending/entityBorderKind + tests (Task 1); ConfirmButton via api.v1.timers (Task 2); EntityCard store-only border + regen/discard + non-interactive name (Task 3); ThreadItem + members + disabled lorebook toggle + immediate delete (Task 4); World section (SEGA/expand-collapse/clear/disabled add) + App stacking (Task 5). Store-only border, shown-disabled deferrals, theme-token colors, keys on lists — all covered.
- **Type consistency:** `BorderKind`, `selectWorldBody`, `entityPending`, `entityBorderKind` defined in Task 1 and consumed unchanged in Tasks 3/5; `ConfirmButton` props (`title`, `onConfirm`, `timeoutMs?`) defined in Task 2 and used in Tasks 3/5; `EntityCard({entityId})` / `ThreadItem({groupId})` signatures consistent across Tasks 3/4/5.
- **Placeholders:** none — every code step is complete. Icon-name caveat (feather PascalCase) is noted inline in Task 3.
