/**
 * StoryEnginePlugin — Phase 6.
 *
 * Fully nai-act free. All panels are SUI components.
 * All UIExtensions registered in a single api.v1.ui.register() call (NAI
 * requires this — multiple calls overwrite each other).
 *
 * Chat rebuild: ChatPanel.onRebuild → updateParts on the tab pane
 * column (se-main-tab-bar.pane.0) — no full-panel re-registration needed.
 *
 * Edit pane: plugin-level editHost swaps se-edit-slot content and toggles
 * se-main-content visibility — no full pane rebuild on open/close.
 */

import {
  SuiPlugin,
  SuiTabBar,
  SuiButton,
  SuiComponent,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { GenX } from "nai-gen-x";

import {
  store,
  persistedDataLoaded,
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
import { stateUpdated, requestActivated } from "../core/store/slices/runtime";
import { IDS, STORAGE_KEYS } from "./framework/ids";
import type { EditPaneHost } from "./components/SeContentWithTitlePane";

import { ChatPanel } from "./components/ChatPanel";
import { openSeSessionsModal } from "./components/SeSessionsModal";
import { ForgePane } from "./components/ForgePane";
import { SeHeaderBar } from "./components/SeHeaderBar";
import { SeJournalPanel } from "./components/SeJournalPanel";
import { SeImportWizard } from "./components/SeImportWizard";
import { loadJournal } from "../core/generation-journal";

const { sidebarPanel, scriptPanel } = api.v1.ui.extension;


export class StoryEnginePlugin extends SuiPlugin {
  private _genX?: GenX;
  private _chatPanel?: ChatPanel;
  private _tabBar?: SuiTabBar;

  // ── Story engine pane children (persistent for rebuild) ──
  private _seHeaderBar?: SeHeaderBar;
  private _forgePane?: ForgePane;

  // ── Edit pane hosting ──
  readonly editHost: EditPaneHost = {
    open: (pane) => {
      void (async () => {
        const editPart = await pane.build();
        api.v1.ui.updateParts([
          { id: "se-edit-slot", content: [editPart] } as unknown as Partial<UIPart> & { id: string },
          { id: "se-main-content", style: { display: "none" } } as unknown as Partial<UIPart> & { id: string },
        ]);
      })();
    },
    close: () => {
      api.v1.ui.updateParts([
        { id: "se-edit-slot", content: [] } as unknown as Partial<UIPart> & { id: string },
        { id: "se-main-content", style: {} } as unknown as Partial<UIPart> & { id: string },
      ]);
    },
  };

  protected requestPermissions(): void {
    api.v1.permissions.request(["storyEdit", "lorebookEdit", "documentEdit"]);
  }

  override async build(): Promise<void> {
    let _lastGenxStatus = "idle";
    let _lastGenxQueueLength = 0;
    this._genX = new GenX({
      onStateChange(genxState) {
        if (
          genxState.status !== _lastGenxStatus ||
          genxState.queueLength !== _lastGenxQueueLength
        ) {
          _lastGenxStatus = genxState.status;
          _lastGenxQueueLength = genxState.queueLength;
          store.dispatch(stateUpdated({ genxState }));
        }
      },
      onTaskStarted(taskId) {
        store.dispatch(requestActivated({ requestId: taskId }));
      },
    });

    registerEffects(store, this._genX);

    const persisted = await api.v1.storyStorage.get(STORAGE_KEYS.PERSIST);
    const migrated = migrateBrainstormToChat(persisted ?? {});
    if (migrated.touched) {
      await api.v1.storyStorage.set(STORAGE_KEYS.PERSIST, migrated.data);
      api.v1.ui.toast("Brainstorm chats migrated to new chat system.", { type: "info" });
    }
    if (persisted) store.dispatch(persistedDataLoaded(migrated.data));

    await migrateLorebookCategories();
    await syncEratoCompatibility(store.getState);
    registerLorebookSyncHooks(store.dispatch, store.getState);

    await super.build();

    // Auto-trigger import wizard when foundation fields are unpopulated
    const { attg, style } = store.getState().foundation;
    const hasFoundationContent = attg.trim() !== "" || style.trim() !== "";
    if (!hasFoundationContent) {
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
        // Switch to Story Engine tab so the import wizard is visible
        await this._tabBar?.switchTo(1);
        this.editHost.open(
          new SeImportWizard({ id: IDS.IMPORT.WIZARD, editHost: this.editHost }),
        );
      }
    }
  }

  // ── Rebuild helpers ────────────────────────────────────────────

  private async _rebuildChat(): Promise<void> {
    if (!this._chatPanel) return;
    const newContent = await this._chatPanel.build();
    api.v1.ui.updateParts([
      {
        id: "se-main-tab-bar.pane.0",
        content: [newContent],
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  private async _buildStoryEnginePane(): Promise<UIPartColumn> {
    const { column } = api.v1.ui.part;

    const [headerPart, forgePart] = await Promise.all([
      this._seHeaderBar!.build(),
      this._forgePane!.build(),
    ]);

    const mainContent = column({
      id: "se-main-content",
      style: { gap: "8px" },
      content: [headerPart, forgePart],
    });

    const editSlot = column({
      id: "se-edit-slot",
      style: { flex: "1" },
      content: [],
    });

    return column({
      id: "se-story-engine-pane",
      style: { flex: "1" },
      content: [mainContent, editSlot],
    });
  }

  // ── Compose ────────────────────────────────────────────────────

  protected async compose(): Promise<void> {
    // ── Chat pane ───────────────────────────────────────────────────────────
    this._chatPanel = new ChatPanel({
      id: IDS.BRAINSTORM.ROOT,
      onRebuild: () => {
        void this._rebuildChat();
      },
      onOpenSessions: () => {
        void openSeSessionsModal();
      },
    });

    // ── Story Engine pane ───────────────────────────────────────────────────
    this._seHeaderBar = new SeHeaderBar({ id: "kse-sidebar-header", editHost: this.editHost });
    this._forgePane = new ForgePane({
      id: "se-forge-pane",
      editHost: this.editHost,
    });

    // Build the slot structure once — se-edit-slot + se-main-content.
    // editHost.open/close target these IDs directly via updateParts (no rebuild).
    const storyEnginePart = await this._buildStoryEnginePane();

    // Adapter so SuiTabBar receives a SuiComponent (calls build() on it).
    class StoryEngineSlot extends SuiComponent<
      { default: { self: { style: object } } },
      Record<string, never>,
      SuiComponentOptions<{ default: { self: { style: object } } }, Record<string, never>>,
      UIPartColumn
    > {
      constructor(private readonly _col: UIPartColumn) {
        super(
          { id: "se-story-engine-slot", state: {} as Record<string, never> },
          { default: { self: { style: {} } } },
        );
      }
      async compose(): Promise<UIPartColumn> {
        return this._col;
      }
    }

    const storyEnginePane = new StoryEngineSlot(storyEnginePart);

    // ── Tab bar — callbacks close over this._tabBar (safe: only called on click) ──
    const tabBrainstorm = new SuiButton({
      id: "se-tab-brainstorm",
      callback: () => {
        void this._tabBar?.switchTo(0);
      },
      theme: { default: { self: { text: "Chat" } } },
    });
    const tabEngine = new SuiButton({
      id: "se-tab-engine",
      callback: () => {
        void this._tabBar?.switchTo(1);
      },
      theme: { default: { self: { text: "Story Engine" } } },
    });

    this._tabBar = new SuiTabBar({
      id: "se-main-tab-bar",
      tabs: [tabBrainstorm, tabEngine],
      panes: [this._chatPanel, storyEnginePane],
      storageKey: "se-active-tab",
      storageMode: "story",
      theme: {
        default: {
          self: { style: { height: "100%" } },
          paneActive: { style: { overflow: "auto" } },
        },
      },
    });

    const tabBarPart = await this._tabBar.build();

    // ── Register all extensions in one call ─────────────────────────────────
    const panels: UIExtension[] = [
      sidebarPanel({
        id: "kse-sidebar",
        name: "Story Engine",
        iconId: "lightning",
        content: [tabBarPart],
      }),
    ];

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

    await api.v1.ui.register(panels);

    // When a refine chat opens, surface it: switch to the Chat tab so the user
    // lands directly in the refine session. (Sidebar visibility itself is not
    // controllable via the script API — clicking the sidebar icon is on the user.)
    let lastRefineId: string | null = null;
    store.subscribeSelector(
      (state) => state.chat.refineChat?.id ?? null,
      (id) => {
        if (id && id !== lastRefineId) {
          void this._tabBar?.switchTo(0);
        }
        lastRefineId = id;
      },
    );
  }

  protected async registerHooks(): Promise<void> {
    // No hooks currently required.
  }
}
