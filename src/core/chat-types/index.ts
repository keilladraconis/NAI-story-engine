import type { ChatTypeSpec } from "./types";
import { scenarioSpec } from "./scenario";
import { summarySpec } from "./summary";
import { refineSpec } from "./refine";

export const CHAT_TYPE_REGISTRY: Record<string, ChatTypeSpec> = {
  scenario: scenarioSpec,
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
