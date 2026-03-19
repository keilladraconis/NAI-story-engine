import {
  store,
  persistedDataLoaded,
  uiLorebookEntrySelected,
} from "./core/store";
import { registerEffects, syncEratoCompatibility } from "./core/store/register-effects";
import { migrateLorebookCategories } from "./core/store/effects/lorebook-sync";
import { GenX } from "nai-gen-x";
import { mount } from "nai-act";
import { stateUpdated, requestActivated } from "./core/store/slices/runtime";
import { IDS, STORAGE_KEYS } from "./ui/framework/ids";

// Brainstorm components
import { BrainstormHeader } from "./ui/components/brainstorm/BrainstormHeader";
import { List } from "./ui/components/brainstorm/List";
import { Input } from "./ui/components/brainstorm/Input";

// Sidebar components
import { Header } from "./ui/components/Sidebar/Header";

// v11 Story Engine components
import { NarrativeFoundation } from "./ui/components/Foundation/NarrativeFoundation";
import { ForgeSection } from "./ui/components/Forge/ForgeSection";
import { WorldBatchList } from "./ui/components/World/WorldBatchList";

// Lorebook components
import { LorebookPanelContent } from "./ui/components/Lorebook/LorebookPanelContent";

// Bind modal
import { openBindModal } from "./ui/components/Bind/BindModal";

// Journal
import { JournalPanel } from "./ui/components/JournalPanel";
import { loadJournal } from "./core/generation-journal";

const { column, row, button } = api.v1.ui.part;
const { sidebarPanel, lorebookPanel, scriptPanel } = api.v1.ui.extension;

(async () => {
  try {
    api.v1.log("Initializing Story Engine v11...");

    api.v1.permissions.request(["storyEdit", "lorebookEdit", "documentEdit"]);

    // 1. Initialize GenX with lifecycle hooks
    const genX = new GenX({
      onStateChange(genxState) {
        store.dispatch(stateUpdated({ genxState }));
      },
      onTaskStarted(taskId) {
        store.dispatch(requestActivated({ requestId: taskId }));
      },
    });

    // 2. Register Effects
    registerEffects(store, genX);

    // 3. Load Data
    const persisted = await api.v1.storyStorage.get(STORAGE_KEYS.PERSIST);
    if (persisted) store.dispatch(persistedDataLoaded(persisted));

    // 3b. Migrate legacy lorebook category names
    await migrateLorebookCategories();

    // 3c. Sync Erato compatibility (migrate entries/categories if toggled)
    await syncEratoCompatibility(store.getState);

    // 4. Mount all components
    const { part: brainstormHeaderPart } = mount(BrainstormHeader, undefined, store);
    const { part: listPart } = mount(List, undefined, store);
    const { part: inputPart } = mount(Input, {}, store);
    const { part: headerPart } = mount(Header, {}, store);
    const { part: foundationPart } = mount(NarrativeFoundation, undefined, store);
    const { part: forgePart } = mount(ForgeSection, undefined, store);
    const { part: batchListPart } = mount(WorldBatchList, undefined, store);
    const { part: lorebookPart } = mount(LorebookPanelContent, undefined, store);

    // 5. Compose panels
    const brainstormPanel = sidebarPanel({
      id: "kse-brainstorm-sidebar",
      name: "Brainstorm",
      iconId: "cloud-lightning",
      content: [
        column({
          id: IDS.BRAINSTORM.ROOT,
          style: { height: "100%", "justify-content": "space-between" },
          content: [brainstormHeaderPart, listPart, inputPart],
        }),
      ],
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
            foundationPart,
            forgePart,
            batchListPart,
            // Footer: Relationships | Bind New | Rebind
            row({
              id: "se-footer",
              style: { gap: "4px", "margin-top": "8px" },
              content: [
                button({
                  id: "se-footer-relationships",
                  text: "Relationships",
                  style: { flex: "1", "font-size": "0.8em" },
                  callback: () => { /* Phase 6: Relationships modal */ },
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

    // 6. Conditional: Generation Journal panel
    const panels: UIExtension[] = [
      brainstormPanel,
      storyEnginePanel,
      lorebookGenPanel,
    ];

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

    // Register lorebook entry selection hook
    api.v1.hooks.register("onLorebookEntrySelected", (params) => {
      store.dispatch(
        uiLorebookEntrySelected({
          entryId: params.entryId || null,
          categoryId: params.categoryId || null,
        }),
      );
    });

    api.v1.log("Story Engine v11 Initialized.");
  } catch (e) {
    api.v1.log("Startup error:", e);
  }
})();
