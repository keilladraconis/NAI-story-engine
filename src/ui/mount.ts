// Bootstrap + mount for the JSX/Preact Story Engine.
//
// `start()` is the single entry point (called from src/index.ts). It wires the
// store (GenX, effects, persistence, lorebook sync), then registers
// the sidebar panel and the Engine HUD — and, when enabled, the Generation
// Journal panel — in ONE `api.v1.ui.register()` call (NAI requires a single
// call; multiple overwrite each other). All UI is Preact rendered into a jsx
// part.

import { App } from "./App";
import { Hud } from "./hud/Hud";
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
import { loadBranchState } from "../core/store/persistence/history-store";
import type { ChatSliceState } from "../core/store/slices/chat";
import type { FoundationState } from "../core/store/types";
import { loadJournal } from "../core/generation-journal";
import { STORAGE_KEYS } from "../core/keys";
import { hydrateComposerDrafts } from "./panels/chat/composer-draft";

const { sidebarPanel, scriptPanel } = api.v1.ui.extension;

/** The panel's one child: a full-height grid whose single row can shrink below
 *  its content, so the jsx part is bounded by the panel rather than growing to
 *  fit App. Without it App's `height: 100%` resolves against `auto`. */
function buildRoot(body: UIPart): UIPart {
  return api.v1.ui.part.container({
    id: "kse-root",
    style: {
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr)",
      height: "100%",
      minHeight: "0",
    },
    content: [body],
  });
}

function buildSidebarPanel(hasDocumentContent: boolean): UIExtension {
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
      // hasDocumentContent is read before register() so the Setup tab's
      // bootstrap button carries the right label on its first paint.
      render(h(App, { initialHasDocumentContent: hasDocumentContent }), elem);
    },
  });

  return sidebarPanel({
    id: "kse-sidebar",
    name: "Story Engine",
    iconId: "lightning",
    content: [buildRoot(jsxPart)],
  });
}

// The Engine HUD (design §9.1): one modeline, always registered. A scriptPanel
// can be minimized but never dismissed, which is what lets the HUD carry the
// trust burden — the Engine can never be quietly running behind a surface the
// writer closed and forgot. Registered unconditionally for the same reason: with
// `engine_enabled` off the line simply reports a loop that never moves, and the
// writer can still see that nothing is happening.
function buildHudPanel(): UIExtension {
  const jsxPart = api.v1.ui.part.jsx({
    id: "kse-jsx-hud-root",
    onMount: (elem) => {
      render(h(Hud, null), elem);
    },
  });

  return scriptPanel({
    id: "kse-hud",
    name: "Engine HUD",
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

  // ── Persistence ───────────────────────────────────────────────────────────
  // Branch-scoped state (World, story fields) comes from historyStorage at the
  // current node; chat and Foundation follow the writer and stay in
  // storyStorage. No migration path: Story Engine is alpha and upgrading drops
  // Engine state — previously managed lorebook entries simply become unmanaged,
  // and the Import wizard's Bind is the way back.
  // storyStorage.get is typed `any`; name the shapes here rather than letting
  // them flow unchecked into PersistedData, the way history-store.ts does for
  // the index.
  const [branch, chat, foundation] = (await Promise.all([
    loadBranchState(),
    api.v1.storyStorage.get(STORAGE_KEYS.CHAT),
    api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION),
  ])) as [
    Awaited<ReturnType<typeof loadBranchState>>,
    ChatSliceState | null,
    FoundationState | null,
  ];
  store.dispatch(
    persistedDataLoaded({
      story: branch.story,
      world: branch.world,
      ...(chat ? { chat } : {}),
      ...(foundation ? { foundation } : {}),
    }),
  );

  // After persistedDataLoaded so the prune sees the real chat list, and before
  // register() so the composer's first render already carries its unsent text.
  await hydrateComposerDrafts(store.getState().chat.chats.map((c) => c.id));

  await migrateLorebookCategories();
  await syncEratoCompatibility(store.getState);
  registerLorebookSyncHooks(store.dispatch, store.getState);

  // ── Panels (single register call) ────────────────────────────────────────
  const hasDocumentContent = (await api.v1.document.sectionIds()).length > 0;
  const panels: UIExtension[] = [
    buildSidebarPanel(hasDocumentContent),
    buildHudPanel(),
  ];

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
