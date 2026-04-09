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
  uiLorebookEntrySelected,
} from "../core/store";
import {
  registerEffects,
  syncEratoCompatibility,
} from "../core/store/register-effects";
import {
  migrateLorebookCategories,
  registerLorebookSyncHooks,
} from "../core/store/effects/lorebook-sync";
import { stateUpdated, requestActivated } from "../core/store/slices/runtime";
import { IDS, STORAGE_KEYS } from "./framework/ids";
import type { EditPaneHost } from "./components/SeContentWithTitlePane";

import { BrainstormPane } from "./components/BrainstormPane";
import { ForgePane } from "./components/ForgePane";
import { SeHeaderBar } from "./components/SeHeaderBar";
import { SeLorebookPanel } from "./components/SeLorebookPanel";
import { SeJournalPanel } from "./components/SeJournalPanel";
import { loadJournal } from "../core/generation-journal";

const { sidebarPanel, lorebookPanel, scriptPanel } = api.v1.ui.extension;


export class StoryEnginePlugin extends SuiPlugin {
  private _genX?: GenX;
  private _brainstormPane?: BrainstormPane;
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
      {
        id: "se-main-tab-bar.pane.1",
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
    // ── Brainstorm pane ─────────────────────────────────────────────────────
    this._brainstormPane = new BrainstormPane({
      id: IDS.BRAINSTORM.ROOT,
      onRebuild: () => {
        void this._rebuildBrainstorm();
      },
    });

    // ── Story Engine pane ───────────────────────────────────────────────────
    this._seHeaderBar = new SeHeaderBar({ id: "kse-sidebar-header" });
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
    const tabEngine = new SuiButton({
      id: "se-tab-engine",
      callback: () => {
        void this._tabBar?.switchTo(0);
      },
      theme: { default: { self: { text: "Story Engine" } } },
    });
    const tabBrainstorm = new SuiButton({
      id: "se-tab-brainstorm",
      callback: () => {
        void this._tabBar?.switchTo(1);
      },
      theme: { default: { self: { text: "Brainstorm" } } },
    });

    this._tabBar = new SuiTabBar({
      id: "se-main-tab-bar",
      tabs: [tabEngine, tabBrainstorm],
      panes: [storyEnginePane, this._brainstormPane],
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
    const lorebookPart = await new SeLorebookPanel({
      id: IDS.LOREBOOK.PANEL,
    }).build();

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
  }

  protected async registerHooks(): Promise<void> {
    api.v1.hooks.register("onLorebookEntrySelected", async (params) => {
      store.dispatch(
        uiLorebookEntrySelected({
          entryId: params.entryId || null,
          categoryId: params.categoryId || null,
        }),
      );
    });
  }
}
