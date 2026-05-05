import type { ChatTypeSpec } from "./types";
import { brainstormSpec } from "./brainstorm";
import { summarySpec } from "./summary";
import { refineSpec } from "./refine";

export const CHAT_TYPE_REGISTRY: Record<string, ChatTypeSpec> = {
  brainstorm: brainstormSpec,
  summary: summarySpec,
  refine: refineSpec,
};

export function getChatTypeSpec(id: string): ChatTypeSpec {
  const spec = CHAT_TYPE_REGISTRY[id];
  if (!spec) throw new Error(`no chat-type spec registered for id: ${id}`);
  return spec;
}

export type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  RefineContext,
  RefineTarget,
  SpecCtx,
} from "./types";
