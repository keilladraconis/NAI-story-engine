import { GenerationStrategy, ContractData } from "../../types";
import { stripThinkingTags } from "../../../utils/tag-parser";
import {
  situationUpdated,
  worldStateUpdated,
  contractUpdated,
  attgUpdated,
  styleUpdated,
} from "../../slices/foundation";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { writeStream, clearStream } from "../../stream-buffer";

type FoundationTarget = Extract<
  GenerationStrategy["target"],
  { type: "foundation" }
>;

/**
 * Parses contract generation output into { required, prohibited, emphasis }.
 * Format: "REQUIRED: ...\nPROHIBITED: ...\nEMPHASIS: ..."
 */
export function parseContract(text: string): ContractData {
  const requiredMatch = text.match(/^REQUIRED:\s*(.+)$/m);
  const prohibitedMatch = text.match(/^PROHIBITED:\s*(.+)$/m);
  const emphasisMatch = text.match(/^EMPHASIS:\s*(.+)$/m);
  return {
    required: requiredMatch?.[1]?.trim() || "",
    prohibited: prohibitedMatch?.[1]?.trim() || "",
    emphasis: emphasisMatch?.[1]?.trim() || "",
  };
}

export const foundationHandler: GenerationHandlers<FoundationTarget> = {
  streaming(ctx: StreamingContext<FoundationTarget>, _newText: string): void {
    // The JSX field card reads the live text from the effect-free stream buffer.
    // Per-token, no store dispatch (that would wedge the Preact repaint).
    writeStream(`foundation:${ctx.target.field}`, ctx.accumulatedText);
  },

  async completion(ctx: CompletionContext<FoundationTarget>): Promise<void> {
    const field = ctx.target.field;
    try {
      if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

      const text = stripThinkingTags(ctx.accumulatedText).trim();

      switch (field) {
        case "situation": {
          ctx.dispatch(situationUpdated({ situation: text }));
          break;
        }
        case "worldState": {
          ctx.dispatch(worldStateUpdated({ worldState: text }));
          break;
        }
        case "contract": {
          const contract = parseContract(text);
          ctx.dispatch(contractUpdated({ contract }));
          break;
        }
        case "attg": {
          ctx.dispatch(attgUpdated({ attg: text }));
          if (ctx.getState().foundation.attgSyncEnabled) {
            await api.v1.memory.set(text.trim());
          }
          break;
        }
        case "style": {
          ctx.dispatch(styleUpdated({ style: text }));
          if (ctx.getState().foundation.styleSyncEnabled) {
            await api.v1.an.set(text.trim());
          }
          break;
        }
      }
    } finally {
      clearStream(`foundation:${field}`);
    }
  },
};
