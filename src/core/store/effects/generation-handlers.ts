import { RootState, GenerationStrategy, AppDispatch } from "../types";
import { brainstormHandler } from "./handlers/brainstorm";
import { fieldHandler } from "./handlers/field";
import { listHandler } from "./handlers/list";
import {
  lorebookContentHandler,
  lorebookKeysHandler,
  lorebookRefineHandler,
} from "./handlers/lorebook";

// Target type union from GenerationStrategy
export type TargetType = GenerationStrategy["target"]["type"];

// Extract specific target types for handler type safety
export type BrainstormTarget = Extract<
  GenerationStrategy["target"],
  { type: "brainstorm" }
>;
export type FieldTarget = Extract<
  GenerationStrategy["target"],
  { type: "field" }
>;
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
export type LorebookRefineTarget = Extract<
  GenerationStrategy["target"],
  { type: "lorebookRefine" }
>;

export interface StreamingContext<T = GenerationStrategy["target"]> {
  target: T;
  getState: () => RootState;
  accumulatedText: string;
}

export interface CompletionContext<
  T = GenerationStrategy["target"],
> extends StreamingContext<T> {
  generationSucceeded: boolean;
  dispatch: AppDispatch;
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
  brainstorm: GenerationHandlers<BrainstormTarget>;
  field: GenerationHandlers<FieldTarget>;
  list: GenerationHandlers<ListTarget>;
  lorebookContent: GenerationHandlers<LorebookContentTarget>;
  lorebookKeys: GenerationHandlers<LorebookKeysTarget>;
  lorebookRefine: GenerationHandlers<LorebookRefineTarget>;
} = {
  brainstorm: brainstormHandler,
  field: fieldHandler,
  list: listHandler,
  lorebookContent: lorebookContentHandler,
  lorebookKeys: lorebookKeysHandler,
  lorebookRefine: lorebookRefineHandler,
};

export function getHandler(
  targetType: TargetType,
): GenerationHandlers<GenerationStrategy["target"]> {
  return GENERATION_HANDLERS[targetType] as GenerationHandlers<
    GenerationStrategy["target"]
  >;
}
