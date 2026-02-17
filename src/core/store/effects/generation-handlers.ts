import { RootState, GenerationStrategy, AppDispatch } from "../types";
import { brainstormHandler } from "./handlers/brainstorm";
import { bootstrapHandler } from "./handlers/bootstrap";
import { fieldHandler } from "./handlers/field";
import { listHandler } from "./handlers/list";
import {
  lorebookContentHandler,
  lorebookKeysHandler,
  lorebookRefineHandler,
} from "./handlers/lorebook";
import {
  crucibleIntentHandler,
  crucibleGoalHandler,
  crucibleChainHandler,
} from "./handlers/crucible";
import { crucibleBuildHandler } from "./handlers/crucible-builder";
import { crucibleDirectorHandler } from "./handlers/crucible-director";

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
export type BootstrapTarget = Extract<
  GenerationStrategy["target"],
  { type: "bootstrap" }
>;
export type CrucibleIntentTarget = Extract<
  GenerationStrategy["target"],
  { type: "crucibleIntent" }
>;
export type CrucibleGoalTarget = Extract<
  GenerationStrategy["target"],
  { type: "crucibleGoal" }
>;
export type CrucibleChainTarget = Extract<
  GenerationStrategy["target"],
  { type: "crucibleChain" }
>;
export type CrucibleBuildTarget = Extract<
  GenerationStrategy["target"],
  { type: "crucibleBuild" }
>;
export type CrucibleDirectorTarget = Extract<
  GenerationStrategy["target"],
  { type: "crucibleDirector" }
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
  bootstrap: GenerationHandlers<BootstrapTarget>;
  field: GenerationHandlers<FieldTarget>;
  list: GenerationHandlers<ListTarget>;
  lorebookContent: GenerationHandlers<LorebookContentTarget>;
  lorebookKeys: GenerationHandlers<LorebookKeysTarget>;
  lorebookRefine: GenerationHandlers<LorebookRefineTarget>;
  crucibleIntent: GenerationHandlers<CrucibleIntentTarget>;
  crucibleGoal: GenerationHandlers<CrucibleGoalTarget>;
  crucibleChain: GenerationHandlers<CrucibleChainTarget>;
  crucibleBuild: GenerationHandlers<CrucibleBuildTarget>;
  crucibleDirector: GenerationHandlers<CrucibleDirectorTarget>;
} = {
  brainstorm: brainstormHandler,
  bootstrap: bootstrapHandler,
  field: fieldHandler,
  list: listHandler,
  lorebookContent: lorebookContentHandler,
  lorebookKeys: lorebookKeysHandler,
  lorebookRefine: lorebookRefineHandler,
  crucibleIntent: crucibleIntentHandler,
  crucibleGoal: crucibleGoalHandler,
  crucibleChain: crucibleChainHandler,
  crucibleBuild: crucibleBuildHandler,
  crucibleDirector: crucibleDirectorHandler,
};

export function getHandler(
  targetType: TargetType,
): GenerationHandlers<GenerationStrategy["target"]> {
  return GENERATION_HANDLERS[targetType] as GenerationHandlers<
    GenerationStrategy["target"]
  >;
}
