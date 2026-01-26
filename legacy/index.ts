import { createEffectRunner, createStore, RootState } from "./core/store";
import { registerEffects } from "./core/store/effects";
import { Sidebar } from "./ui/components/Sidebar/Sidebar";
import { LorebookPanel } from "./ui/components/Lorebook/LorebookPanel";

import { uiLorebookSelected, runtimeStateUpdated } from "./core/store/actions";
import {
  initialRootState,
  rootReducer,
} from "./core/store/reducers/rootReducer";
import { GenX } from "../lib/gen-x";
import { mount } from "../lib/nai-act";

(async () => {
  try {
    api.v1.log(
      "Initializing Story Engine (Redux Architecture + Reactive Runtime)...",
    );

    // Request Permissions
    await api.v1.permissions.request(["lorebookEdit", "storyEdit"]);

    // Initialize GenX
    const genX = new GenX();

    // Start store
    const store = createStore<RootState>(rootReducer, initialRootState);
    const { getState, dispatch } = store;

    // Link GenX to Store
    genX.subscribe((genxState) => {
      dispatch(runtimeStateUpdated({ genxState }));
    });

    const effects = createEffectRunner(store);

    // Register Effects
    registerEffects(effects, genX);

    store.subscribeToActions((action) => {
      effects.run(action);
    });

    // Managers & Components

    // Initial Render & Registration
    const initialState = getState();
    const sidebar = Sidebar.describe({}, initialState) as UIExtension;
    const lorebook = LorebookPanel.describe({}, initialState) as UIExtension;

    await api.v1.ui.register([sidebar, lorebook]);

    // Mount Managers (Start Subscriptions)
    
    try {
        mount(Sidebar, {}, store);
        mount(LorebookPanel, {}, store);
    } catch (err) {
        api.v1.log("Mount error:", err);
    }

    // Hydrate State
    dispatch({ type: "story/loadRequested", payload: undefined });
    api.v1.log("Story load requested.");

    // Hooks
    api.v1.hooks.register("onLorebookEntrySelected", (params) => {
      dispatch(
        uiLorebookSelected({
          entryId: params.entryId || null,
          categoryId: params.categoryId || null,
        }),
      );
    });
  } catch (e) {
    api.v1.log("Startup error:", e);
  }
})();
