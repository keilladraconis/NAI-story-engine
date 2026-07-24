// Bootstrap + mount for the JSX/Preact Story Engine.
//
// `start()` is the single entry point (called from src/index.ts). It wires the
// store (GenX, effects, persistence, migrations, lorebook sync), then registers
// the sidebar panel — and, when enabled, the Generation Journal panel — in ONE
// `api.v1.ui.register()` call (NAI requires a single call; multiple overwrite
// each other). All UI is Preact rendered into a jsx part.

import { App } from "./App";
import { JournalPanel } from "./panels/journal/JournalPanel";
import { GenX } from "nai-gen-x";

import {
  store,
  persistedDataLoaded,
  stateUpdated,
  requestActivated,
  importWizardOpened,
} from "../core/store";
import {
  registerEffects,
  syncEratoCompatibility,
} from "../core/store/register-effects";
import {
  migrateLorebookCategories,
  registerLorebookSyncHooks,
} from "../core/store/effects/lorebook-sync";
import { migrateBrainstormToChat } from "../core/store/migrations/brainstorm-to-chat";
import { loadJournal } from "../core/generation-journal";
import { STORAGE_KEYS } from "../core/keys";

const { sidebarPanel, scriptPanel } = api.v1.ui.extension;

function buildSidebarPanel(): UIExtension {
  const jsxPart = api.v1.ui.part.jsx({
    id: "kse-jsx-root",
    // This `style` lands on the panel's light-DOM wrapper around our shadow host.
    // A grid whose one row can shrink below content (`minmax(0, 1fr)` — the
    // responsive, pixel-free equivalent of `min-height:0`) constrains the shadow
    // host to the panel height instead of letting it grow to content. Together
    // with the Preact wrapper + App both at height:100%, the chat list scrolls
    // internally and the composer pins to the bottom.
    style: {
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr)",
      height: "100%",
      minHeight: "0",
    },
    // captureEvents intentionally omitted — the default (no capture) lets
    // keydown and wheel pass through normally so panel inputs accept keystrokes.
    onMount: (elem) => {
      // `elem` is the (otherwise unstyled) wrapper <div> App renders into, sitting
      // between the shadow root and App's own root. Give it height:100% so App's
      // height:100% resolves against the grid-constrained host, not `auto`.
      (elem as unknown as { style: Record<string, string> }).style.height =
        "100%";
      (elem as unknown as { style: Record<string, string> }).style.minHeight =
        "0";
      render(h(App, null), elem);
    },
  });

  return sidebarPanel({
    id: "kse-sidebar",
    name: "Story Engine",
    iconId: "lightning",
    content: [jsxPart],
  });
}

// The Generation Journal panel (gated by `generation_journal`). A short,
// non-scrolling panel — a plain jsx part, no grid-height constraint.
function buildJournalPanel(): UIExtension {
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

// Cold-start heuristic: if the Foundation is empty but the story already has
// content Story Engine can pull in (unmanaged lorebook entries, Memory, or A/N),
// open the Import wizard on first run. Store-driven — the App renders it
// reactively from ui.importWizardOpen.
async function maybeOpenImportWizard(): Promise<void> {
  const { attg, style } = store.getState().foundation;
  const hasFoundationContent = attg.trim() !== "" || style.trim() !== "";
  if (hasFoundationContent) return;

  const [entries, categories, memText, anText] = await Promise.all([
    api.v1.lorebook.entries(),
    api.v1.lorebook.categories(),
    api.v1.memory.get(),
    api.v1.an.get(),
  ]);
  const seCategories = new Set(
    categories.filter((c) => (c.name ?? "").startsWith("SE:")).map((c) => c.id),
  );
  const unmanagedCount = entries.filter(
    (e) => !e.category || !seCategories.has(e.category),
  ).length;
  if (unmanagedCount > 0 || memText.trim() || anText.trim()) {
    store.dispatch(importWizardOpened());
  }
}

export async function start(): Promise<void> {
  api.v1.permissions.request(["storyEdit", "lorebookEdit", "documentEdit"]);

  // ── GenX generation queue ────────────────────────────────────────────────
  let lastStatus = "idle";
  let lastQueueLength = 0;
  const genX = new GenX({
    onStateChange(genxState) {
      if (
        genxState.status !== lastStatus ||
        genxState.queueLength !== lastQueueLength
      ) {
        lastStatus = genxState.status;
        lastQueueLength = genxState.queueLength;
        store.dispatch(stateUpdated({ genxState }));
      }
    },
    onTaskStarted(taskId) {
      store.dispatch(requestActivated({ requestId: taskId }));
    },
  });

  registerEffects(store, genX);

  // ── Persistence + migrations ─────────────────────────────────────────────
  const persisted = await api.v1.storyStorage.get(STORAGE_KEYS.PERSIST);
  const migrated = migrateBrainstormToChat(persisted ?? {});
  if (migrated.touched) {
    await api.v1.storyStorage.set(STORAGE_KEYS.PERSIST, migrated.data);
    api.v1.ui.toast("Brainstorm chats migrated to new chat system.", {
      type: "info",
    });
  }
  if (persisted) store.dispatch(persistedDataLoaded(migrated.data));

  await migrateLorebookCategories();
  await syncEratoCompatibility(store.getState);
  registerLorebookSyncHooks(store.dispatch, store.getState);

  // ── Panels (single register call) ────────────────────────────────────────
  const panels: UIExtension[] = [buildSidebarPanel()];

  const journalEnabled = await api.v1.config.get("generation_journal");
  if (journalEnabled) {
    api.v1.permissions.request(["clipboardWrite"]);
    loadJournal();
    panels.push(buildJournalPanel());
  }

  await api.v1.ui.register(panels);

  // Auto-open the import wizard once, after the panel is mounted.
  await maybeOpenImportWizard();
}
