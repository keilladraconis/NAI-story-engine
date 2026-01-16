import { createStore } from "./store";
import { rootReducer, initialRootState } from "./reducers/rootReducer";
import { persistenceMiddleware } from "./middleware/persistence";
import { generationMiddleware } from "./middleware/generation";
import { segaMiddleware } from "./middleware/sega";
import { RootState } from "./types";

// Create the store instance
export const store = createStore<RootState>(
  rootReducer,
  initialRootState,
  [persistenceMiddleware, generationMiddleware, segaMiddleware]
);

// Helper to access dispatch easily
export const dispatch = store.dispatch;

// Helper to get state
export const getState = store.getState;

// Re-export everything
export * from "./types";
export * from "./actions";
export * from "./store";
