import { store, brainstormLoaded, storyLoaded } from "./core/store";
import { registerEffects } from "./core/store/effects";
import { GenX } from "../lib/gen-x";
import { mount } from "../lib/nai-act";
import { stateUpdated } from "./core/store/slices/runtime";
import { IDS } from "./ui/framework/ids";

// Brainstorm components
import { List } from "./ui/components/brainstorm/List";
import { Input } from "./ui/components/brainstorm/Input";

// Sidebar components
import { Header } from "./ui/components/Sidebar/Header";
import { SettingField } from "./ui/components/Sidebar/SettingField";
import { FieldList } from "./ui/components/Sidebar/FieldList";

const { column } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

(async () => {
  try {
    api.v1.log("Initializing Story Engine (Refactored)...");

    // 1. Initialize GenX
    const genX = new GenX();
    genX.subscribe((genxState) => {
      store.dispatch(stateUpdated({ genxState }));
    });

    // 2. Register Effects
    registerEffects(store, genX);

    // 3. Load Data
    try {
      const persisted = await api.v1.storyStorage.get("kse-persist");
      if (persisted && typeof persisted === "object") {
        const { story, brainstorm } = persisted as any;
        if (story) store.dispatch(storyLoaded({ story }));
        if (brainstorm && brainstorm.messages)
          store.dispatch(brainstormLoaded({ messages: brainstorm.messages }));
      }
    } catch (e) {
      api.v1.log("Error loading persisted data:", e);
    }

    // 4. Register UI Extensions (static declarations, not components)
    const brainstormPanel = sidebarPanel({
      id: "kse-brainstorm-sidebar",
      name: "Brainstorm",
      iconId: "cloud-lightning",
      content: [
        column({
          id: IDS.BRAINSTORM.ROOT,
          style: { height: "100%", "justify-content": "space-between" },
          content: [List.describe(), Input.describe({})],
        }),
      ],
    });

    const storyEnginePanel = sidebarPanel({
      id: "kse-sidebar",
      name: "Story Engine",
      iconId: "lightning",
      content: [
        column({
          content: [
            Header.describe({}),
            SettingField.describe({}),
            FieldList.describe({}),
          ],
        }),
      ],
    });

    await api.v1.ui.register([brainstormPanel, storyEnginePanel]);

    // 5. Mount Components (start reactive subscriptions)
    mount(List, undefined, store);
    mount(Input, {}, store);
    mount(Header, {}, store);
    mount(SettingField, {}, store);
    mount(FieldList, {}, store);

    api.v1.log("Story Engine Initialized.");
  } catch (e) {
    api.v1.log("Startup error:", e);
  }
})();
