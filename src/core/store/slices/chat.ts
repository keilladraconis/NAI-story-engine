import { createSlice } from "nai-store";
import type { ChatMessage, ChatState, Question } from "../types";

export const initialChatState: ChatState = { messages: [] };

export const chatSlice = createSlice({
  name: "chat",
  initialState: initialChatState,
  reducers: {
    messageAdded: (state, message: ChatMessage) => ({
      ...state,
      messages: [...state.messages, message],
    }),
    messageUpdated: (
      state,
      p: { id: string; content: string; questions?: Question[] },
    ) => ({
      ...state,
      messages: state.messages.map((m) =>
        m.id === p.id
          ? {
              ...m,
              content: p.content,
              ...(p.questions
                ? { questions: p.questions, picks: p.questions.map(() => []) }
                : {}),
            }
          : m,
      ),
    }),
    /** Pick or unpick an option; a single-choice question keeps one pick. */
    optionPicked: (
      state,
      p: { id: string; question: number; label: string },
    ) => ({
      ...state,
      messages: state.messages.map((m) => {
        const q = m.questions?.[p.question];
        if (m.id !== p.id || !q || !m.picks) return m;
        const had = m.picks[p.question] ?? [];
        const next = had.includes(p.label)
          ? had.filter((l) => l !== p.label)
          : q.multi
            ? [...had, p.label]
            : [p.label];
        return {
          ...m,
          picks: m.picks.map((x, i) => (i === p.question ? next : x)),
        };
      }),
    }),
    messageRemoved: (state, p: { id: string }) => ({
      ...state,
      messages: state.messages.filter((m) => m.id !== p.id),
    }),
    chatCleared: (state) => ({ ...state, messages: [] }),
  },
});

export const {
  messageAdded,
  messageUpdated,
  messageRemoved,
  optionPicked,
  chatCleared,
} = chatSlice.actions;
