import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx } from "./types";
import {
  BRAINSTORM_SUMMARIZE_PROMPT,
  STORY_TEXT_SUMMARIZE_PROMPT,
} from "../utils/prompts";

function findChatById(ctx: SpecCtx, id: string): Chat | undefined {
  return ctx.getState().chat.chats.find((c) => c.id === id);
}

function transcriptToText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
}

export const summarySpec: ChatTypeSpec = {
  id: "summary",
  displayName: "Summary",
  lifecycle: "save",

  initialize(seed: ChatSeed, ctx: SpecCtx) {
    if (seed.kind === "fromChat") {
      const source = findChatById(ctx, seed.sourceChatId);
      const transcript = source ? transcriptToText(source.messages) : "";
      return {
        title: source ? `Summary: ${source.title}` : "Summary",
        initialMessages: [
          {
            id: api.v1.uuid(),
            role: "system",
            content: `Source brainstorm transcript:\n${transcript}`,
          },
        ],
      };
    }
    if (seed.kind === "fromStoryText") {
      return {
        title: "Summary: Story Text",
        initialMessages: [
          {
            id: api.v1.uuid(),
            role: "system",
            content: `Story text:\n${seed.sourceText}`,
          },
        ],
      };
    }
    return { title: "Summary", initialMessages: [] };
  },

  systemPromptFor(chat: Chat, _ctx: SpecCtx): string {
    return chat.seed.kind === "fromStoryText"
      ? STORY_TEXT_SUMMARIZE_PROMPT
      : BRAINSTORM_SUMMARIZE_PROMPT;
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    const lastAssistant = [...chat.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    return lastAssistant ? [lastAssistant] : [];
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "new", kind: "newChatButton" },
      { id: "sessions", kind: "sessionsButton" },
    ];
  },
};
