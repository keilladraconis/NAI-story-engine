import { Store } from "../store";
import { Action, RootState } from "../types";
import { ActionTypes, generationRequested } from "../actions";
import { findBlankItems } from "../utils/sega-utils";

export const segaMiddleware = (store: Store<RootState>) => {
  let timer: any = null;

  const tryTriggerSega = () => {
    const state = store.getState();
    if (!state.runtime.segaRunning) return;
    
    // If something is already in queue or generating, let it finish.
    // SEGA fills the gaps when idle.
    if (state.runtime.queue.length > 0 || state.runtime.activeRequest) return;

    if (timer) api.v1.timers.clearTimeout(timer);
    timer = api.v1.timers.setTimeout(() => {
        // Double check state after delay
        const freshState = store.getState();
        if (!freshState.runtime.segaRunning) return;
        if (freshState.runtime.queue.length > 0 || freshState.runtime.activeRequest) return;

        const blanks = findBlankItems(freshState);
        if (blanks.length === 0) {
            // Nothing to do
            api.v1.ui.toast("S.E.G.A. - No more blank fields found.", { type: "success" });
            store.dispatch({ type: ActionTypes.SEGA_TOGGLED, payload: null }); // Turn off
            return;
        }

        const random = blanks[Math.floor(Math.random() * blanks.length)];
        api.v1.ui.toast(`S.E.G.A. Auto-generating...`);
        store.dispatch(generationRequested(random));

    }, 2000); // 2 second delay between generations
  };

  return (next: (action: Action) => void) => (action: Action) => {
    const result = next(action);

    if (action.type === ActionTypes.SEGA_TOGGLED || 
        action.type === ActionTypes.GENERATION_COMPLETED || 
        action.type === ActionTypes.STORY_LOADED) {
        tryTriggerSega();
    }

    return result;
  };
};
