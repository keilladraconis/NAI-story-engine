import {
  createEffectRunner,
  createStore,
  RootState,
} from "./core/store";
import { registerEffects } from "./core/store/effects";
import {
  renderMainSidebar,
  renderBrainstormSidebar,
  renderLorebookPanel,
} from "./ui/renderers";
import { uiLorebookSelected } from "./core/store/actions";
import {
  initialRootState,
  rootReducer,
} from "./core/store/reducers/rootReducer";
import { GenX } from "../lib/gen-x";

(async () => {
  try {
    api.v1.log("Initializing Story Engine (Redux Architecture)...");

    // Request Permissions
    await api.v1.permissions.request(["lorebookEdit", "storyEdit"]);

    // Initialize GenX
    const genX = new GenX();

    // Start store
    const store = createStore<RootState>(rootReducer, initialRootState);
    const { getState, dispatch, subscribe } = store;
    const effects = createEffectRunner(store);

    // Register Effects
    registerEffects(effects, genX);

    store.subscribeToActions((action) => {
      effects.run(action);
    });

    // Initial Render & Registration
    const initialState = getState();
    const sidebar = renderMainSidebar(initialState, dispatch);
    const brainstorm = renderBrainstormSidebar(initialState, dispatch);
    const lorebook = renderLorebookPanel(initialState, dispatch);

    await api.v1.ui.register([sidebar, brainstorm, lorebook]);

    // Render Loop
    subscribe((state, _action) => {
      try {
        const updatedSidebar = renderMainSidebar(state, dispatch);
        const updatedBrainstorm = renderBrainstormSidebar(state, dispatch);
        const updatedLorebook = renderLorebookPanel(state, dispatch);

        api.v1.ui.update([
          updatedSidebar,
          updatedBrainstorm,
          updatedLorebook,
        ] as (UIExtension & { id: string })[]);
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
