import { createSlice } from "../../../../lib/nai-store";
import { UIState } from "../types";

export const initialUIState: UIState = {
  showClearConfirm: false,
  editModes: {},
  inputs: {},
  brainstorm: {
    editingMessageId: null,
    input: "",
  },
};

export const uiSlice = createSlice({
  name: "ui",
  initialState: initialUIState,
  reducers: {
    uiClearConfirmToggled: (state) => ({
      ...state,
      showClearConfirm: !state.showClearConfirm,
    }),
    uiEditModeToggled: (state, payload: { id: string }) => ({
      ...state,
      editModes: {
        ...state.editModes,
        [payload.id]: !state.editModes[payload.id],
      },
    }),
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
    setBrainstormEditingMessageId: (state, id: string | null) => ({
      ...state,
      brainstorm: { ...state.brainstorm, editingMessageId: id },
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
  },
});

export const {
  uiClearConfirmToggled,
  uiEditModeToggled,
  uiInputChanged,
  setBrainstormInput,
  setBrainstormEditingMessageId,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  uiBrainstormSubmitUserMessage,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  uiBrainstormRetryGeneration,
  uiRequestGeneration,
  uiCancelRequest,
} = uiSlice.actions;
