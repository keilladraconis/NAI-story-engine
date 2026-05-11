import type { Chat, ChatMessage } from "../../chat-types/types";
import type { PersistedData } from "../index";

// Legacy v0.11 brainstorm.mode was a free string, not yet narrowed to
// BrainstormMode — keep the input permissive so old persisted data still
// type-checks through the migration.
type MigrationInput = Omit<PersistedData, "brainstorm"> & {
  brainstorm?: {
    chats: Array<{
      id: string;
      title: string;
      mode: string;
      messages: Array<{ id: string; role: "user" | "assistant" | "system"; content: string }>;
    }>;
    currentChatIndex: number;
  };
};

export interface MigrationResult {
  touched: boolean;
  data: PersistedData;
}

export function migrateBrainstormToChat(input: MigrationInput): MigrationResult {
  if (input.chat) return { touched: false, data: input as PersistedData };
  if (!input.brainstorm?.chats) return { touched: false, data: input as PersistedData };

  const chats: Chat[] = input.brainstorm.chats.map((c) => ({
    id: c.id,
    type: "brainstorm",
    title: c.title,
    subMode: c.mode,
    messages: c.messages as ChatMessage[],
    seed: { kind: "blank" },
  }));

  const idx = input.brainstorm.currentChatIndex;
  const active = chats[idx] ?? chats[0];

  const next: MigrationInput = { ...input };
  delete next.brainstorm;
  return {
    touched: true,
    data: {
      ...(next as PersistedData),
      chat: {
        chats,
        activeChatId: active?.id ?? null,
        refineChat: null,
      },
    },
  };
}
