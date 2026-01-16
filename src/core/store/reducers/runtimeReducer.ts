import { RuntimeState, Action } from "../types";
import { ActionTypes } from "../actions";

export const initialRuntimeState: RuntimeState = {
  segaRunning: false,
  queue: [],
  activeRequest: null,
  status: "idle",
  budgetTimeRemaining: 0,
};

export function runtimeReducer(state: RuntimeState = initialRuntimeState, action: Action): RuntimeState {
  switch (action.type) {
    case ActionTypes.SEGA_TOGGLED:
      return {
        ...state,
        segaRunning: !state.segaRunning,
      };

    case ActionTypes.GENERATION_REQUESTED: {
      const request = action.payload;
      return {
        ...state,
        queue: [...state.queue, request],
        status: state.status === "idle" ? "queued" : state.status,
      };
    }

    case ActionTypes.GENERATION_STARTED: {
      const { requestId } = action.payload; // Payload should ideally identify which request started
      // Logic: move specific request from queue to active
      const requestIndex = state.queue.findIndex(r => r.id === requestId);
      if (requestIndex === -1 && !state.activeRequest) return state; 
      
      const request = requestIndex !== -1 ? state.queue[requestIndex] : state.activeRequest;
      
      return {
        ...state,
        queue: state.queue.filter(r => r.id !== requestId),
        activeRequest: request,
        status: "generating",
      };
    }

    case ActionTypes.GENERATION_COMPLETED:
      return {
        ...state,
        activeRequest: null,
        status: state.queue.length > 0 ? "queued" : "idle",
      };

    case ActionTypes.GENERATION_FAILED:
      return {
        ...state,
        activeRequest: null,
        status: "error", // Or return to idle/queued depending on retry logic
      };
      
    case ActionTypes.GENERATION_CANCELLED: {
       const { requestId } = action.payload;
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
    }

    case ActionTypes.BUDGET_UPDATED:
      return {
        ...state,
        budgetTimeRemaining: action.payload.timeRemaining,
      };

    default:
      return state;
  }
}
