// Scenario Engine
import { StoryEngineUI } from "./ui/story-engine-ui";

// Helpers
const log = api.v1.log;

(async () => {
  try {
    const storyEngineUI = new StoryEngineUI();

    api.v1.ui.register([storyEngineUI.sidebar]);
  } catch (e) {
    log("Startup error:", e);
  }
})();
