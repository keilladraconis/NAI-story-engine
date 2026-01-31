import { createSlice } from "../../../../lib/nai-store";
import { UIState, LorebookUIState } from "../types";

const initialLorebookState: LorebookUIState = {
  selectedEntryId: null,
  selectedCategoryId: null,
};

export const initialUIState: UIState = {
  editModes: {},
  inputs: {},
  brainstorm: {
    input: "",
  },
  lorebook: initialLorebookState,
};

export const uiSlice = createSlice({
  name: "ui",
  initialState: initialUIState,
  reducers: {
    uiInputChanged: (state, payload: { id: string; value: string }) => ({
      ...state,
      inputs: {
        ...state.inputs,
        [payload.id]: payload.value,
      },
    }),
    setBrainstormInput: (state, input: string) => ({
      ...state,
      brainstorm: { ...state.brainstorm, input },
    }),
    // Intents (handled by Effects)
    uiRequestCancellation: (state) => state,
    uiUserPresenceConfirmed: (state) => state,
    uiBrainstormSubmitUserMessage: (state) => state,
    uiBrainstormMessageEditBegin: (state, _payload: { id: string }) => state,
    uiBrainstormMessageEditEnd: (state) => state,
    uiBrainstormRetryGeneration: (state, _payload: { messageId: string }) =>
      state,
    uiRequestGeneration: (state, _strategy: any) => state,
    uiCancelRequest: (state, _payload: { requestId: string }) => state,
    // Field editing (state change + side effects in component useEffect)
    uiFieldEditBegin: (state, payload: { id: string }) => ({
      ...state,
      editModes: {
        ...state.editModes,
        [payload.id]: true,
      },
    }),
    uiFieldEditEnd: (state, payload: { id: string }) => ({
      ...state,
      editModes: {
        ...state.editModes,
        [payload.id]: false,
      },
    }),
    // Lorebook actions
    lorebookEntrySelected: (
      state,
      payload: { entryId: string | null; categoryId: string | null },
    ) => ({
      ...state,
      lorebook: {
        ...state.lorebook,
        selectedEntryId: payload.entryId,
        selectedCategoryId: payload.categoryId,
      },
    }),
    // Lorebook generation intents (handled by effects)
    lorebookContentGenerationRequested: (
      state,
      _payload: { requestId: string },
    ) => state,
    lorebookKeysGenerationRequested: (state, _payload: { requestId: string }) =>
      state,
    // Item-level lorebook generation (queues both content + keys)
    lorebookItemGenerationRequested: (
      state,
      _payload: {
        entryId: string;
        contentRequestId: string;
        keysRequestId: string;
      },
    ) => state,
  },
});

export const {
  uiInputChanged,
  setBrainstormInput,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  uiBrainstormSubmitUserMessage,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  uiBrainstormRetryGeneration,
  uiRequestGeneration,
  uiCancelRequest,
  uiFieldEditBegin,
  uiFieldEditEnd,
  lorebookEntrySelected,
  lorebookContentGenerationRequested,
  lorebookKeysGenerationRequested,
  lorebookItemGenerationRequested,
} = uiSlice.actions;
