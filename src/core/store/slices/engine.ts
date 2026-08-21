// The loop's state, mirrored into the store so the HUD can subscribe to it.
//
// The slice holds a `LoopState` and nothing else, and the ONLY way it changes is
// by folding a `LoopEvent` through `loopReducer` — the machine stays the single
// definition of the lifecycle, and this file adds no second opinion about what
// `assessed` or `failed` mean. The effect dispatches events; the store is the
// projection.
//
// Two actions are not machine events. `engineSettingsChanged` carries the
// settings the effect last read from storage, and `engineBacklogObserved`
// records how far behind the Engine is WITHOUT starting or advancing a pass,
// which is what the minimum-new-prose gate needs: below the threshold no pass
// runs, and the HUD must still show the paragraphs nobody has read rather than
// the zero a faked `assessed` would leave behind (plan, Task 7). It touches
// `backlog` only — never `phase` — so it cannot move the lifecycle from outside
// the machine.

import { createSlice } from "nai-store";
import { ENGINE_DEFAULTS, type EngineSettings } from "../../engine/settings";
import {
  initialLoopState,
  loopReducer,
  type LoopEvent,
  type LoopState,
} from "../../engine/loop-machine";

/** The machine's state plus one thing the machine has no business knowing: the
 *  Engine's settings. They live beside `LoopState` rather than inside it so the
 *  reducer stays a pure lifecycle, and in the store rather than as a component
 *  read because `readEngineSettings` is async and a component cannot await —
 *  mirroring them here lets the HUD and the Setup form read them synchronously
 *  and repaint when they change. */
export type EngineSliceState = LoopState & { settings: EngineSettings };

export const initialEngineState: EngineSliceState = {
  ...initialLoopState,
  // The defaults — Engine off — until the effect's startup read lands. That is
  // the honest reading before we know, and it is corrected within a tick.
  settings: ENGINE_DEFAULTS,
};

/** Whether two settings objects say the same thing, so a re-read that changed
 *  nothing returns the same state and the HUD does not repaint for it. */
function same(a: EngineSettings, b: EngineSettings): boolean {
  return (
    a.enabled === b.enabled &&
    a.delayMs === b.delayMs &&
    a.minProse === b.minProse &&
    a.threadCap === b.threadCap
  );
}

export const engineSlice = createSlice({
  name: "engine",
  initialState: initialEngineState,
  reducers: {
    /** Fold one machine event. The effect owns which events happen and when.
     *  `settings` is carried across untouched — not part of the machine. */
    engineLoopEvent: (state, payload: LoopEvent) => ({
      ...loopReducer(state, payload),
      settings: state.settings,
    }),

    /** The whole settings object, as the effect last read it — or as the Setup
     *  form just wrote it.
     *
     *  The WHOLE object on purpose. An action carrying `enabled` alone (which is
     *  what this was) leaves `delayMs` and `minProse` at their defaults forever,
     *  because no other code path ever dispatches them: a writer whose story has
     *  3000/4 saved would open the Setup form and read 8000/1. */
    engineSettingsChanged: (state, payload: EngineSettings) =>
      same(state.settings, payload) ? state : { ...state, settings: payload },

    /** How much unread prose there is, as of a pass that never started. */
    engineBacklogObserved: (state, payload: { backlog: number }) =>
      state.backlog === payload.backlog
        ? state
        : { ...state, backlog: payload.backlog },
  },
});

export const engineSliceReducer = engineSlice.reducer;
export const { engineLoopEvent, engineBacklogObserved, engineSettingsChanged } =
  engineSlice.actions;
