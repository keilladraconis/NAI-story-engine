import { createStore, combineReducers } from "nai-store";
import { chatSlice } from "../../../../src/core/store/slices/chat";
import { uiSlice } from "../../../../src/core/store/slices/ui";
import { runtimeSlice } from "../../../../src/core/store/slices/runtime";

export const rootReducerForTest = combineReducers({
  chat: chatSlice.reducer,
  ui: uiSlice.reducer,
  runtime: runtimeSlice.reducer,
});

export function makeTestStore() {
  return createStore(rootReducerForTest as any, false);
}
