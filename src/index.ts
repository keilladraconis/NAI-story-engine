import { createEffectRunner, createStore, RootState } from "./core/store";
import { registerEffects } from "./core/store/effects";
import { renderMainSidebar, renderLorebookPanel } from "./ui/renderers";
import { BrainstormManager } from "./ui/controllers/brainstorm/manager";
import { uiLorebookSelected, runtimeStateUpdated } from "./core/store/actions";
import {
  initialRootState,
  rootReducer,
} from "./core/store/reducers/rootReducer";
import { GenX } from "../lib/gen-x";

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
    const { getState, dispatch, subscribe } = store;

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

    // Managers
    const brainstormManager = new BrainstormManager(store);

    // Initial Render & Registration
    const initialState = getState();
    const sidebar = renderMainSidebar(initialState, dispatch);
    const brainstorm = brainstormManager.register();
    const lorebook = renderLorebookPanel(initialState, dispatch);

    await api.v1.ui.register([sidebar, brainstorm, lorebook]);

    // Mount Managers (Start Subscriptions)
    brainstormManager.mount();

    // Render Loop
    subscribe((state, _action) => {
      try {
        const updatedSidebar = renderMainSidebar(state, dispatch);
        const updatedLorebook = renderLorebookPanel(state, dispatch);

        // Brainstorm updates are handled by BrainstormManager internally

        api.v1.ui.update([updatedSidebar, updatedLorebook] as (UIExtension & {
          id: string;
        })[]);
      } catch (e) {
        api.v1.log("Render error:", e);
      }
    });

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
