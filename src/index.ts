import {
  store,
  brainstormLoaded,
  storyLoaded,
  crucibleLoaded,
  uiLorebookEntrySelected,
} from "./core/store";
import { StoryState, BrainstormMessage, CrucibleState } from "./core/store/types";
import { registerEffects, syncEratoCompatibility } from "./core/store/effects";
import { GenX } from "nai-gen-x";
import { mount } from "nai-act";
import { stateUpdated, requestActivated } from "./core/store/slices/runtime";
import { IDS } from "./ui/framework/ids";

// Brainstorm components
import { List } from "./ui/components/brainstorm/List";
import { Input } from "./ui/components/brainstorm/Input";

// Sidebar components
import { Header } from "./ui/components/Sidebar/Header";
import { SettingField } from "./ui/components/Sidebar/SettingField";
import { FieldList } from "./ui/components/Sidebar/FieldList";

// Lorebook components
import { LorebookPanelContent } from "./ui/components/Lorebook/LorebookPanelContent";

const { column } = api.v1.ui.part;
const { sidebarPanel, lorebookPanel } = api.v1.ui.extension;

(async () => {
  try {
    api.v1.log("Initializing Story Engine (Refactored)...");

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
    interface PersistedState {
      story?: StoryState;
      brainstorm?: { messages: BrainstormMessage[] };
      crucible?: CrucibleState;
    }
    try {
      const persisted = await api.v1.storyStorage.get("kse-persist");
      if (persisted && typeof persisted === "object") {
        const { story, brainstorm, crucible } = persisted as PersistedState;
        if (story) store.dispatch(storyLoaded({ story }));
        if (brainstorm && brainstorm.messages)
          store.dispatch(brainstormLoaded({ messages: brainstorm.messages }));
        if (crucible) store.dispatch(crucibleLoaded({ crucible }));
      }
    } catch (e) {
      api.v1.log("Error loading persisted data:", e);
    }

    // 3b. Sync Erato compatibility (migrate entries/categories if toggled)
    await syncEratoCompatibility(store.getState);

    // 4. Mount all components (returns UIPart + sets up subscriptions)
    const { part: listPart } = mount(List, undefined, store);
    const { part: inputPart } = mount(Input, {}, store);
    const { part: headerPart } = mount(Header, {}, store);
    const { part: settingPart } = mount(SettingField, {}, store);
    const { part: fieldListPart } = mount(FieldList, {}, store);
    const { part: lorebookPart } = mount(LorebookPanelContent, undefined, store);

    // 5. Compose panels from returned parts
    const brainstormPanel = sidebarPanel({
      id: "kse-brainstorm-sidebar",
      name: "Brainstorm",
      iconId: "cloud-lightning",
      content: [
        column({
          id: IDS.BRAINSTORM.ROOT,
          style: { height: "100%", "justify-content": "space-between" },
          content: [listPart, inputPart],
        }),
      ],
    });

    const storyEnginePanel = sidebarPanel({
      id: "kse-sidebar",
      name: "Story Engine",
      iconId: "lightning",
      content: [
        column({
          content: [headerPart, settingPart, fieldListPart],
        }),
      ],
    });

    const lorebookGenPanel = lorebookPanel({
      id: IDS.LOREBOOK.PANEL,
      name: "Story Engine",
      iconId: "zap",
      content: [lorebookPart],
    });

    await api.v1.ui.register([
      brainstormPanel,
      storyEnginePanel,
      lorebookGenPanel,
    ]);

    // Register lorebook entry selection hook
    api.v1.hooks.register("onLorebookEntrySelected", (params) => {
      store.dispatch(
        uiLorebookEntrySelected({
          entryId: params.entryId || null,
          categoryId: params.categoryId || null,
        }),
      );
    });

    api.v1.log("Story Engine Initialized.");
  } catch (e) {
    api.v1.log("Startup error:", e);
  }
})();
