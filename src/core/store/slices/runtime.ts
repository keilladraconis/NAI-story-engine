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

    // User intent: Request generation (triggers effect to build strategy)
    uiGenerationRequested: (
      state,
      request: Omit<GenerationRequest, "status">,
    ) => ({
      ...state,
      queue: [...state.queue, { ...request, status: "queued" as const }],
      status: state.status === "idle" ? "queued" : state.status,
    }),

    // Just adds to queue (no effect, for when strategy is already built)
    requestQueued: (state, request: Omit<GenerationRequest, "status">) => ({
      ...state,
      queue: [...state.queue, { ...request, status: "queued" as const }],
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

    // Mark a request as cancelled (status change on the request itself)
    requestCancelled: (state, payload: { requestId: string }) => {
      // Check if in queue
      const queueIndex = state.queue.findIndex(
        (r) => r.id === payload.requestId,
      );
      if (queueIndex >= 0) {
        const newQueue = [...state.queue];
        newQueue[queueIndex] = { ...newQueue[queueIndex], status: "cancelled" };
        return { ...state, queue: newQueue };
      }

      // Check if active request
      if (state.activeRequest?.id === payload.requestId) {
        return {
          ...state,
          activeRequest: { ...state.activeRequest, status: "cancelled" },
        };
      }

      return state;
    },

    // Mark a request as completed
    requestCompleted: (state, payload: { requestId: string }) => {
      if (state.activeRequest?.id === payload.requestId) {
        return {
          ...state,
          activeRequest: { ...state.activeRequest, status: "completed" },
        };
      }
      return state;
    },
  },
});

export const {
  stateUpdated,
  segaToggled,
  uiGenerationRequested,
  requestQueued,
  requestsSynced,
  budgetUpdated,
  requestCancelled,
  requestCompleted,
} = runtimeSlice.actions;
