import type { Chat, ChatMessage, ChatSeed } from "../../chat-types/types";

interface V11BrainstormChat {
  id: string;
  title: string;
  mode: string;
  messages: Array<{ id: string; role: "user" | "assistant" | "system"; content: string }>;
}

interface V11Brainstorm {
  chats: V11BrainstormChat[];
  currentChatIndex: number;
}

interface ChatSliceShape {
  chats: Chat[];
  activeChatId: string | null;
  refineChat: Chat | null;
}

interface PersistedShape {
  brainstorm?: V11Brainstorm;
  chat?: ChatSliceShape;
  [key: string]: unknown;
}

export interface MigrationResult {
  touched: boolean;
  data: PersistedShape;
}

export function migrateBrainstormToChat(input: PersistedShape): MigrationResult {
  // Already migrated — idempotent no-op
  if (input.chat) return { touched: false, data: input };
  // Nothing to migrate
  if (!input.brainstorm?.chats) return { touched: false, data: input };

  const seed: ChatSeed = { kind: "blank" };

  const chats: Chat[] = input.brainstorm.chats.map((c) => ({
    id: c.id,
    type: "brainstorm",
    title: c.title,
    subMode: c.mode,
    messages: c.messages as ChatMessage[],
    seed,
  }));

  const idx = input.brainstorm.currentChatIndex;
  const active = chats[idx] ?? chats[0];

  const next: PersistedShape = { ...input };
  delete next.brainstorm;
  next.chat = {
    chats,
    activeChatId: active?.id ?? null,
    refineChat: null,
  };

  return { touched: true, data: next };
}
