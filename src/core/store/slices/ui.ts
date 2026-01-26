import { createSlice } from "../../../../lib/nai-store";
import { UIState } from "../types";

export const initialUIState: UIState = {
  brainstorm: {
    editingMessageId: null,
    input: "",
  },
};

export const uiSlice = createSlice({
  name: "ui",
  initialState: initialUIState,
  reducers: {
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
    uiBrainstormRetryGeneration: (state, _payload: { messageId: string }) => state,
    uiRequestGeneration: (state, _strategy: any) => state,
    uiCancelRequest: (state, _payload: { requestId: string }) => state,
  },
});

export const {
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
