import { store, brainstormLoaded, storyLoaded } from "./core/store";
import { registerEffects } from "./core/store/effects";
import { GenX } from "../lib/gen-x";
import { describeBrainstormPanel } from "./ui/components/brainstorm/Panel";
import { Sidebar } from "./ui/components/Sidebar/Sidebar";
import { List } from "./ui/components/brainstorm/List";
import { Input } from "./ui/components/brainstorm/Input";
import { mount } from "../lib/nai-act";
import { stateUpdated } from "./core/store/slices/runtime";

(async () => {
  try {
    api.v1.log("Initializing Story Engine (Refactored)...");

    // 1. Initialize GenX
    const genX = new GenX();
    genX.subscribe((genxState) => {
      store.dispatch(stateUpdated({ genxState }));
    });

    // 2. Register Effects
    registerEffects(store, genX);

    // 3. Load Data
    try {
      const persisted = await api.v1.storyStorage.get("kse-persist");
      if (persisted && typeof persisted === "object") {
        const { story, brainstorm } = persisted as any;
        if (story) store.dispatch(storyLoaded({ story }));
        if (brainstorm && brainstorm.messages)
          store.dispatch(brainstormLoaded({ messages: brainstorm.messages }));
      }
    } catch (e) {
      api.v1.log("Error loading persisted data:", e);
    }

    // 4. Register UI Extensions
    // Pass initial state for hydration
    const brainstormExt = describeBrainstormPanel(store.getState());
    const sidebarExt = Sidebar.describe({}) as any; // Cast as any because types might mismatch with UI extension expectation if strict

    await api.v1.ui.register([brainstormExt, sidebarExt]);

    // 5. Mount Components (Start Subscriptions)
    // List component should receive initial state for consistency if it uses it in onMount
    // but onMount typically starts useSelector which handles the first state read.
    mount(
      List,
      { initialMessages: store.getState().brainstorm.messages },
      store,
    );
    mount(Input, {}, store);
    mount(Sidebar, {}, store);

    api.v1.log("Story Engine Initialized.");
  } catch (e) {
    api.v1.log("Startup error:", e);
  }
})();
