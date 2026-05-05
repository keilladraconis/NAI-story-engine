import { createSlice } from "nai-store";
import type { Chat, ChatMessage } from "../../chat-types/types";

export interface ChatSliceState {
  chats: Chat[];
  activeChatId: string | null;
  refineChat: Chat | null;
}

function makeDefaultBrainstorm(): Chat {
  return {
    id: api.v1.uuid(),
    type: "brainstorm",
    title: "Brainstorm 1",
    subMode: "cowriter",
    messages: [],
    seed: { kind: "blank" },
  };
}

const seedChat = makeDefaultBrainstorm();
export const initialChatState: ChatSliceState = {
  chats: [seedChat],
  activeChatId: seedChat.id,
  refineChat: null,
};

function mapChat(state: ChatSliceState, id: string, fn: (c: Chat) => Chat): ChatSliceState {
  return { ...state, chats: state.chats.map((c) => (c.id === id ? fn(c) : c)) };
}

export const chatSlice = createSlice({
  name: "chat",
  initialState: initialChatState,
  reducers: {
    chatCreated: (state, payload: { chat: Chat }) => ({
      ...state,
      chats: [...state.chats, payload.chat],
      activeChatId: payload.chat.id,
    }),

    chatRenamed: (state, payload: { id: string; title: string }) =>
      mapChat(state, payload.id, (c) => ({ ...c, title: payload.title })),

    chatSwitched: (state, payload: { id: string }) => {
      if (!state.chats.some((c) => c.id === payload.id)) return state;
      return { ...state, activeChatId: payload.id };
    },

    chatDeleted: (state, payload: { id: string }) => {
      if (state.chats.length <= 1) return state;
      const chats = state.chats.filter((c) => c.id !== payload.id);
      const activeChatId =
        state.activeChatId === payload.id ? chats[chats.length - 1].id : state.activeChatId;
      return { ...state, chats, activeChatId };
    },

    subModeChanged: (state, payload: { id: string; subMode: string }) =>
      mapChat(state, payload.id, (c) => ({ ...c, subMode: payload.subMode })),

    messageAdded: (state, payload: { chatId: string; message: ChatMessage }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: [...c.messages, payload.message],
      })),

    messageUpdated: (state, payload: { chatId: string; id: string; content: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id ? { ...m, content: payload.content } : m,
        ),
      })),

    messageAppended: (state, payload: { chatId: string; id: string; content: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id ? { ...m, content: m.content + payload.content } : m,
        ),
      })),

    messageRemoved: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== payload.id),
      })),

    messagesPrunedAfter: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => {
        const idx = c.messages.findIndex((m) => m.id === payload.id);
        if (idx === -1) return c;
        const target = c.messages[idx];
        const cut = target.role === "user" ? idx + 1 : idx;
        return { ...c, messages: c.messages.slice(0, cut) };
      }),

    refineChatOpened: (state, payload: { chat: Chat }) => {
      if (state.refineChat) return state; // single-slot collision: ignore
      return { ...state, refineChat: payload.chat };
    },

    refineChatCleared: (state) => ({ ...state, refineChat: null }),

    refineMessageAdded: (state, payload: { message: ChatMessage }) => {
      if (!state.refineChat) return state;
      return {
        ...state,
        refineChat: {
          ...state.refineChat,
          messages: [...state.refineChat.messages, payload.message],
        },
      };
    },

    refineMessageAppended: (state, payload: { id: string; content: string }) => {
      if (!state.refineChat) return state;
      return {
        ...state,
        refineChat: {
          ...state.refineChat,
          messages: state.refineChat.messages.map((m) =>
            m.id === payload.id ? { ...m, content: m.content + payload.content } : m,
          ),
        },
      };
    },

    refineCandidateMarked: (state, payload: { messageId: string }) => {
      if (!state.refineChat) return state;
      return {
        ...state,
        refineChat: {
          ...state.refineChat,
          messages: state.refineChat.messages.map((m) =>
            m.id === payload.messageId ? { ...m, refineCandidate: true } : m,
          ),
        },
      };
    },
  },
});

export const chatSliceReducer = chatSlice.reducer;
export const {
  chatCreated,
  chatRenamed,
  chatSwitched,
  chatDeleted,
  subModeChanged,
  messageAdded,
  messageUpdated,
  messageAppended,
  messageRemoved,
  messagesPrunedAfter,
  refineChatOpened,
  refineChatCleared,
  refineMessageAdded,
  refineMessageAppended,
  refineCandidateMarked,
} = chatSlice.actions;

export function activeSavedChat(state: ChatSliceState): Chat | null {
  if (!state.activeChatId) return null;
  return state.chats.find((c) => c.id === state.activeChatId) ?? null;
}
