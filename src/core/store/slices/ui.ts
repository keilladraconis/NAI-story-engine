import { createSlice } from "../../../../lib/nai-store";
import { UIState } from "../types";

export const initialUIState: UIState = {
  showClearConfirm: false,
  editModes: {},
  inputs: {},
  brainstorm: {
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
  },
});

export const {
  uiClearConfirmToggled,
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
} = uiSlice.actions;
