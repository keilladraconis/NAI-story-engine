import { createSlice } from "nai-store";
import {
  RuntimeState,
  GenerationRequest,
  SegaStage,
  SegaState,
} from "../types";
import { GenerationState } from "nai-gen-x";

const initialSegaState: SegaState = {
  stage: "idle",
  statusText: "",
  activeRequestIds: [],
};

export const initialRuntimeState: RuntimeState = {
  segaRunning: false,
  sega: initialSegaState,
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

    requestActivated: (state, payload: { requestId: string }) => {
      const idx = state.queue.findIndex((r) => r.id === payload.requestId);
      if (idx === -1) return state;
      const activated = state.queue[idx];
      return {
        ...state,
        queue: state.queue.filter((r) => r.id !== payload.requestId),
        activeRequest: { ...activated, status: "processing" as const },
        status: "generating" as const,
      };
    },

    queueCleared: (state) => ({
      ...state,
      queue: [],
      activeRequest: null,
      status: "idle" as const,
    }),

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

    // Mark a request as completed and clear from active/queue
    requestCompleted: (state, payload: { requestId: string }) => {
      const isActive = state.activeRequest?.id === payload.requestId;
      const newQueue = state.queue.filter(
        (r) => r.id !== payload.requestId,
      );

      if (!isActive && newQueue.length === state.queue.length) {
        return state;
      }

      return {
        ...state,
        activeRequest: isActive ? null : state.activeRequest,
        queue: newQueue,
      };
    },

    // SEGA Reducers
    segaStageSet: (state, payload: { stage: SegaStage }) => ({
      ...state,
      sega: { ...state.sega, stage: payload.stage },
    }),

    segaRequestTracked: (state, payload: { requestId: string }) => ({
      ...state,
      sega: {
        ...state.sega,
        activeRequestIds: [...state.sega.activeRequestIds, payload.requestId],
      },
    }),

    segaRequestUntracked: (state, payload: { requestId: string }) => ({
      ...state,
      sega: {
        ...state.sega,
        activeRequestIds: state.sega.activeRequestIds.filter(
          (id) => id !== payload.requestId,
        ),
      },
    }),

    segaReset: (state) => ({
      ...state,
      sega: initialSegaState,
    }),

    segaStatusUpdated: (state, payload: { statusText: string }) => ({
      ...state,
      sega: { ...state.sega, statusText: payload.statusText },
    }),
  },
});

export const {
  stateUpdated,
  segaToggled,
  uiGenerationRequested,
  requestQueued,
  requestActivated,
  queueCleared,
  budgetUpdated,
  requestCancelled,
  requestCompleted,
  segaStageSet,
  segaRequestTracked,
  segaRequestUntracked,
  segaReset,
  segaStatusUpdated,
} = runtimeSlice.actions;
