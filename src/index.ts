import {
  store,
  brainstormLoaded,
  storyLoaded,
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
} from "./core/store";
import { StoryState, BrainstormMessage } from "./core/store/types";
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

// Lorebook components
import { LorebookPanelContent } from "./ui/components/Lorebook/LorebookPanelContent";
import { GenerationButton } from "./ui/components/GenerationButton";

const { column } = api.v1.ui.part;
const { sidebarPanel, lorebookPanel } = api.v1.ui.extension;

(async () => {
  try {
    api.v1.log("Initializing Story Engine (Refactored)...");

    api.v1.permissions.request(["storyEdit", "lorebookEdit", "documentEdit"]);

    // 1. Initialize GenX
    const genX = new GenX();
    genX.subscribe((genxState) => {
      store.dispatch(stateUpdated({ genxState }));
    });

    // 2. Register Effects
    registerEffects(store, genX);

    // 3. Load Data
    interface PersistedState {
      story?: StoryState;
      brainstorm?: { messages: BrainstormMessage[] };
    }
    try {
      const persisted = await api.v1.storyStorage.get("kse-persist");
      if (persisted && typeof persisted === "object") {
        const { story, brainstorm } = persisted as PersistedState;
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

    // Lorebook Panel (appears in Lorebook when entry is selected)
    const lorebookGenPanel = lorebookPanel({
      id: IDS.LOREBOOK.PANEL,
      name: "Story Engine",
      iconId: "zap",
      content: [LorebookPanelContent.describe()],
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

    // 5. Mount Components (start reactive subscriptions)
    mount(List, undefined, store);
    mount(Input, {}, store);
    mount(Header, {}, store);
    mount(SettingField, {}, store);
    mount(FieldList, {}, store);
    mount(LorebookPanelContent, undefined, store);

    // Mount Lorebook generation buttons (they self-manage based on selectedEntryId via stateProjection)
    mount(
      GenerationButton,
      {
        id: IDS.LOREBOOK.GEN_CONTENT_BTN,
        label: "Generate Content",
        stateProjection: (state) => state.ui.lorebook.selectedEntryId,
        requestIdFromProjection: (entryId: string | null) =>
          entryId ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ : undefined,
        isDisabledFromProjection: (entryId: string | null) => !entryId,
        onGenerate: () => {
          const entryId = store.getState().ui.lorebook.selectedEntryId;
          if (entryId) {
            store.dispatch(
              uiLorebookContentGenerationRequested({
                requestId: IDS.LOREBOOK.entry(entryId).CONTENT_REQ,
              }),
            );
          }
        },
      },
      store,
    );
    mount(
      GenerationButton,
      {
        id: IDS.LOREBOOK.GEN_KEYS_BTN,
        label: "Generate Keys",
        stateProjection: (state) => state.ui.lorebook.selectedEntryId,
        requestIdFromProjection: (entryId: string | null) =>
          entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined,
        isDisabledFromProjection: (entryId: string | null) => !entryId,
        onGenerate: () => {
          const entryId = store.getState().ui.lorebook.selectedEntryId;
          if (entryId) {
            store.dispatch(
              uiLorebookKeysGenerationRequested({
                requestId: IDS.LOREBOOK.entry(entryId).KEYS_REQ,
              }),
            );
          }
        },
      },
      store,
    );

    api.v1.log("Story Engine Initialized.");
  } catch (e) {
    api.v1.log("Startup error:", e);
  }
})();
