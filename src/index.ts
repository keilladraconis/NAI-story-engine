// Scenario Engine
import { StoryEngineUI } from "./ui/story-engine-ui";
import { StoryManager } from "./core/story-manager";
import { Dispatcher } from "./core/store";

// Helpers
const log = api.v1.log;

(async () => {
  try {
    await api.v1.permissions.request(["lorebookEdit", "storyEdit"]);
    
    const storyManager = new StoryManager();
    const dispatcher = new Dispatcher(storyManager.store);
    
    // Bind dispatch to the dispatcher instance
    const dispatch = dispatcher.dispatch.bind(dispatcher);

    const ui = new StoryEngineUI(storyManager, dispatch);
    await ui.init();

    api.v1.ui.register([ui.brainstormUI.sidebar, ui.sidebar, ui.lorebookPanel]);
  } catch (e) {
    log("Startup error:", e);
  }
})();
