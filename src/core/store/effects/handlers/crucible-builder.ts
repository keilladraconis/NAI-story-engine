import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  builderNodeAdded,
  builderBeatProcessed,
  solverYielded,
  dulfsItemAdded,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  splitSections,
  formatTagsWithEmoji,
} from "../../../utils/tag-parser";
import { DulfsFieldID, FieldID } from "../../../../config/field-definitions";
import { getStreamTranscript, appendToTranscript } from "./crucible";

type CrucibleBuildTarget = { type: "crucibleBuild"; goalId: string };

/** Map builder tag names to DULFS field IDs. */
const TAG_TO_FIELD: Record<string, DulfsFieldID> = {
  CHARACTER: FieldID.DramatisPersonae,
  LOCATION: FieldID.Locations,
  FACTION: FieldID.Factions,
  SYSTEM: FieldID.UniverseSystems,
  SITUATION: FieldID.SituationalDynamics,
};

const ELEMENT_TAGS = new Set(Object.keys(TAG_TO_FIELD));

/** Strip thinking-tag breakout artifacts from generated text. */
function stripThinkingTags(text: string): string {
  return text.replace(/<\/?think>/g, "").replace(/<think>[\s\S]*$/g, "");
}

export const crucibleBuildHandler: GenerationHandlers<CrucibleBuildTarget> = {
  streaming(ctx: StreamingContext<CrucibleBuildTarget>): void {
    const liveChunk = formatTagsWithEmoji(stripThinkingTags(ctx.accumulatedText));
    const prefix = getStreamTranscript();
    const display = prefix ? prefix + "\n\n---\n\n" + liveChunk : liveChunk;
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.STREAM_TEXT, text: display }]);
  },

  async completion(ctx: CompletionContext<CrucibleBuildTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    // Append completed chunk to persistent transcript
    const cleanText = formatTagsWithEmoji(stripThinkingTags(ctx.accumulatedText).trim());
    if (cleanText) appendToTranscript(cleanText);

    const { goalId } = ctx.target;
    const state = ctx.getState();
    const chain = state.crucible.chains[goalId];
    if (!chain) return;

    try {
      const text = stripThinkingTags(ctx.accumulatedText).trim();
      const builder = state.crucible.builder;

      // Check for [SOLVER] yield signal
      const hasSolverYield = text.includes("[SOLVER]");

      // Parse sections — each element/link is a section
      const sections = splitSections(text);

      for (const section of sections) {
        // Check for [LINK] — reference to existing element
        const linkName = parseTag(section, "LINK");
        if (linkName) {
          const beatStr = parseTag(section, "BEAT");
          const beatIndex = beatStr ? parseInt(beatStr, 10) - 1 : chain.beats.length - 1;
          // Find existing node and update beat indices
          const existing = builder.nodes.find(
            (n) => n.name.toLowerCase() === linkName.toLowerCase(),
          );
          if (existing) {
            ctx.dispatch(builderNodeAdded({
              itemId: existing.itemId,
              fieldId: existing.fieldId,
              name: existing.name,
              beatIndex,
            }));
          }
          continue;
        }

        // Check for element tags ([CHARACTER], [LOCATION], etc.)
        for (const tag of ELEMENT_TAGS) {
          const name = parseTag(section, tag);
          if (!name) continue;

          const fieldId = TAG_TO_FIELD[tag];
          const description = parseTag(section, "DESCRIPTION") || "";

          // Dedup: skip if name already exists
          const existingNode = builder.nodes.find(
            (n) => n.name.toLowerCase() === name.toLowerCase(),
          );
          if (existingNode) {
            // Just link to existing
            ctx.dispatch(builderNodeAdded({
              itemId: existingNode.itemId,
              fieldId: existingNode.fieldId,
              name: existingNode.name,
              beatIndex: chain.beats.length - 1,
            }));
            break;
          }

          // Create new DULFS item
          const itemId = api.v1.uuid();
          const content = description ? `${name}: ${description}` : name;
          await api.v1.storyStorage.set(`dulfs-item-${itemId}`, content);
          ctx.dispatch(dulfsItemAdded({ fieldId, item: { id: itemId, fieldId } }));
          ctx.dispatch(builderNodeAdded({
            itemId,
            fieldId,
            name,
            beatIndex: chain.beats.length - 1,
          }));
          break; // Only one element tag per section
        }
      }

      // Mark beats as processed up to current chain length
      const lastBeatIndex = chain.beats.length - 1;
      if (lastBeatIndex >= 0) {
        ctx.dispatch(builderBeatProcessed({ beatIndex: lastBeatIndex }));
      }

      // If [SOLVER] detected, yield back to solver
      if (hasSolverYield) {
        ctx.dispatch(solverYielded());
      }
    } catch (e) {
      api.v1.log("[crucible-builder] Parse failed:", e);
      api.v1.log("[crucible-builder] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};
