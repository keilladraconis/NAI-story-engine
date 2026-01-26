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
    budgetState: "normal",
  },
};

export const runtimeSlice = createSlice({
  name: "runtime",
  initialState: initialRuntimeState,
  reducers: {
    stateUpdated: (state, payload: { genxState: GenerationState }) => ({
        ...state,
        genx: payload.genxState
    }),
    segaToggled: (state) => ({
        ...state,
        segaRunning: !state.segaRunning
    }),
    
    // Intent (handled by Effects)
    // intentRequestGeneration moved to uiSlice as uiRequestGeneration

    generationRequested: (state, request: GenerationRequest) => ({
        ...state,
        queue: [...state.queue, request],
        status: state.status === "idle" ? "queued" : state.status
    }),
    generationStarted: (state, payload: { requestId: string }) => {
        const { requestId } = payload;
        const requestIndex = state.queue.findIndex(r => r.id === requestId);
        
        let activeRequest = state.activeRequest;
        let queue = state.queue;

        if (requestIndex !== -1) {
            activeRequest = state.queue[requestIndex];
            queue = state.queue.filter(r => r.id !== requestId);
        }

        return {
            ...state,
            activeRequest,
            queue,
            status: "generating"
        };
    },
    generationCompleted: (state, _payload: { requestId: string }) => ({
        ...state,
        activeRequest: null,
        status: state.queue.length > 0 ? "queued" : "idle"
    }),
    generationFailed: (state, _payload: { requestId: string; error: string }) => ({
        ...state,
        activeRequest: null,
        status: "error"
    }),
    generationCancelled: (state, _payload: { requestId: string }) => {
        const { requestId } = _payload;
        if (state.activeRequest && state.activeRequest.id === requestId) {
            return {
                ...state,
                activeRequest: null,
                status: "idle"
            };
        }
        return {
            ...state,
            queue: state.queue.filter(r => r.id !== requestId)
        };
    },
    budgetUpdated: (state, payload: { timeRemaining: number }) => ({
        ...state,
        budgetTimeRemaining: payload.timeRemaining
    })
  },
});

export const {
    stateUpdated,
    segaToggled,
    generationRequested,
    generationStarted,
    generationCompleted,
    generationFailed,
    generationCancelled,
    budgetUpdated
} = runtimeSlice.actions;