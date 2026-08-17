// The loop's state, mirrored into the store so the HUD can subscribe to it.
//
// The slice holds a `LoopState` and nothing else, and the ONLY way it changes is
// by folding a `LoopEvent` through `loopReducer` — the machine stays the single
// definition of the lifecycle, and this file adds no second opinion about what
// `assessed` or `failed` mean. The effect dispatches events; the store is the
// projection.
//
// One action is not a machine event. `engineBacklogObserved` records how far
// behind the Engine is WITHOUT starting or advancing a pass, which is what the
// `engine_min_prose` gate needs: below the threshold no pass runs, and the HUD
// must still show the paragraphs nobody has read rather than the zero a faked
// `assessed` would leave behind (plan, Task 7). It touches `backlog` only —
// never `phase` — so it cannot move the lifecycle from outside the machine.

import { createSlice } from "nai-store";
import {
  initialLoopState,
  loopReducer,
  type LoopEvent,
  type LoopState,
} from "../../engine/loop-machine";

/** The machine's state plus one thing the machine has no business knowing: the
 *  `engine_enabled` setting. It lives here rather than in `LoopState` so the
 *  reducer stays a pure lifecycle, and here rather than as a HUD input because
 *  `api.v1.config.get` is async and a component cannot await — mirroring it into
 *  the store lets the HUD read it synchronously and repaint when it changes. */
export type EngineSliceState = LoopState & { enabled: boolean };

export const initialEngineState: EngineSliceState = {
  ...initialLoopState,
  // Matches ENGINE_DEFAULTS.enabled. The HUD reads "off" until the effect has
  // read the real setting, which is the honest reading before we know.
  enabled: false,
};

export const engineSlice = createSlice({
  name: "engine",
  initialState: initialEngineState,
  reducers: {
    /** Fold one machine event. The effect owns which events happen and when.
     *  `enabled` is carried across untouched — it is not part of the machine. */
    engineLoopEvent: (state, payload: LoopEvent) => ({
      ...loopReducer(state, payload),
      enabled: state.enabled,
    }),

    /** The `engine_enabled` setting, as the effect last read it. */
    engineEnabledChanged: (state, payload: { enabled: boolean }) =>
      state.enabled === payload.enabled
        ? state
        : { ...state, enabled: payload.enabled },

    /** How much unread prose there is, as of a pass that never started. */
    engineBacklogObserved: (state, payload: { backlog: number }) =>
      state.backlog === payload.backlog
        ? state
        : { ...state, backlog: payload.backlog },
  },
});

export const engineSliceReducer = engineSlice.reducer;
export const { engineLoopEvent, engineBacklogObserved, engineEnabledChanged } =
  engineSlice.actions;
