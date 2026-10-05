# JSX Foundation Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the JSX Story Engine tab's Foundation panel to full parity with SUI's `SeFoundationSection` — all six fields (Intensity, Shape, Intent, Contract, ATTG, Style) with a generating indicator on every zap.

**Architecture:** Replace the single `src/ui-jsx/panels/Foundation.tsx` with a focused `src/ui-jsx/panels/foundation/` folder. The five card-fields are driven by one config table (`fields.ts`) rendered through a generic `FieldCard`; Intensity is a bespoke picker. Pure helpers (contract parse/format, generating selector) are unit-tested; components are typecheck-gated. No store/effect/prompt changes — every action and runtime field already exists.

**Tech Stack:** TypeScript (strict), Preact-style JSX (`h`/`Fragment` NAI-runtime globals, `jsxFactory: h`), nai-store, vitest, nibs build.

## Global Constraints

- **No store/effect/prompt/slice changes.** Pure UI parity. All actions consumed already exist in the store barrel `src/core/store`.
- **Colors: theme tokens only.** Use `T.*` from `src/ui-jsx/style.ts` — no static hex literals. If a needed color has no token, add it to `style.ts`.
- **No DOM APIs.** QuickJS worker: no `setTimeout`/`console.log`; use `api.v1.*`. `api` is a runtime global.
- **Textareas are uncontrolled.** Seed display via child text (not a `value` attribute); track edits via `onInput`. Seed from the committed store value (`useDraftField`).
- **Icon size** in cards: `ICON_SIZE = 16`. Spacing via `SP` tokens.
- **Typecheck gate:** `npx tsc --noEmit` (currently passes clean). **Logic tests:** `npm test` / `npx vitest run <file>`.
- **Format** before committing UI files: `npx prettier -w <files>`.
- **No version bump / CHANGELOG** here — mid-branch UI parity work; App behavior is additive. (Leave `project.yaml` version alone.)

## File Structure

- Create `src/ui-jsx/panels/foundation/fields.ts` — types, `INTENSITY_LEVELS`, pure helpers (`parseContract`, `formatContract`, `isFoundationGenerating`), `syncMemory`, and the `FIELD_DESCRIPTORS` table.
- Create `src/ui-jsx/panels/foundation/FieldEditor.tsx` — single/titled textarea edit pane.
- Create `src/ui-jsx/panels/foundation/FieldCard.tsx` — generic card (label, display, Edit/Zap/optional Sync), generating-aware zap.
- Create `src/ui-jsx/panels/foundation/IntensityPicker.tsx` — 5-level picker + description.
- Create `src/ui-jsx/panels/foundation/Foundation.tsx` — orchestrator (editing state machine, renders picker + mapped cards).
- Modify `src/ui-jsx/App.tsx:4` — import path `./panels/Foundation` → `./panels/foundation/Foundation`.
- Delete `src/ui-jsx/panels/Foundation.tsx` (superseded).
- Create `tests/ui-jsx/foundation-fields.test.ts` — unit tests for the pure helpers.

---

### Task 1: `fields.ts` — config table + pure helpers (TDD)

**Files:**
- Create: `src/ui-jsx/panels/foundation/fields.ts`
- Test: `tests/ui-jsx/foundation-fields.test.ts`

**Interfaces:**
- Consumes: store barrel `../../../core/store` — actions `shapeUpdated`, `intentUpdated`, `contractUpdated`, `attgUpdated`, `styleUpdated`, `attgSyncToggled`, `styleSyncToggled`, `shapeGenerationRequested`, `intentGenerationRequested`, `contractGenerationRequested`, `attgGenerationRequested`, `styleGenerationRequested`; types `RootState`, `ContractData`; `store`.
- Produces:
  - `type FoundationFieldId = "shape" | "intent" | "contract" | "attg" | "style"`
  - `type FieldDraft = { title: string; content: string }`
  - `type FieldDescriptor` (shape below)
  - `INTENSITY_LEVELS: { level: string; description: string }[]`
  - `parseContract(text: string): ContractData | null`
  - `formatContract(c: ContractData | null): string`
  - `isFoundationGenerating(s: RootState, fieldId: FoundationFieldId): boolean`
  - `syncMemory(): Promise<void>`
  - `FIELD_DESCRIPTORS: FieldDescriptor[]`

- [ ] **Step 1: Write the failing test**

Create `tests/ui-jsx/foundation-fields.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseContract,
  formatContract,
  isFoundationGenerating,
  INTENSITY_LEVELS,
  FIELD_DESCRIPTORS,
} from "../../src/ui-jsx/panels/foundation/fields";
import type { RootState } from "../../src/core/store";

describe("foundation fields — contract parse/format", () => {
  it("parses a full REQUIRED/PROHIBITED/EMPHASIS block", () => {
    const text = "REQUIRED: a\nPROHIBITED: b\nEMPHASIS: c";
    expect(parseContract(text)).toEqual({
      required: "a",
      prohibited: "b",
      emphasis: "c",
    });
  });

  it("returns null for blank/whitespace input", () => {
    expect(parseContract("")).toBeNull();
    expect(parseContract("   \n\t ")).toBeNull();
  });

  it("fills missing lines with empty strings", () => {
    expect(parseContract("REQUIRED: only this")).toEqual({
      required: "only this",
      prohibited: "",
      emphasis: "",
    });
  });

  it("formatContract of null is empty string", () => {
    expect(formatContract(null)).toBe("");
  });

  it("format→parse round-trips a filled contract", () => {
    const c = { required: "x", prohibited: "y", emphasis: "z" };
    expect(parseContract(formatContract(c))).toEqual(c);
  });
});

describe("foundation fields — generating selector", () => {
  const base = (
    queue: Array<{ type: string; targetId: string }>,
    active: { type: string; targetId: string } | null,
  ) =>
    ({
      runtime: { queue, activeRequest: active },
    }) as unknown as RootState;

  it("true when a queued request matches the field", () => {
    const s = base([{ type: "foundation", targetId: "attg" }], null);
    expect(isFoundationGenerating(s, "attg")).toBe(true);
    expect(isFoundationGenerating(s, "style")).toBe(false);
  });

  it("true when the active request matches the field", () => {
    const s = base([], { type: "foundation", targetId: "shape" });
    expect(isFoundationGenerating(s, "shape")).toBe(true);
    expect(isFoundationGenerating(s, "intent")).toBe(false);
  });

  it("false when nothing matches", () => {
    const s = base([{ type: "list", targetId: "attg" }], null);
    expect(isFoundationGenerating(s, "attg")).toBe(false);
  });
});

describe("foundation fields — descriptors", () => {
  it("has exactly the five card-fields in SUI order", () => {
    expect(FIELD_DESCRIPTORS.map((d) => d.id)).toEqual([
      "shape",
      "intent",
      "contract",
      "attg",
      "style",
    ]);
  });

  it("shape is titled and generate-only; attg/style carry sync", () => {
    const byId = Object.fromEntries(FIELD_DESCRIPTORS.map((d) => [d.id, d]));
    expect(byId.shape.titled).toBe(true);
    expect(byId.shape.hasRefine).toBe(false);
    expect(byId.attg.hasSync).toBe(true);
    expect(byId.style.hasSync).toBe(true);
    expect(byId.intent.hasRefine).toBe(true);
  });

  it("INTENSITY_LEVELS lists Cozy…Nightmare", () => {
    expect(INTENSITY_LEVELS.map((l) => l.level)).toEqual([
      "Cozy",
      "Grounded",
      "Gritty",
      "Noir",
      "Nightmare",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui-jsx/foundation-fields.test.ts`
Expected: FAIL — cannot resolve `src/ui-jsx/panels/foundation/fields` (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/ui-jsx/panels/foundation/fields.ts`:

```ts
// Config-driven Foundation field table + pure helpers. Drives the five
// card-fields (Shape, Intent, Contract, ATTG, Style); Intensity has its own
// component. The pure helpers (parseContract / formatContract /
// isFoundationGenerating) are framework-free and unit-tested; the descriptors
// close over store dispatch, mirroring SUI's SeFoundationSection.

import {
  store,
  shapeUpdated,
  intentUpdated,
  contractUpdated,
  attgUpdated,
  styleUpdated,
  attgSyncToggled,
  styleSyncToggled,
  shapeGenerationRequested,
  intentGenerationRequested,
  contractGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
  type RootState,
  type ContractData,
} from "../../../core/store";

export type FoundationFieldId =
  | "shape"
  | "intent"
  | "contract"
  | "attg"
  | "style";

export type IntensityLevelDef = { level: string; description: string };

// Same five levels + copy as SUI's SeFoundationSection.INTENSITY_LEVELS.
export const INTENSITY_LEVELS: IntensityLevelDef[] = [
  {
    level: "Cozy",
    description:
      "Safe, warm, low stakes — threats are social or emotional, no one is in real danger.",
  },
  {
    level: "Grounded",
    description:
      "Real-world friction and consequences; setbacks matter but survival is assumed.",
  },
  {
    level: "Gritty",
    description:
      "Serious harm is possible; moral compromise is common; comfort is earned, not given.",
  },
  {
    level: "Noir",
    description:
      "No clean exits; moral corruption is systemic; characters pay real prices for their choices.",
  },
  {
    level: "Nightmare",
    description:
      "High lethality, psychological extremity; no guaranteed safety for anyone.",
  },
];

/** Parse a REQUIRED/PROHIBITED/EMPHASIS block into ContractData, or null if
 *  blank. Missing lines become empty strings (matches SUI's regex behavior). */
export function parseContract(text: string): ContractData | null {
  if (!text.trim()) return null;
  const required = text.match(/^REQUIRED:\s*(.+)$/m)?.[1]?.trim() || "";
  const prohibited = text.match(/^PROHIBITED:\s*(.+)$/m)?.[1]?.trim() || "";
  const emphasis = text.match(/^EMPHASIS:\s*(.+)$/m)?.[1]?.trim() || "";
  return { required, prohibited, emphasis };
}

/** Format ContractData as the editable REQUIRED/PROHIBITED/EMPHASIS block. */
export function formatContract(c: ContractData | null): string {
  if (!c) return "";
  return `REQUIRED: ${c.required}\nPROHIBITED: ${c.prohibited}\nEMPHASIS: ${c.emphasis}`;
}

/** Human-readable, one-part-per-line contract text for the card display. */
function displayContract(c: ContractData | null): string {
  if (!c) return "";
  return `Required: ${c.required}\nProhibited: ${c.prohibited}\nEmphasis: ${c.emphasis}`;
}

/** True while a foundation request for `fieldId` is queued or active.
 *  Mirrors SUI's foundationProjection. */
export function isFoundationGenerating(
  s: RootState,
  fieldId: FoundationFieldId,
): boolean {
  const inQueue = s.runtime.queue.some(
    (r) => r.type === "foundation" && r.targetId === fieldId,
  );
  const active =
    s.runtime.activeRequest?.type === "foundation" &&
    s.runtime.activeRequest.targetId === fieldId;
  return inQueue || active;
}

/** Push ATTG→Memory / Style→A.N. when their sync toggles are on. */
export async function syncMemory(): Promise<void> {
  const { attg, style, attgSyncEnabled, styleSyncEnabled } =
    store.getState().foundation;
  if (attgSyncEnabled) await api.v1.memory.set(attg.trim());
  if (styleSyncEnabled) await api.v1.an.set(style.trim());
}

export type FieldDraft = { title: string; content: string };

export type FieldDescriptor = {
  id: FoundationFieldId;
  label: string;
  titled?: boolean; // Shape only — editor shows a title input
  hasRefine: boolean; // false for Shape (generate-only)
  hasSync?: boolean; // ATTG, Style
  cardLabel: (s: RootState) => string; // Shape shows the shape name
  display: (s: RootState) => string; // derived card text
  seed: (s: RootState) => FieldDraft; // opens the editor
  commit: (draft: FieldDraft) => void; // dispatch + (attg/style) sync
  generate: () => void; // dispatch <field>GenerationRequested
  refineSource: (s: RootState) => string; // text handed to refine
  placeholder: string;
  titlePlaceholder?: string;
  syncEnabled?: (s: RootState) => boolean;
  toggleSync?: () => void;
};

export const FIELD_DESCRIPTORS: FieldDescriptor[] = [
  {
    id: "shape",
    label: "Shape",
    titled: true,
    hasRefine: false,
    cardLabel: (s) => s.foundation.shape?.name || "Shape",
    display: (s) => s.foundation.shape?.description ?? "",
    seed: (s) => ({
      title: s.foundation.shape?.name ?? "",
      content: s.foundation.shape?.description ?? "",
    }),
    commit: ({ title, content }) =>
      store.dispatch(
        shapeUpdated({
          shape:
            title || content
              ? { name: title || "STORY", description: content }
              : null,
        }),
      ),
    generate: () => store.dispatch(shapeGenerationRequested()),
    refineSource: (s) => s.foundation.shape?.description ?? "",
    placeholder:
      "Shape description — what structural moments this story leans toward.",
    titlePlaceholder: "e.g. Slice of Life, Tragedy, Heist…",
  },
  {
    id: "intent",
    label: "Intent",
    hasRefine: true,
    cardLabel: () => "Intent",
    display: (s) => s.foundation.intent,
    seed: (s) => ({ title: "", content: s.foundation.intent }),
    commit: ({ content }) => store.dispatch(intentUpdated({ intent: content })),
    generate: () => store.dispatch(intentGenerationRequested()),
    refineSource: (s) => s.foundation.intent,
    placeholder: "What is this story about? What do you want to explore?",
  },
  {
    id: "contract",
    label: "Story Contract",
    hasRefine: true,
    cardLabel: () => "Story Contract",
    display: (s) => displayContract(s.foundation.contract),
    seed: (s) => ({ title: "", content: formatContract(s.foundation.contract) }),
    commit: ({ content }) =>
      store.dispatch(contractUpdated({ contract: parseContract(content) })),
    generate: () => store.dispatch(contractGenerationRequested()),
    refineSource: (s) => formatContract(s.foundation.contract),
    placeholder: "REQUIRED: ...\nPROHIBITED: ...\nEMPHASIS: ...",
  },
  {
    id: "attg",
    label: "ATTG (Memory)",
    hasRefine: true,
    hasSync: true,
    cardLabel: () => "ATTG (Memory)",
    display: (s) => s.foundation.attg,
    seed: (s) => ({ title: "", content: s.foundation.attg }),
    commit: ({ content }) => {
      store.dispatch(attgUpdated({ attg: content }));
      void syncMemory();
    },
    generate: () => store.dispatch(attgGenerationRequested()),
    refineSource: (s) => s.foundation.attg,
    placeholder: "Author, Title, Tags, Genre…",
    syncEnabled: (s) => s.foundation.attgSyncEnabled,
    toggleSync: () => {
      store.dispatch(attgSyncToggled());
      void syncMemory();
    },
  },
  {
    id: "style",
    label: "Style (Author's Note)",
    hasRefine: true,
    hasSync: true,
    cardLabel: () => "Style (Author's Note)",
    display: (s) => s.foundation.style,
    seed: (s) => ({ title: "", content: s.foundation.style }),
    commit: ({ content }) => {
      store.dispatch(styleUpdated({ style: content }));
      void syncMemory();
    },
    generate: () => store.dispatch(styleGenerationRequested()),
    refineSource: (s) => s.foundation.style,
    placeholder: "Writing style, tone, prose directives…",
    syncEnabled: (s) => s.foundation.styleSyncEnabled,
    toggleSync: () => {
      store.dispatch(styleSyncToggled());
      void syncMemory();
    },
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui-jsx/foundation-fields.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/foundation/fields.ts tests/ui-jsx/foundation-fields.test.ts
git add src/ui-jsx/panels/foundation/fields.ts tests/ui-jsx/foundation-fields.test.ts
git commit -m "feat(jsx): Foundation field config table + pure helpers"
```

---

### Task 2: `FieldEditor.tsx` — single/titled edit pane

**Files:**
- Create: `src/ui-jsx/panels/foundation/FieldEditor.tsx`

**Interfaces:**
- Consumes: `useDraftField` from `../../hooks`; `T`, `SP` from `../../style`; `ArrowLeft` from `nai:icons/feather`; `FieldDraft` from `./fields`.
- Produces: `FieldEditor(props: FieldEditorProps)` where
  ```ts
  type FieldEditorProps = {
    label: string;
    titled?: boolean;
    initialTitle: string;
    initialContent: string;
    placeholder: string;
    titlePlaceholder?: string;
    onCommit: (draft: FieldDraft) => void;
    onBack: () => void;
  };
  ```

> No render-test harness exists for JSX components in this repo (tests are pure-logic). This task is verified by `npx tsc --noEmit`; behavior is checked in the harness during Task 5's manual verification.

- [ ] **Step 1: Write the component**

Create `src/ui-jsx/panels/foundation/FieldEditor.tsx`:

```tsx
// Foundation edit pane. Generalizes the original single-textarea editor to an
// optional title input (Shape's name + description). Uncontrolled textareas:
// child text seeds the display from the committed store value; onInput tracks
// edits via useDraftField. Save hands back a { title, content } draft.

import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import { ArrowLeft } from "nai:icons/feather";
import type { FieldDraft } from "./fields";

const ICON_SIZE = 16;

type FieldEditorProps = {
  label: string;
  titled?: boolean;
  initialTitle: string;
  initialContent: string;
  placeholder: string;
  titlePlaceholder?: string;
  onCommit: (draft: FieldDraft) => void;
  onBack: () => void;
};

export function FieldEditor(props: FieldEditorProps) {
  const title = useDraftField(props.initialTitle);
  const content = useDraftField(props.initialContent);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      {/* Header row: [← Back] title [Save] */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          title="Back"
          onClick={props.onBack}
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
          {props.label}
        </span>
        <button
          onClick={() =>
            props.onCommit({
              title: title.value.trim(),
              content: content.value.trim(),
            })
          }
          style={{ padding: "4px 16px" }}
        >
          Save
        </button>
      </div>

      {props.titled ? (
        <input
          placeholder={props.titlePlaceholder ?? ""}
          value={props.initialTitle}
          onInput={(e) => title.setValue(e.target.value ?? "")}
          style={{
            background: T.bg2,
            color: T.text,
            fontFamily: T.fontDefault,
            padding: SP.md,
            border: "none",
          }}
        />
      ) : null}

      <textarea
        placeholder={props.placeholder}
        rows={6}
        onInput={(e) => content.setValue(e.target.value ?? "")}
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
          border: "none",
          resize: "vertical",
        }}
      >
        {props.initialContent}
      </textarea>
    </div>
  );
}
```

> Note: the `<input>` uses `value={initialTitle}` because a single-line input DOES honor the `value` attribute in the NAI renderer (unlike `<textarea>`, which must seed via child text). `onInput` tracks edits; the committed `initialTitle` re-seed on reopen is correct. Keep the `<textarea>` seeding via child text per the documented quirk.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/foundation/FieldEditor.tsx
git add src/ui-jsx/panels/foundation/FieldEditor.tsx
git commit -m "feat(jsx): titled Foundation field editor"
```

---

### Task 3: `FieldCard.tsx` — generic card with generating-aware zap

**Files:**
- Create: `src/ui-jsx/panels/foundation/FieldCard.tsx`

**Interfaces:**
- Consumes: `useSlice` from `../../bridge`; `T`, `SP` from `../../style`; `Zap`, `Edit`, `ToggleLeft`, `ToggleRight` from `nai:icons/feather`; `store`, `uiChatRefineRequested` from `../../../core/store`; `decideFieldAction` from `../chat/chat-actions`; `FieldDescriptor`, `isFoundationGenerating` from `./fields`.
- Produces: `FieldCard(props: { descriptor: FieldDescriptor; onEdit: () => void })`.

> Verified by `npx tsc --noEmit`; behavior checked in Task 5's manual harness pass.

- [ ] **Step 1: Write the component**

Create `src/ui-jsx/panels/foundation/FieldCard.tsx`:

```tsx
// One Foundation field row: label + derived display text + an actions row
// (optional Sync toggle, Zap, Edit). The Zap adapts: empty field generates,
// filled field refines (decideFieldAction), except Shape which is generate-only
// (descriptor.hasRefine === false). While a matching foundation request is
// queued/active the Zap is disabled and dimmed. All differences come from the
// descriptor — one render path.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { Zap, Edit, ToggleLeft, ToggleRight } from "nai:icons/feather";
import { store, uiChatRefineRequested } from "../../../core/store";
import { decideFieldAction } from "../chat/chat-actions";
import { type FieldDescriptor, isFoundationGenerating } from "./fields";

const ICON_SIZE = 16;

export function FieldCard(props: { descriptor: FieldDescriptor; onEdit: () => void }) {
  const d = props.descriptor;
  const label = useSlice((s) => d.cardLabel(s));
  const value = useSlice((s) => d.display(s));
  const generating = useSlice((s) => isFoundationGenerating(s, d.id));
  const syncEnabled = useSlice((s) => (d.syncEnabled ? d.syncEnabled(s) : false));

  const onZap = () => {
    if (generating) return;
    if (!d.hasRefine) {
      d.generate();
      return;
    }
    const text = d.refineSource(store.getState());
    if (decideFieldAction(text) === "generate") {
      d.generate();
    } else {
      store.dispatch(
        uiChatRefineRequested({ fieldId: d.id, sourceText: text }),
      );
    }
  };

  return (
    <div
      style={{
        background: T.bg2,
        color: T.text,
        fontFamily: T.fontDefault,
        padding: SP.md,
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: T.textHeadings }}>{label}</span>
        <div style={{ display: "flex", gap: SP.sm }}>
          {d.hasSync ? (
            <button
              title="Sync to Memory / A.N."
              onClick={() => d.toggleSync?.()}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {syncEnabled ? (
                <ToggleRight size={ICON_SIZE} color={T.midIntensity} />
              ) : (
                <ToggleLeft size={ICON_SIZE} style={{ opacity: 0.45 }} />
              )}
            </button>
          ) : null}
          <button
            title={generating ? "Generating…" : "Generate"}
            onClick={onZap}
            disabled={generating}
            style={{
              background: "none",
              border: "none",
              cursor: generating ? "default" : "pointer",
              opacity: generating ? 0.4 : 1,
            }}
          >
            <Zap size={ICON_SIZE} />
          </button>
          <button
            title="Edit"
            onClick={props.onEdit}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <Edit size={ICON_SIZE} />
          </button>
        </div>
      </div>
      <div
        style={{
          whiteSpace: "pre-wrap",
          color: value ? T.text : T.textDisabled,
        }}
      >
        {value || "(empty)"}
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
npx prettier -w src/ui-jsx/panels/foundation/FieldCard.tsx
git add src/ui-jsx/panels/foundation/FieldCard.tsx
git commit -m "feat(jsx): generic Foundation field card + generating zap"
```

---

### Task 4: `IntensityPicker.tsx` — level picker

**Files:**
- Create: `src/ui-jsx/panels/foundation/IntensityPicker.tsx`

**Interfaces:**
- Consumes: `useSlice` from `../../bridge`; `T`, `SP` from `../../style`; `store`, `intensityUpdated` from `../../../core/store`; `INTENSITY_LEVELS` from `./fields`.
- Produces: `IntensityPicker()`.

> Verified by `npx tsc --noEmit`; behavior checked in Task 5's manual harness pass.

- [ ] **Step 1: Write the component**

Create `src/ui-jsx/panels/foundation/IntensityPicker.tsx`:

```tsx
// Intensity: a wrapping row of level buttons + the selected level's description.
// No edit pane and no generation — clicking a level dispatches intensityUpdated.
// Selected level uses the NAI header highlight (T.textHeadings) on a subtle
// T.bg3 chip; others are dimmed. Replaces SUI's green literal.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, intensityUpdated } from "../../../core/store";
import { INTENSITY_LEVELS } from "./fields";

export function IntensityPicker() {
  const intensity = useSlice((s) => s.foundation.intensity);
  const current = intensity?.level ?? "";

  return (
    <div
      style={{
        background: T.bg2,
        color: T.text,
        fontFamily: T.fontDefault,
        padding: SP.md,
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
      }}
    >
      <span style={{ color: T.textHeadings }}>{current || "Intensity"}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: SP.sm }}>
        {INTENSITY_LEVELS.map((il) => {
          const selected = il.level === current;
          return (
            <button
              key={il.level}
              onClick={() =>
                store.dispatch(
                  intensityUpdated({
                    intensity: { level: il.level, description: il.description },
                  }),
                )
              }
              style={{
                border: "none",
                cursor: "pointer",
                padding: "3px 8px",
                fontSize: "0.775rem",
                borderRadius: "3px",
                background: selected ? T.bg3 : "transparent",
                color: selected ? T.textHeadings : T.textDisabled,
                opacity: selected ? 1 : 0.6,
              }}
            >
              {il.level}
            </button>
          );
        })}
      </div>
      <div
        style={{
          fontSize: "0.85em",
          whiteSpace: "pre-wrap",
          color: intensity ? T.text : T.textDisabled,
        }}
      >
        {intensity?.description || "No intensity defined"}
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
npx prettier -w src/ui-jsx/panels/foundation/IntensityPicker.tsx
git add src/ui-jsx/panels/foundation/IntensityPicker.tsx
git commit -m "feat(jsx): Intensity level picker"
```

---

### Task 5: `Foundation.tsx` orchestrator + App wiring + delete old panel

**Files:**
- Create: `src/ui-jsx/panels/foundation/Foundation.tsx`
- Modify: `src/ui-jsx/App.tsx:4`
- Delete: `src/ui-jsx/panels/Foundation.tsx`

**Interfaces:**
- Consumes: `useState` (runtime global); `store` from `../../../core/store`; `SP` from `../../style`; `IntensityPicker` from `./IntensityPicker`; `FieldCard` from `./FieldCard`; `FieldEditor` from `./FieldEditor`; `FIELD_DESCRIPTORS`, `FoundationFieldId` from `./fields`.
- Produces: `Foundation()` (same export name/shape App already imports).

> Verified by `npx tsc --noEmit` + full `npm test`; then a manual harness pass (see Step 6).

- [ ] **Step 1: Write the orchestrator**

Create `src/ui-jsx/panels/foundation/Foundation.tsx`:

```tsx
// Story Engine tab body. Renders the Intensity picker then one FieldCard per
// descriptor. `editing` holds the field id whose edit pane is open; while set,
// the pane replaces the list. The pane seeds from the committed store value at
// open time (descriptor.seed) and commits back through descriptor.commit.

import { store } from "../../../core/store";
import { SP } from "../../style";
import { IntensityPicker } from "./IntensityPicker";
import { FieldCard } from "./FieldCard";
import { FieldEditor } from "./FieldEditor";
import { FIELD_DESCRIPTORS, type FoundationFieldId } from "./fields";

export function Foundation() {
  const [editing, setEditing] = useState<FoundationFieldId | null>(null);

  if (editing) {
    const d = FIELD_DESCRIPTORS.find((x) => x.id === editing)!;
    const draft = d.seed(store.getState());
    return (
      <FieldEditor
        label={`Edit ${d.label}`}
        titled={d.titled}
        initialTitle={draft.title}
        initialContent={draft.content}
        placeholder={d.placeholder}
        titlePlaceholder={d.titlePlaceholder}
        onBack={() => setEditing(null)}
        onCommit={(v) => {
          d.commit(v);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <IntensityPicker />
      {FIELD_DESCRIPTORS.map((d) => (
        <FieldCard
          key={d.id}
          descriptor={d}
          onEdit={() => setEditing(d.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Point App at the new orchestrator**

In `src/ui-jsx/App.tsx`, change line 4:

```tsx
import { Foundation } from "./panels/foundation/Foundation";
```

(from `import { Foundation } from "./panels/Foundation";`). No other App change — it already renders `<Foundation />` inside the Story Engine scroll box.

- [ ] **Step 3: Delete the superseded single-file panel**

```bash
git rm src/ui-jsx/panels/Foundation.tsx
```

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc --noEmit`
Expected: exit 0 (a leftover import of the old path would fail here).

Run: `npm test`
Expected: PASS — all suites including `tests/ui-jsx/foundation-fields.test.ts`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript` with no errors.

- [ ] **Step 6: Manual harness verification**

Load the built script in NovelAI, open the Story Engine tab, and confirm:
1. All six fields render in order: Intensity, Shape, Intent, Contract, ATTG, Style.
2. Intensity: clicking each level highlights it (header color on `bg3` chip) and shows its description; selection persists across a tab switch.
3. Each card's **Edit** opens the pane; Shape shows a Name input + Description textarea; Save writes back and the card updates. Cancel (Back) discards.
4. Contract: authoring `REQUIRED:/PROHIBITED:/EMPHASIS:` then Save shows the `Required:/Prohibited:/Emphasis:` display.
5. Zap on an **empty** field starts a generation (zap dims + disables while queued/active, then re-enables). Zap on a **filled** field (except Shape) opens a refine chat and the panel switches to the Chat tab. Shape's zap always generates.
6. ATTG/Style sync toggles flip green (on) and push to Memory / A.N.

- [ ] **Step 7: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/foundation/Foundation.tsx src/ui-jsx/App.tsx
git add src/ui-jsx/panels/foundation/Foundation.tsx src/ui-jsx/App.tsx
git rm src/ui-jsx/panels/Foundation.tsx
git commit -m "feat(jsx): full Foundation field parity — Intensity/Shape/Intent/Contract + gen indicator"
```

---

## Self-Review Notes

- **Spec coverage:** Intensity (Task 4), Shape/Intent/Contract/ATTG/Style descriptors (Task 1), generic card + generating indicator (Task 3), titled editor (Task 2), orchestrator + App wiring + old-file deletion (Task 5), theme-token coloring + header-highlight intensity (Tasks 3/4), contract parse/format tested (Task 1). `worldState` intentionally excluded (non-goal).
- **Type consistency:** `FieldDescriptor`, `FieldDraft`, `FoundationFieldId` defined in Task 1 and consumed unchanged in Tasks 2/3/5; `isFoundationGenerating` signature matches its call in Task 3.
- **Placeholders:** none — every code step is complete.
