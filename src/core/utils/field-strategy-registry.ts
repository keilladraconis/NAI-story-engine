import type { RootState, GenerationStrategy } from "../store/types";
import type { RefineContext } from "../chat-types/types";
import { buildATTGStrategy, buildStyleStrategy } from "./context-builder";
import { buildLorebookContentStrategy, buildLorebookKeysStrategy } from "./lorebook-strategy";

export type FieldStrategyOpts = {
  refineContext?: RefineContext;
  entryId?: string;
  requestId?: string;
};

export type FieldStrategyFactory = (
  getState: () => RootState,
  opts?: FieldStrategyOpts,
) => GenerationStrategy;

export const FIELD_STRATEGIES: Record<string, FieldStrategyFactory> = {
  attg: (gs, opts) => buildATTGStrategy(gs, opts),
  style: (gs, opts) => buildStyleStrategy(gs, opts),
  lorebookContent: (gs, opts) => buildLorebookContentStrategy(gs, opts),
  lorebookKeys: (gs, opts) => buildLorebookKeysStrategy(gs, opts),
};

export function getFieldStrategy(id: string): FieldStrategyFactory {
  const f = FIELD_STRATEGIES[id];
  if (!f) throw new Error(`no field strategy registered for id: ${id}`);
  return f;
}
