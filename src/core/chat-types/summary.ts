import type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  SpecCtx,
} from "./types";
import { STORY_TEXT_SUMMARIZE_PROMPT, XIALONG_STYLE } from "../utils/prompts";

export const summarySpec: ChatTypeSpec = {
  id: "summary",
  displayName: "Summary",
  lifecycle: "save",

  initialize(seed: ChatSeed, _ctx: SpecCtx) {
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

  systemPromptFor(_chat: Chat, _ctx: SpecCtx): string {
    return STORY_TEXT_SUMMARIZE_PROMPT;
  },

  xialongStyleFor(_chat: Chat, _ctx: SpecCtx): string {
    return XIALONG_STYLE.summary;
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
