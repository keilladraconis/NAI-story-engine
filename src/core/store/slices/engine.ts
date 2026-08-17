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

export type EngineSliceState = LoopState;

export const initialEngineState: EngineSliceState = initialLoopState;

export const engineSlice = createSlice({
  name: "engine",
  initialState: initialEngineState,
  reducers: {
    /** Fold one machine event. The effect owns which events happen and when. */
    engineLoopEvent: (state, payload: LoopEvent) => loopReducer(state, payload),

    /** How much unread prose there is, as of a pass that never started. */
    engineBacklogObserved: (state, payload: { backlog: number }) =>
      state.backlog === payload.backlog
        ? state
        : { ...state, backlog: payload.backlog },
  },
});

export const engineSliceReducer = engineSlice.reducer;
export const { engineLoopEvent, engineBacklogObserved } = engineSlice.actions;
