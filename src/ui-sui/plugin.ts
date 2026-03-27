/**
 * StoryEnginePlugin — Phase 0 skeleton.
 *
 * Wraps the existing initialization sequence in SuiPlugin's lifecycle.
 * UI is still entirely nai-act for now; panels are registered directly via
 * api.v1.ui.register(). Later phases will replace each panel with SUI components.
 */

import { SuiPlugin } from "nai-simple-ui";
import { GenX } from "nai-gen-x";
import { mount } from "nai-act";

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

// Phase 2: SUI brainstorm components
import { BrainstormPane } from "./components/BrainstormPane";
// Phase 3: SUI forge + foundation components
import { ForgePane } from "./components/ForgePane";

// nai-act components (unchanged — replaced panel by panel)
import { Header } from "../ui/components/Sidebar/Header";
import { WorldBatchList } from "../ui/components/World/WorldBatchList";
import { LorebookPanelContent } from "../ui/components/Lorebook/LorebookPanelContent";
import { openBindModal } from "../ui/components/Bind/BindModal";
import { openRelationshipsModal } from "../ui/components/Relationships/RelationshipsModal";
import { JournalPanel } from "../ui/components/JournalPanel";
import { loadJournal } from "../core/generation-journal";

const { column, row, button } = api.v1.ui.part;
const { sidebarPanel, lorebookPanel, scriptPanel } = api.v1.ui.extension;

export class StoryEnginePlugin extends SuiPlugin {
  private _genX?: GenX;
  private _brainstormPane?: BrainstormPane;
  private _forgePane?: ForgePane;

  protected requestPermissions(): void {
    api.v1.permissions.request(["storyEdit", "lorebookEdit", "documentEdit"]);
  }

  /**
   * Override build() to initialize GenX and store before compose() runs.
   * SuiPlugin.build() calls hydrateState() + compose() — we prepend setup.
   */
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

  /**
   * compose() — Phase 0: mount nai-act components and register raw UIExtension panels.
   * Will be replaced panel-by-panel in later phases.
   */
  private async _rebuildBrainstorm(): Promise<void> {
    if (!this._brainstormPane) return;
    const newContent = await this._brainstormPane.build();
    await api.v1.ui.update([
      { type: "sidebarPanel", id: "kse-brainstorm-sidebar", content: [newContent] } as unknown as Partial<UIExtension> & { id: string },
    ]);
  }

  protected async compose(): Promise<void> {
    // Phase 2: Brainstorm panel — fully SUI
    this._brainstormPane = new BrainstormPane({
      id:        IDS.BRAINSTORM.ROOT,
      onRebuild: () => { void this._rebuildBrainstorm(); },
    });
    const brainstormContent = await this._brainstormPane.build();

    this._forgePane = new ForgePane({ id: "se-forge-pane" });
    const forgePanePart = await this._forgePane.build();

    const { part: headerPart } = mount(Header, {}, store);
    const { part: batchListPart } = mount(WorldBatchList, undefined, store);
    const { part: lorebookPart } = mount(LorebookPanelContent, undefined, store);

    const brainstormPanel = sidebarPanel({
      id:     "kse-brainstorm-sidebar",
      name:   "Brainstorm",
      iconId: "cloud-lightning",
      content: [brainstormContent],
    });

    const storyEnginePanel = sidebarPanel({
      id: "kse-sidebar",
      name: "Story Engine",
      iconId: "lightning",
      content: [
        column({
          style: { gap: "8px" },
          content: [
            headerPart,
            forgePanePart,
            batchListPart,
            row({
              id: "se-footer",
              style: { gap: "4px", "margin-top": "8px" },
              content: [
                button({
                  id: "se-footer-relationships",
                  text: "Relationships",
                  style: { flex: "1", "font-size": "0.8em" },
                  callback: () => openRelationshipsModal({ getState: store.getState, dispatch: store.dispatch }),
                }),
                button({
                  id: "se-footer-bind-new",
                  text: "Bind New",
                  style: { flex: "1", "font-size": "0.8em" },
                  callback: () => openBindModal({ getState: store.getState, dispatch: store.dispatch }),
                }),
                button({
                  id: "se-footer-rebind",
                  text: "Rebind",
                  style: { flex: "1", "font-size": "0.8em" },
                  callback: () => openBindModal({ getState: store.getState, dispatch: store.dispatch }),
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const lorebookGenPanel = lorebookPanel({
      id: IDS.LOREBOOK.PANEL,
      name: "Story Engine",
      iconId: "zap",
      content: [lorebookPart],
    });

    const panels: UIExtension[] = [brainstormPanel, storyEnginePanel, lorebookGenPanel];

    const journalEnabled = await api.v1.config.get("generation_journal");
    if (journalEnabled) {
      api.v1.permissions.request(["clipboardWrite"]);
      await loadJournal();
      const { part: journalPart } = mount(JournalPanel, undefined, store);
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
