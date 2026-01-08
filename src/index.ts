// Scenario Engine
import { StoryEngineUI } from "./ui/story-engine-ui";

// Helpers
const log = api.v1.log;

(async () => {
  try {
    await api.v1.permissions.request(["lorebookEdit", "storyEdit"]);
    const ui = new StoryEngineUI();
    await ui.init();

    api.v1.ui.register([ui.brainstormUI.sidebar, ui.sidebar, ui.lorebookPanel]);
  } catch (e) {
    log("Startup error:", e);
  }
})();
