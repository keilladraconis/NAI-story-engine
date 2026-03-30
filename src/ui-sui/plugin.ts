/**
 * StoryEnginePlugin — Phase 6.
 *
 * Fully nai-act free. All panels are SUI components.
 * All UIExtensions registered in a single api.v1.ui.register() call (NAI
 * requires this — multiple calls overwrite each other).
 *
 * Brainstorm rebuild: BrainstormPane.onRebuild → updateParts on the tab pane
 * column (se-main-tab-bar.pane.1) — no full-panel re-registration needed.
 */

import {
  SuiPlugin,
  SuiTabBar,
  SuiButton,
  SuiRow,
  SuiColumn,
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
import { IDS, STORAGE_KEYS } from "../ui/framework/ids";

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

export class StoryEnginePlugin extends SuiPlugin {
  private _genX?:           GenX;
  private _brainstormPane?: BrainstormPane;
  private _forgePane?:      ForgePane;
  private _tabBar?:         SuiTabBar;

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

  private async _rebuildBrainstorm(): Promise<void> {
    if (!this._brainstormPane) return;
    const newContent = await this._brainstormPane.build();
    api.v1.ui.updateParts([
      { id: "se-main-tab-bar.pane.1", content: [newContent] } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  protected async compose(): Promise<void> {
    // ── Brainstorm pane ─────────────────────────────────────────────────────
    this._brainstormPane = new BrainstormPane({
      id:        IDS.BRAINSTORM.ROOT,
      onRebuild: () => { void this._rebuildBrainstorm(); },
    });

    // ── Story Engine pane ───────────────────────────────────────────────────
    const seHeaderBar    = new SeHeaderBar({ id: "kse-sidebar-header" });
    this._forgePane      = new ForgePane({ id: "se-forge-pane" });
    const worldBatchList = new SeWorldBatchList({ id: IDS.WORLD.BATCH_LIST });

    const footer = new SuiRow({
      id: "se-footer",
      children: [
        new SuiButton({
          id:       "se-footer-relationships",
          callback: () => { void openRelationshipsModal({ getState: store.getState, dispatch: store.dispatch }); },
          theme:    { default: { self: { text: "Relationships", style: { flex: "1", "font-size": "0.8em" } } } },
        }),
        new SuiButton({
          id:       "se-footer-bind-new",
          callback: () => { void openBindModal({ getState: store.getState, dispatch: store.dispatch }); },
          theme:    { default: { self: { text: "Bind New", style: { flex: "1", "font-size": "0.8em" } } } },
        }),
        new SuiButton({
          id:       "se-footer-rebind",
          callback: () => { void openBindModal({ getState: store.getState, dispatch: store.dispatch }); },
          theme:    { default: { self: { text: "Rebind", style: { flex: "1", "font-size": "0.8em" } } } },
        }),
      ],
      theme: { default: { self: { style: { gap: "4px", "margin-top": "8px" } } } },
    });

    const storyEnginePane = new SuiColumn({
      id:       "se-story-engine-pane",
      children: [seHeaderBar, this._forgePane, worldBatchList, footer],
      theme:    { default: { self: { style: { gap: "8px" } } } },
    });

    // ── Tab bar — callbacks close over this._tabBar (safe: only called on click) ──
    const tabEngine     = new SuiButton({ id: "se-tab-engine",     callback: () => { void this._tabBar?.switchTo(0); }, theme: { default: { self: { text: "Story Engine" } } } });
    const tabBrainstorm = new SuiButton({ id: "se-tab-brainstorm", callback: () => { void this._tabBar?.switchTo(1); }, theme: { default: { self: { text: "Brainstorm"   } } } });

    this._tabBar = new SuiTabBar({
      id:          "se-main-tab-bar",
      tabs:        [tabEngine, tabBrainstorm],
      panes:       [storyEnginePane, this._brainstormPane],
      storageKey:  "se-active-tab",
      storageMode: "story",
    });

    const tabBarPart     = await this._tabBar.build();
    const lorebookPart   = await new SeLorebookPanel({ id: IDS.LOREBOOK.PANEL }).build();

    // ── Register all extensions in one call ─────────────────────────────────
    const panels: UIExtension[] = [
      sidebarPanel({
        id:      "kse-sidebar",
        name:    "Story Engine",
        iconId:  "lightning",
        content: [tabBarPart],
      }),
      lorebookPanel({
        id:      IDS.LOREBOOK.PANEL,
        name:    "Story Engine",
        iconId:  "zap",
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
          id:      "kse-journal",
          name:    "Generation Journal",
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
          entryId:    params.entryId || null,
          categoryId: params.categoryId || null,
        }),
      );
      if (params.entryId) {
        await reconcileEntitySummaries(store.dispatch, store.getState, params.entryId);
      }
    });
  }
}
