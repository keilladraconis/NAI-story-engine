import { createSlice } from "../../../../lib/nai-store";
import { BrainstormState, BrainstormMessage } from "../types";

export const initialBrainstormState: BrainstormState = {
  messages: [],
  editingMessageId: null,
};

export const brainstormSlice = createSlice({
  name: "brainstorm",
  initialState: initialBrainstormState,
  reducers: {
    messageAdded: (state, message: BrainstormMessage) => {
      return {
        ...state,
        messages: [...state.messages, message],
      };
    },
    messageUpdated: (state, payload: { id: string; content: string }) => {
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === payload.id ? { ...msg, content: payload.content } : msg,
        ),
      };
    },
    messageAppended: (state, payload: { id: string; content: string }) => {
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === payload.id
            ? { ...msg, content: msg.content + payload.content }
            : msg,
        ),
      };
    },
    messageRemoved: (state, id: string) => {
      return {
        ...state,
        messages: state.messages.filter((msg) => msg.id !== id),
      };
    },
    pruneHistory: (state, id: string) => {
      const index = state.messages.findIndex((msg) => msg.id === id);
      if (index === -1) return state;

      const targetMessage = state.messages[index];
      let newMessages;

      if (targetMessage.role === "user") {
        // Keep up to and including the user message
        newMessages = state.messages.slice(0, index + 1);
      } else {
        // Assistant message: Remove it and everything after, keeping up to the previous message
        newMessages = state.messages.slice(0, index);
      }

      return {
        ...state,
        messages: newMessages,
      };
    },
    messagesCleared: (state) => {
      return {
        ...state,
        messages: [],
      };
    },
    brainstormLoaded: (state, payload: { messages: BrainstormMessage[] }) => {
      return {
        ...state,
        messages: payload.messages,
      };
    },
    editingMessageIdSet: (state, id: string | null) => {
      return {
        ...state,
        editingMessageId: id,
      };
    },
  },
});

export const {
  messageAdded,
  messageUpdated,
  messageAppended,
  messageRemoved,
  pruneHistory,
  messagesCleared,
  brainstormLoaded,
  editingMessageIdSet,
} = brainstormSlice.actions;
