import { createSlice } from "nai-store";
import { UIState, LorebookUIState } from "../types";

const initialLorebookState: LorebookUIState = {
  selectedEntryId: null,
  selectedCategoryId: null,
};

export const initialUIState: UIState = {
  activeEditId: null,
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
    uiBrainstormSummarize: (state) => state,
    // Internal: Submit generation to GenX (not a user intent)
    generationSubmitted: (state, _strategy: any) => state,
    uiCancelRequest: (state, _payload: { requestId: string }) => state,
    // Editable singleton — at most one editor active at a time
    uiEditableActivate: (state, payload: { id: string }) => ({
      ...state,
      activeEditId: payload.id,
    }),
    uiEditableDeactivate: (state) => ({
      ...state,
      activeEditId: null,
    }),
    // Lorebook user intents (handled by effects)
    uiLorebookEntrySelected: (
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
    uiLorebookContentGenerationRequested: (
      state,
      _payload: { requestId: string },
    ) => state,
    uiLorebookKeysGenerationRequested: (
      state,
      _payload: { requestId: string },
    ) => state,
    // Item-level lorebook generation (queues both content + keys)
    uiLorebookItemGenerationRequested: (
      state,
      _payload: {
        entryId: string;
        contentRequestId: string;
        keysRequestId: string;
      },
    ) => state,
    // Lorebook refinement (modify existing entry with instructions)
    uiLorebookRefineRequested: (state, _payload: { requestId: string }) =>
      state,
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
  uiBrainstormSummarize,
  generationSubmitted,
  uiCancelRequest,
  uiEditableActivate,
  uiEditableDeactivate,
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookItemGenerationRequested,
  uiLorebookRefineRequested,
} = uiSlice.actions;
