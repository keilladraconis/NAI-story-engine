import { createSlice } from "nai-store";
import type { ChatMessage, ChatState } from "../types";

export const initialChatState: ChatState = { messages: [] };

export const chatSlice = createSlice({
  name: "chat",
  initialState: initialChatState,
  reducers: {
    messageAdded: (state, message: ChatMessage) => ({
      ...state,
      messages: [...state.messages, message],
    }),
    messageUpdated: (state, p: { id: string; content: string }) => ({
      ...state,
      messages: state.messages.map((m) =>
        m.id === p.id ? { ...m, content: p.content } : m,
      ),
    }),
    messageRemoved: (state, p: { id: string }) => ({
      ...state,
      messages: state.messages.filter((m) => m.id !== p.id),
    }),
    chatCleared: (state) => ({ ...state, messages: [] }),
  },
});

export const { messageAdded, messageUpdated, messageRemoved, chatCleared } =
  chatSlice.actions;
