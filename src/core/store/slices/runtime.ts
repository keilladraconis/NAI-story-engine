import { createSlice } from "../../../../lib/nai-store";
import { RuntimeState, GenerationRequest } from "../types";
import { GenerationState } from "../../../../lib/gen-x";

export const initialRuntimeState: RuntimeState = {
  segaRunning: false,
  queue: [],
  activeRequest: null,
  status: "idle",
  budgetTimeRemaining: 0,
  genx: {
    status: "idle",
    queueLength: 0,
  },
};

export const runtimeSlice = createSlice({
  name: "runtime",
  initialState: initialRuntimeState,
  reducers: {
    stateUpdated: (state, payload: { genxState: GenerationState }) => ({
      ...state,
      genx: payload.genxState,
    }),
    segaToggled: (state) => ({
      ...state,
      segaRunning: !state.segaRunning,
    }),

    // Intent (handled by Effects)
    // intentRequestGeneration moved to uiSlice as uiRequestGeneration

    generationRequested: (state, request: GenerationRequest) => ({
      ...state,
      queue: [...state.queue, request],
      status: state.status === "idle" ? "queued" : state.status,
    }),

    requestsSynced: (
      state,
      payload: {
        queue: GenerationRequest[];
        activeRequest: GenerationRequest | null;
      },
    ) => {
      const { queue, activeRequest } = payload;
      let status: any = "idle";
      if (activeRequest) status = "generating";
      else if (queue.length > 0) status = "queued";
      else if (state.genx.status === "failed") status = "error";

      return {
        ...state,
        queue,
        activeRequest,
        status,
      };
    },

    budgetUpdated: (state, payload: { timeRemaining: number }) => ({
      ...state,
      budgetTimeRemaining: payload.timeRemaining,
    }),
  },
});

export const {
  stateUpdated,
  segaToggled,
  generationRequested,
  requestsSynced,
  budgetUpdated,
} = runtimeSlice.actions;
