// Scenario Engine
import { StoryEngineUI } from "./ui/story-engine-ui";

// Helpers
const log = api.v1.log;

(async () => {
  try {
    await api.v1.permissions.request(["lorebookEdit"]);
    const storyEngineUI = new StoryEngineUI();

    api.v1.ui.register([
      storyEngineUI.sidebar,
      storyEngineUI.brainstormUI.sidebar
    ]);
  } catch (e) {
    log("Startup error:", e);
  }
})();
