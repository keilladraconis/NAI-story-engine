import { RootState, GenerationStrategy, AppDispatch } from "../types";
import { listHandler } from "./handlers/list";
import {
  lorebookContentHandler,
  lorebookKeysHandler,
} from "./handlers/lorebook";
import { forgeHandler } from "./handlers/forge";
import { foundationHandler } from "./handlers/foundation";
import {
  entitySummaryHandler,
  entitySummaryBindHandler,
  threadSummaryHandler,
} from "./handlers/summary";
import { bootstrapHandler, bootstrapContinueHandler } from "./handlers/bootstrap";
import { chatHandler, chatRefineHandler } from "./handlers/chat";

// Target type union from GenerationStrategy
export type TargetType = GenerationStrategy["target"]["type"];

// Extract specific target types for handler type safety
export type ListTarget = Extract<
  GenerationStrategy["target"],
  { type: "list" }
>;
export type LorebookContentTarget = Extract<
  GenerationStrategy["target"],
  { type: "lorebookContent" }
>;
export type LorebookKeysTarget = Extract<
  GenerationStrategy["target"],
  { type: "lorebookKeys" }
>;
export type ForgeTarget = Extract<
  GenerationStrategy["target"],
  { type: "forge" }
>;
export type FoundationTarget = Extract<
  GenerationStrategy["target"],
  { type: "foundation" }
>;
export type EntitySummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "entitySummary" }
>;
export type EntitySummaryBindTarget = Extract<
  GenerationStrategy["target"],
  { type: "entitySummaryBind" }
>;
export type ThreadSummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "threadSummary" }
>;
export type BootstrapTarget = Extract<
  GenerationStrategy["target"],
  { type: "bootstrap" }
>;
export type BootstrapContinueTarget = Extract<
  GenerationStrategy["target"],
  { type: "bootstrapContinue" }
>;
export type ChatTarget = Extract<
  GenerationStrategy["target"],
  { type: "chat" }
>;
export type ChatRefineTarget = Extract<
  GenerationStrategy["target"],
  { type: "chatRefine" }
>;

export interface StreamingContext<T = GenerationStrategy["target"]> {
  target: T;
  getState: () => RootState;
  dispatch: AppDispatch;
  accumulatedText: string;
}

export interface CompletionContext<
  T = GenerationStrategy["target"],
> extends StreamingContext<T> {
  generationSucceeded: boolean;
  originalContent?: string; // For lorebook rollback
  originalKeys?: string; // For lorebook rollback
}

export type StreamingHandler<T = GenerationStrategy["target"]> = (
  ctx: StreamingContext<T>,
  newText: string,
) => void;

export type CompletionHandler<T = GenerationStrategy["target"]> = (
  ctx: CompletionContext<T>,
) => Promise<void>;

export interface GenerationHandlers<T = GenerationStrategy["target"]> {
  streaming: StreamingHandler<T>;
  completion: CompletionHandler<T>;
}

// Handler registry mapping target types to their handlers
export const GENERATION_HANDLERS: {
  list: GenerationHandlers<ListTarget>;
  lorebookContent: GenerationHandlers<LorebookContentTarget>;
  lorebookKeys: GenerationHandlers<LorebookKeysTarget>;
  forge: GenerationHandlers<ForgeTarget>;
  foundation: GenerationHandlers<FoundationTarget>;
  entitySummary: GenerationHandlers<EntitySummaryTarget>;
  entitySummaryBind: GenerationHandlers<EntitySummaryBindTarget>;
  threadSummary: GenerationHandlers<ThreadSummaryTarget>;
  bootstrap: GenerationHandlers<BootstrapTarget>;
  bootstrapContinue: GenerationHandlers<BootstrapContinueTarget>;
  chat: GenerationHandlers<ChatTarget>;
  chatRefine: GenerationHandlers<ChatRefineTarget>;
} = {
  list: listHandler,
  lorebookContent: lorebookContentHandler,
  lorebookKeys: lorebookKeysHandler,
  forge: forgeHandler,
  foundation: foundationHandler,
  entitySummary: entitySummaryHandler,
  entitySummaryBind: entitySummaryBindHandler,
  threadSummary: threadSummaryHandler,
  bootstrap: bootstrapHandler,
  bootstrapContinue: bootstrapContinueHandler,
  chat: chatHandler,
  chatRefine: chatRefineHandler,
};

export function getHandler(
  targetType: TargetType,
): GenerationHandlers<GenerationStrategy["target"]> {
  return GENERATION_HANDLERS[targetType] as GenerationHandlers<
    GenerationStrategy["target"]
  >;
}
