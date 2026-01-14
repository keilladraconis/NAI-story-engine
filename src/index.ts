// Scenario Engine
import { StoryEngineUI } from "./ui/story-engine-ui";
import { StoryManager } from "./core/story-manager";
import { Dispatcher, Store } from "./core/store";
import { StoryDataManager } from "./core/story-data-manager";

// Helpers
const log = api.v1.log;

(async () => {
  try {
    await api.v1.permissions.request(["lorebookEdit", "storyEdit"]);
    
    const dataManager = new StoryDataManager();
    const store = new Store(dataManager.createDefaultData());
    const dispatcher = new Dispatcher(store);
    
    // Bind dispatch to the dispatcher instance
    const dispatch = dispatcher.dispatch.bind(dispatcher);
    
    const storyManager = new StoryManager(store, dispatch);

    const ui = new StoryEngineUI(storyManager, dispatch);
    await ui.init();

    api.v1.ui.register([ui.brainstormUI.sidebar, ui.sidebar, ui.lorebookPanel]);
  } catch (e) {
    log("Startup error:", e);
  }
})();
