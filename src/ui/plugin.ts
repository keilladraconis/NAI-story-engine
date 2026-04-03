/**
 * StoryEnginePlugin — Phase 6.
 *
 * Fully nai-act free. All panels are SUI components.
 * All UIExtensions registered in a single api.v1.ui.register() call (NAI
 * requires this — multiple calls overwrite each other).
 *
 * Brainstorm rebuild: BrainstormPane.onRebuild → updateParts on the tab pane
 * column (se-main-tab-bar.pane.1) — no full-panel re-registration needed.
 *
 * Edit pane: plugin-level editHost replaces the entire story engine tab pane
 * content with a modal edit form. Save/Back restores the normal view.
 */

import {
  SuiPlugin,
  SuiTabBar,
  SuiButton,
  SuiRow,
  SuiColumn,
  type AnySuiComponent,
} from "nai-simple-ui";
import { GenX } from "nai-gen-x";

import {
  store,
  persistedDataLoaded,
  uiLorebookEntrySelected,
} from "../core/store";
import { registerEffects, syncEratoCompatibility } from "../core/store/register-effects";
import {
  migrateLorebookCategories,
  registerLorebookSyncHooks,
  reconcileEntitySummaries,
} from "../core/store/effects/lorebook-sync";
import { stateUpdated, requestActivated } from "../core/store/slices/runtime";
import { IDS, STORAGE_KEYS } from "./framework/ids";
import type { EditPaneHost } from "./components/SeContentWithTitlePane";

import { BrainstormPane } from "./components/BrainstormPane";
import { ForgePane } from "./components/ForgePane";
import { SeWorldBatchList } from "./components/SeWorldBatchList";
import { SeHeaderBar } from "./components/SeHeaderBar";
import { SeLorebookPanel } from "./components/SeLorebookPanel";
import { SeJournalPanel } from "./components/SeJournalPanel";
import { openBindModal } from "./components/BindModal";
import { openRelationshipsModal } from "./components/RelationshipsModal";
import { loadJournal } from "../core/generation-journal";

const { sidebarPanel, lorebookPanel, scriptPanel } = api.v1.ui.extension;

/** ID of the story engine tab pane container (assigned by SuiTabBar). */
const SE_TAB_PANE = "se-main-tab-bar.pane.0";

export class StoryEnginePlugin extends SuiPlugin {
  private _genX?: GenX;
  private _brainstormPane?: BrainstormPane;
  private _tabBar?: SuiTabBar;

  // ── Story engine pane children (persistent for rebuild) ──
  private _seHeaderBar?:    SeHeaderBar;
  private _forgePane?:      ForgePane;
  private _worldBatchList?: SeWorldBatchList;
  private _footer?:         SuiRow;

  // ── Edit pane hosting ──
  private _editPane: AnySuiComponent | null = null;
  readonly editHost: EditPaneHost = {
    open:  (pane) => { this._editPane = pane;  void this._rebuildStoryEngine(); },
    close: ()     => { this._editPane = null;  void this._rebuildStoryEngine(); },
  };

  protected requestPermissions(): void {
    api.v1.permissions.request(["storyEdit", "lorebookEdit", "documentEdit"]);
  }

  override async build(): Promise<void> {
    this._genX = new GenX({
      onStateChange(genxState) {
        store.dispatch(stateUpdated({ genxState }));
      },
      onTaskStarted(taskId) {
        store.dispatch(requestActivated({ requestId: taskId }));
      },
    });

    registerEffects(store, this._genX);

    const persisted = await api.v1.storyStorage.get(STORAGE_KEYS.PERSIST);
    if (persisted) store.dispatch(persistedDataLoaded(persisted));

    await migrateLorebookCategories();
    await syncEratoCompatibility(store.getState);
    registerLorebookSyncHooks(store.dispatch, store.getState);

    await super.build();
  }

  // ── Rebuild helpers ────────────────────────────────────────────

  private async _rebuildBrainstorm(): Promise<void> {
    if (!this._brainstormPane) return;
    const newContent = await this._brainstormPane.build();
    api.v1.ui.updateParts([
      { id: "se-main-tab-bar.pane.1", content: [newContent] } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  private async _rebuildStoryEngine(): Promise<void> {
    if (this._editPane) {
      // Edit mode — replace entire tab pane with edit form
      const editPart = await this._editPane.build();
      api.v1.ui.updateParts([
        { id: SE_TAB_PANE, content: [editPart] } as unknown as Partial<UIPart> & { id: string },
      ]);
    } else {
      // Normal mode — rebuild full story engine column
      const part = await this._buildStoryEnginePane();
      api.v1.ui.updateParts([
        { id: SE_TAB_PANE, content: [part] } as unknown as Partial<UIPart> & { id: string },
      ]);
    }
  }

  private async _buildStoryEnginePane(): Promise<UIPart> {
    return await new SuiColumn({
      id: "se-story-engine-pane",
      children: [this._seHeaderBar!, this._forgePane!, this._worldBatchList!, this._footer!],
      theme: { default: { self: { style: { gap: "8px" } } } },
    }).build();
  }

  // ── Compose ────────────────────────────────────────────────────

  protected async compose(): Promise<void> {
    // ── Brainstorm pane ─────────────────────────────────────────────────────
    this._brainstormPane = new BrainstormPane({
      id: IDS.BRAINSTORM.ROOT,
      onRebuild: () => { void this._rebuildBrainstorm(); },
    });

    // ── Story Engine pane ───────────────────────────────────────────────────
    this._seHeaderBar    = new SeHeaderBar({ id: "kse-sidebar-header" });
    this._forgePane      = new ForgePane({ id: "se-forge-pane", editHost: this.editHost });
    this._worldBatchList = new SeWorldBatchList({ id: IDS.WORLD.BATCH_LIST, editHost: this.editHost });

    this._footer = new SuiRow({
      id: "se-footer",
      children: [
        new SuiButton({
          id: "se-footer-relationships",
          callback: () => { void openRelationshipsModal({ getState: store.getState, dispatch: store.dispatch }); },
          theme: { default: { self: { text: "Relationships", style: { flex: "1", "font-size": "0.8em" } } } },
        }),
        new SuiButton({
          id: "se-footer-bind-new",
          callback: () => { void openBindModal({ getState: store.getState, dispatch: store.dispatch }); },
          theme: { default: { self: { text: "Bind New", style: { flex: "1", "font-size": "0.8em" } } } },
        }),
        new SuiButton({
          id: "se-footer-rebind",
          callback: () => { void openBindModal({ getState: store.getState, dispatch: store.dispatch }); },
          theme: { default: { self: { text: "Rebind", style: { flex: "1", "font-size": "0.8em" } } } },
        }),
      ],
      theme: { default: { self: { style: { gap: "4px", "margin-top": "8px" } } } },
    });

    const storyEnginePane = new SuiColumn({
      id: "se-story-engine-pane",
      children: [this._seHeaderBar, this._forgePane, this._worldBatchList, this._footer],
      theme: { default: { self: { style: { gap: "8px" } } } },
    });

    // ── Tab bar — callbacks close over this._tabBar (safe: only called on click) ──
    const tabEngine = new SuiButton({ id: "se-tab-engine", callback: () => { void this._tabBar?.switchTo(0); }, theme: { default: { self: { text: "Story Engine" } } } });
    const tabBrainstorm = new SuiButton({ id: "se-tab-brainstorm", callback: () => { void this._tabBar?.switchTo(1); }, theme: { default: { self: { text: "Brainstorm" } } } });

    this._tabBar = new SuiTabBar({
      id: "se-main-tab-bar",
      tabs: [tabEngine, tabBrainstorm],
      panes: [storyEnginePane, this._brainstormPane],
      storageKey: "se-active-tab",
      storageMode: "story",
      theme: { default: { self: { style: { height: "100%" } }, paneActive: { style: { overflow: "auto" } } } },
    });

    const tabBarPart = await this._tabBar.build();
    const lorebookPart = await new SeLorebookPanel({ id: IDS.LOREBOOK.PANEL }).build();

    // ── Register all extensions in one call ─────────────────────────────────
    const panels: UIExtension[] = [
      sidebarPanel({
        id: "kse-sidebar",
        name: "Story Engine",
        iconId: "lightning",
        content: [tabBarPart],
      }),
      lorebookPanel({
        id: IDS.LOREBOOK.PANEL,
        name: "Story Engine",
        iconId: "zap",
        content: [lorebookPart],
      }),
    ];

    const journalEnabled = await api.v1.config.get("generation_journal");
    if (journalEnabled) {
      api.v1.permissions.request(["clipboardWrite"]);
      await loadJournal();
      const journalPart = await new SeJournalPanel({ id: "kse-journal-root" }).build();
      panels.push(
        scriptPanel({
          id: "kse-journal",
          name: "Generation Journal",
          content: [journalPart],
        }),
      );
    }

    await api.v1.ui.register(panels);
  }

  protected async registerHooks(): Promise<void> {
    api.v1.hooks.register("onLorebookEntrySelected", async (params) => {
      store.dispatch(
        uiLorebookEntrySelected({
          entryId: params.entryId || null,
          categoryId: params.categoryId || null,
        }),
      );
      if (params.entryId) {
        await reconcileEntitySummaries(store.dispatch, store.getState, params.entryId);
      }
    });
  }
}
