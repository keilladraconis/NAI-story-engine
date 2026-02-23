import { createSlice } from "nai-store";
import { BrainstormState, BrainstormMessage, BrainstormChat, BrainstormMode } from "../types";

function makeChat(index: number): BrainstormChat {
  return {
    id: api.v1.uuid(),
    title: `Brainstorm ${index}`,
    messages: [],
    mode: "cowriter",
  };
}

export const initialBrainstormState: BrainstormState = {
  chats: [makeChat(1)],
  currentChatIndex: 0,
  editingMessageId: null,
};

/** Accessor: current chat (never undefined — slice guarantees ≥1 chat). */
export function currentChat(state: BrainstormState): BrainstormChat {
  return state.chats[state.currentChatIndex];
}

/** Accessor: messages of the current chat. */
export function currentMessages(state: BrainstormState): BrainstormMessage[] {
  return currentChat(state).messages;
}

/** Immutable update helper for the current chat. */
function updateCurrentChat(
  state: BrainstormState,
  updater: (chat: BrainstormChat) => BrainstormChat,
): BrainstormState {
  const chats = state.chats.map((chat, i) =>
    i === state.currentChatIndex ? updater(chat) : chat,
  );
  return { ...state, chats };
}

export const brainstormSlice = createSlice({
  name: "brainstorm",
  initialState: initialBrainstormState,
  reducers: {
    messageAdded: (state, message: BrainstormMessage) => {
      return updateCurrentChat(state, (chat) => ({
        ...chat,
        messages: [...chat.messages, message],
      }));
    },
    messageUpdated: (state, payload: { id: string; content: string }) => {
      return updateCurrentChat(state, (chat) => ({
        ...chat,
        messages: chat.messages.map((msg) =>
          msg.id === payload.id ? { ...msg, content: payload.content } : msg,
        ),
      }));
    },
    messageAppended: (state, payload: { id: string; content: string }) => {
      return updateCurrentChat(state, (chat) => ({
        ...chat,
        messages: chat.messages.map((msg) =>
          msg.id === payload.id
            ? { ...msg, content: msg.content + payload.content }
            : msg,
        ),
      }));
    },
    messageRemoved: (state, id: string) => {
      return updateCurrentChat(state, (chat) => ({
        ...chat,
        messages: chat.messages.filter((msg) => msg.id !== id),
      }));
    },
    pruneHistory: (state, id: string) => {
      return updateCurrentChat(state, (chat) => {
        const index = chat.messages.findIndex((msg) => msg.id === id);
        if (index === -1) return chat;

        const targetMessage = chat.messages[index];
        let newMessages;

        if (targetMessage.role === "user") {
          newMessages = chat.messages.slice(0, index + 1);
        } else {
          newMessages = chat.messages.slice(0, index);
        }

        return { ...chat, messages: newMessages };
      });
    },
    messagesCleared: (state) => {
      return updateCurrentChat(state, (chat) => ({
        ...chat,
        messages: [],
      }));
    },
    modeChanged: (state, mode: BrainstormMode) => {
      return updateCurrentChat(state, (chat) => ({
        ...chat,
        mode,
      }));
    },
    editingMessageIdSet: (state, id: string | null) => {
      return {
        ...state,
        editingMessageId: id,
      };
    },
    chatCreated: (state) => {
      // Don't create a new chat if the current one is empty
      if (currentMessages(state).length === 0) return state;

      const newChat = makeChat(state.chats.length + 1);
      return {
        ...state,
        chats: [...state.chats, newChat],
        currentChatIndex: state.chats.length,
        editingMessageId: null,
      };
    },
    chatRenamed: (state, payload: { index: number; title: string }) => {
      if (payload.index < 0 || payload.index >= state.chats.length) return state;
      return {
        ...state,
        chats: state.chats.map((chat, i) =>
          i === payload.index ? { ...chat, title: payload.title } : chat,
        ),
      };
    },
    chatSwitched: (state, index: number) => {
      if (index < 0 || index >= state.chats.length) return state;
      return {
        ...state,
        currentChatIndex: index,
        editingMessageId: null,
      };
    },
    chatDeleted: (state, index: number) => {
      if (state.chats.length <= 1) return state;
      if (index < 0 || index >= state.chats.length) return state;

      const chats = state.chats.filter((_, i) => i !== index);
      let currentChatIndex = state.currentChatIndex;

      if (index < currentChatIndex) {
        currentChatIndex--;
      } else if (index === currentChatIndex) {
        currentChatIndex = Math.min(currentChatIndex, chats.length - 1);
      }

      return {
        ...state,
        chats,
        currentChatIndex,
        editingMessageId: null,
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
  modeChanged,
  editingMessageIdSet,
  chatCreated,
  chatRenamed,
  chatSwitched,
  chatDeleted,
} = brainstormSlice.actions;
