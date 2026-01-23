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
  },
});

export const {
  setBrainstormInput,
  setBrainstormEditingMessageId,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  uiBrainstormSubmitUserMessage,
} = uiSlice.actions;
