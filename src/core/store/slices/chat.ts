import { createSlice } from "nai-store";
import type { Chat, ChatMessage, ForgeSegment } from "../../chat-types/types";

export interface ChatSliceState {
  chats: Chat[];
  activeChatId: string | null;
}

/** Every chat type the registry holds (`chat-types/index.ts`; a test keeps the
 *  two in step). Named here, not imported, because the registry imports this
 *  slice. */
export const KNOWN_CHAT_TYPES: readonly string[] = [
  "scenario",
  "summary",
  "refine",
];

export function makeDefaultScenario(): Chat {
  return {
    id: api.v1.uuid(),
    type: "scenario",
    title: "Scenario 1",
    messages: [],
    seed: { kind: "blank" },
  };
}

/** A stored chat list with every chat of a type that no longer exists removed.
 *  A chat whose type has no spec cannot be rendered at all, so a story saved
 *  before the Scenario chat would otherwise open on an error. Nothing is
 *  converted: there is always at least one chat, and an active one. */
export function keepKnownChats(state: ChatSliceState): ChatSliceState {
  const kept = state.chats.filter((c) => KNOWN_CHAT_TYPES.includes(c.type));
  const chats = kept.length > 0 ? kept : [makeDefaultScenario()];
  const activeChatId = chats.some((c) => c.id === state.activeChatId)
    ? state.activeChatId
    : chats[chats.length - 1].id;
  return { chats, activeChatId };
}

const seedChat = makeDefaultScenario();
export const initialChatState: ChatSliceState = {
  chats: [seedChat],
  activeChatId: seedChat.id,
};

function mapChat(
  state: ChatSliceState,
  id: string,
  fn: (c: Chat) => Chat,
): ChatSliceState {
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
        state.activeChatId === payload.id
          ? chats[chats.length - 1].id
          : state.activeChatId;
      return { ...state, chats, activeChatId };
    },

    subModeChanged: (state, payload: { id: string; subMode: string }) =>
      mapChat(state, payload.id, (c) => ({ ...c, subMode: payload.subMode })),

    messageAdded: (state, payload: { chatId: string; message: ChatMessage }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: [...c.messages, payload.message],
      })),

    messageUpdated: (
      state,
      payload: { chatId: string; id: string; content: string },
    ) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        // An edit invalidates the settled segments: they describe the old text.
        messages: c.messages.map((m) => {
          if (m.id !== payload.id) return m;
          const { forgeSegments: _settled, ...rest } = m;
          return { ...rest, content: payload.content };
        }),
      })),

    messageAppended: (
      state,
      payload: { chatId: string; id: string; content: string },
    ) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id
            ? { ...m, content: m.content + payload.content }
            : m,
        ),
      })),

    messageRemoved: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== payload.id),
      })),

    forgeSegmentsSet: (
      state,
      payload: { chatId: string; id: string; segments: ForgeSegment[] },
    ) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id ? { ...m, forgeSegments: payload.segments } : m,
        ),
      })),

    messageUndone: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id ? { ...m, undone: true } : m,
        ),
      })),

    messagesPrunedAfter: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => {
        const idx = c.messages.findIndex((m) => m.id === payload.id);
        if (idx === -1) return c;
        const target = c.messages[idx];
        const cut = target.role === "user" ? idx + 1 : idx;
        return { ...c, messages: c.messages.slice(0, cut) };
      }),

    refineCandidateMarked: (
      state,
      payload: { chatId: string; messageId: string },
    ) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.messageId ? { ...m, refineCandidate: true } : m,
        ),
      })),
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
  forgeSegmentsSet,
  messageUndone,
  messagesPrunedAfter,
  refineCandidateMarked,
} = chatSlice.actions;

export function activeSavedChat(state: ChatSliceState): Chat | null {
  if (!state.activeChatId) return null;
  return state.chats.find((c) => c.id === state.activeChatId) ?? null;
}
