# JSX Generation Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SUI `SeJournalPanel` with a JSX `JournalPanel` — the "Generation Journal" panel (count + Full/SEGA/Bootstrap/Forge copy + Clear), gated by the `generation_journal` config flag.

**Architecture:** A JSX component reading the existing `src/core/generation-journal` module, mounted as a `scriptPanel` via a builder mirroring `mount.ts`'s `buildJsxSidebarPanel`, and swapped into `plugin.ts`'s registration in place of the SUI journal. No backend changes.

**Tech Stack:** TypeScript (strict), Preact/JSX (NAI runtime globals `h`/`render`/`useState`/`useEffect` — no import), nai-store. QuickJS (no DOM, no setTimeout, no console.log).

## Global Constraints

- No backend/journal-module/prompt changes; no `project.yaml` version bump. The build stamps `updatedAt` — revert it (`git checkout project.yaml`) before committing. (`npm run build` fetches `script-types.d.ts` from novelai.net; if it fails with a DNS/`fetch failed` error in the sandbox, re-run the build with the sandbox disabled — tsc/vitest run fine sandboxed.)
- `useSlice` selectors return primitives only — the journal count selector returns `activeRequest?.id ?? ""` (a string).
- `useState`/`h`/`render` are NAI globals — not imported.
- The `generation_journal` gate and its default (`false`) are unchanged; `loadJournal()` + `permissions.request(["clipboardWrite"])` stay in `plugin.ts` before `register()`.
- Verify live on the reloaded script with the **Generation Journal** setting toggled on.

---

### Task 1: `JournalPanel` component

**Files:**
- Create: `src/ui-jsx/panels/journal/JournalPanel.tsx`

**Interfaces:**
- Consumes: `useSlice` (`../../bridge`); `T`, `SP` (`../../style`); `getJournalCount`, `formatJournal`, `formatDigest`, `formatBootstrapDigest`, `formatForgeDigest`, `clearJournal` (`../../../core/generation-journal`).
- Produces: `JournalPanel()`.

- [ ] **Step 1: Create `JournalPanel.tsx`**

```tsx
// Generation Journal panel (JSX) — replaces SUI SeJournalPanel. Shows the
// recorded-entry count and copy buttons (Full journal + SEGA/Bootstrap/Forge
// digests) that write to the clipboard, plus Clear. Reads the effect-free
// generation-journal module directly; the count re-reads on request boundaries
// (the activeRequest watch, matching SUI) and after Clear.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  getJournalCount,
  formatJournal,
  formatDigest,
  formatBootstrapDigest,
  formatForgeDigest,
  clearJournal,
} from "../../../core/generation-journal";

const btn = {
  fontSize: "0.75em",
  padding: "3px 8px",
  background: T.bg2,
  color: T.text,
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
} as const;

export function JournalPanel() {
  // Re-render on request boundaries (proxy for "journal advanced"), like the SUI
  // watch on runtime.activeRequest. Primitive selector — no render loop.
  useSlice((s) => s.runtime.activeRequest?.id ?? "");
  const [, force] = useState(0); // bump after Clear so the count re-reads to 0

  const count = getJournalCount();
  const copy = (fmt: () => string, label: string) => {
    void (async () => {
      await api.v1.clipboard.writeText(fmt());
      void api.v1.ui.toast(`${label} copied to clipboard`, { type: "success" });
    })();
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: SP.sm,
        padding: SP.md,
        color: T.text,
        fontFamily: T.fontDefault,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: "0.85em", opacity: 0.8 }}>
        {count} entries recorded
      </span>
      <button style={btn} onClick={() => copy(formatJournal, "Journal")}>
        Full
      </button>
      <button style={btn} onClick={() => copy(formatDigest, "SEGA digest")}>
        SEGA
      </button>
      <button
        style={btn}
        onClick={() => copy(formatBootstrapDigest, "Bootstrap digest")}
      >
        Bootstrap
      </button>
      <button style={btn} onClick={() => copy(formatForgeDigest, "Forge digest")}>
        Forge
      </button>
      <button
        style={{ ...btn, color: T.warning }}
        onClick={() => {
          clearJournal();
          force((n) => n + 1);
        }}
      >
        Clear
      </button>
    </div>
  );
}
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → exit 0. (`JournalPanel` is exported but not yet mounted — Task 2 wires it.)

- [ ] **Step 3: Commit**

```bash
git add src/ui-jsx/panels/journal/JournalPanel.tsx
git commit -m "feat(jsx): JournalPanel component (count + copy digests + clear)"
```

---

### Task 2: Mount builder + `plugin.ts` swap

**Files:**
- Modify: `src/ui-jsx/mount.ts`
- Modify: `src/ui/plugin.ts`

**Interfaces:**
- Consumes: `JournalPanel` (`./panels/journal/JournalPanel`); `scriptPanel` (`api.v1.ui.extension`); `buildJsxJournalPanel` (in `plugin.ts`).
- Produces: `buildJsxJournalPanel(): UIExtension`.

- [ ] **Step 1: Add `buildJsxJournalPanel` to `mount.ts`**

Add the import and destructure `scriptPanel`, and the builder. At the top of `mount.ts`, alongside `import { App } from "./App";`:
```ts
import { App } from "./App";
import { JournalPanel } from "./panels/journal/JournalPanel";

const { sidebarPanel, scriptPanel } = api.v1.ui.extension;
```
(Replace the existing `const { sidebarPanel } = api.v1.ui.extension;` line with the destructure above.)

Add the builder after `buildJsxSidebarPanel`:
```ts
// The Generation Journal panel (gated by `generation_journal` in plugin.ts).
// A short, non-scrolling panel — a plain jsx part, no grid-height constraint.
export function buildJsxJournalPanel(): UIExtension {
  const jsxPart = api.v1.ui.part.jsx({
    id: "kse-jsx-journal-root",
    onMount: (elem) => {
      render(h(JournalPanel, null), elem);
    },
  });

  return scriptPanel({
    id: "kse-journal",
    name: "Generation Journal",
    content: [jsxPart],
  });
}
```

- [ ] **Step 2: Swap the journal registration in `plugin.ts`**

Remove the SUI import:
```ts
import { SeJournalPanel } from "./components/SeJournalPanel";
```
Add `buildJsxJournalPanel` to the existing `../ui-jsx/mount` import:
```ts
import { buildJsxSidebarPanel, buildJsxJournalPanel } from "../ui-jsx/mount";
```
Replace the journal block:
```ts
    const journalEnabled = await api.v1.config.get("generation_journal");
    if (journalEnabled) {
      api.v1.permissions.request(["clipboardWrite"]);
      loadJournal();
      const journalPart = await new SeJournalPanel({
        id: "kse-journal-root",
      }).build();
      panels.push(
        scriptPanel({
          id: "kse-journal",
          name: "Generation Journal",
          content: [journalPart],
        }),
      );
    }
```
with:
```ts
    const journalEnabled = await api.v1.config.get("generation_journal");
    if (journalEnabled) {
      api.v1.permissions.request(["clipboardWrite"]);
      loadJournal();
      panels.push(buildJsxJournalPanel());
    }
```
(If `scriptPanel` is now unused in `plugin.ts` after this — check: the SUI sidebar panel uses `sidebarPanel`, and the journal was the only `scriptPanel` user — remove `scriptPanel` from the `const { sidebarPanel, scriptPanel } = api.v1.ui.extension;` destructure to satisfy `noUnusedLocals`. `loadJournal` stays used.)

- [ ] **Step 3: tsc + build + full suite**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → `✅ Built` (disable the sandbox if the novelai.net fetch fails). Then `git checkout project.yaml`.
Run: `npx vitest run` → all passing (no new tests; confirms no regression).

- [ ] **Step 4: Update CHANGELOG + commit**

Add to `## [0.14.0]` `### Changed` a release-note bullet: the Generation Journal panel is now the JSX implementation (same count + copy-digest + clear behavior), retiring the SUI version. Match the existing 0.14.0 voice.

```bash
git add src/ui-jsx/mount.ts src/ui/plugin.ts CHANGELOG.md
git commit -m "feat(jsx): mount JSX Generation Journal panel, retire SUI SeJournalPanel"
```

---

## Live Verification (after all tasks, with the user)

1. Enable the **Generation Journal** script setting (`generation_journal`, default off) and reload.
2. A separate **"Generation Journal"** panel appears with "N entries recorded" + **Full / SEGA / Bootstrap / Forge / Clear**.
3. Run a generation (e.g., a field or entity generate) → the count increases (on request boundaries).
4. Click **Full** → a "Journal copied to clipboard" toast; paste elsewhere to confirm the journal text.
5. Click **Clear** → the count resets to **0 entries recorded**.

## Notes for the executor

- `useState`/`h`/`render` are NAI globals — no import (see `mount.ts` using `render`/`h` unimported).
- The `jsx` journal part needs no height/grid style (unlike the App part) — content is one short row.
- Do not touch `src/core/generation-journal` or the config gate. Leave `SeJournalPanel.ts` on disk (just unreferenced) — removing dead files is out of scope for this slice.
- Remove any import `noUnusedLocals` flags (notably `scriptPanel` in `plugin.ts` if it becomes unused); do not suppress. Do not bump `project.yaml`.
