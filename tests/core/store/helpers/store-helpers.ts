import { createStore, combineReducers } from "nai-store";
import { chatSlice, type ChatSliceState } from "../../../../src/core/store/slices/chat";
import { uiSlice } from "../../../../src/core/store/slices/ui";
import { runtimeSlice } from "../../../../src/core/store/slices/runtime";
import type { UIState, RuntimeState } from "../../../../src/core/store/types";

export interface TestRootState {
  chat: ChatSliceState;
  ui: UIState;
  runtime: RuntimeState;
}

export const rootReducerForTest = combineReducers({
  chat: chatSlice.reducer,
  ui: uiSlice.reducer,
  runtime: runtimeSlice.reducer,
});

export function makeTestStore() {
  return createStore<TestRootState>(rootReducerForTest, false);
}
