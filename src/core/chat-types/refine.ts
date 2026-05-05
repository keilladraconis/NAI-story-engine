import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx } from "./types";
import { REFINE_SYSTEM_PROMPT } from "../utils/prompts";

export const refineSpec: ChatTypeSpec = {
  id: "refine",
  displayName: "Refine",
  lifecycle: "commit-discard",

  initialize(seed: ChatSeed, _ctx: SpecCtx) {
    const fieldId = seed.kind === "fromField" ? seed.sourceFieldId : "field";
    return { title: `Refining: ${fieldId}`, initialMessages: [] };
  },

  systemPromptFor(_chat: Chat, _ctx: SpecCtx): string {
    return REFINE_SYSTEM_PROMPT;
  },

  contextSlice(_chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return [];
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [{ id: "target", kind: "label" }];
  },
};
