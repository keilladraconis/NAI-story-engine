import { store, storyLoaded } from "./core/store";
import {
  renderMainSidebar,
  renderBrainstormSidebar,
  renderLorebookPanel,
} from "./ui/renderers";
import { uiLorebookSelected } from "./core/store/actions";
import { lorebookSyncSubscriber } from "./core/store/subscribers/lorebook-sync";
import { initialStoryState } from "./core/store/reducers/storyReducer";

(async () => {
  try {
    api.v1.log("Initializing Story Engine (Redux Architecture)...");

    // Request Permissions
    await api.v1.permissions.request(["lorebookEdit", "storyEdit"]);

    // Start Subscribers
    lorebookSyncSubscriber(store);

    // Initial Render & Registration
    const initialState = store.getState();
    const sidebar = renderMainSidebar(initialState);
    const brainstorm = renderBrainstormSidebar(initialState);
    const lorebook = renderLorebookPanel(initialState);

    await api.v1.ui.register([sidebar, brainstorm, lorebook]);

    // Render Loop
    store.subscribe((state, _action) => {
      try {
        const updatedSidebar = renderMainSidebar(state);
        const updatedBrainstorm = renderBrainstormSidebar(state);
        const updatedLorebook = renderLorebookPanel(state);

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
    const data = await api.v1.storyStorage.getOrDefault(
      "kse-story-data",
      initialStoryState,
    );
    store.dispatch(storyLoaded(data));
    api.v1.log("Story data loaded.");

    // Hooks
    api.v1.hooks.register("onLorebookEntrySelected", (params) => {
      store.dispatch(
        uiLorebookSelected(params.entryId || null, params.categoryId || null),
      );
    });
  } catch (e) {
    api.v1.log("Startup error:", e);
  }
})();
