import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  builderNodeAdded,
  builderBeatProcessed,
  builderDeactivated,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  splitSections,
  formatTagsWithEmoji,
} from "../../../utils/tag-parser";
import { DulfsFieldID, FieldID } from "../../../../config/field-definitions";
import { appendToTranscript, truncateToTail } from "./crucible";
import { computeShortIds } from "../../../utils/crucible-builder-strategy";

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
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.STREAM_TEXT, text: truncateToTail(liveChunk) }]);
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
      api.v1.log("[crucible-builder] Raw output:\n" + text.slice(0, 1500));
      const builder = state.crucible.builder;

      // Build reverse map: shortId → node
      const shortIds = computeShortIds(builder.nodes);
      const shortIdToNode = new Map<string, typeof builder.nodes[0]>();
      for (const node of builder.nodes) {
        const sid = shortIds.get(node.id);
        if (sid) shortIdToNode.set(sid.toUpperCase(), node);
      }

      // Check for [SOLVER] yield signal
      const hasSolverYield = text.includes("[SOLVER]");

      // Parse sections — each element/link is a section
      const sections = splitSections(text);

      for (const section of sections) {
        // Extract [ID:xx] if present
        const idMatch = section.match(/\[ID:(\w+)\]/);
        const shortId = idMatch ? idMatch[1].toUpperCase() : null;
        const idNode = shortId ? shortIdToNode.get(shortId) : null;

        // Extract [DESCRIPTION] content.
        // Fallback: if model put text directly after [ID:xx] without [DESCRIPTION],
        // extract that text as the description (e.g. "[ID:C1]: A 4'6 coyote").
        let description = parseTag(section, "DESCRIPTION") || "";
        if (!description && idMatch) {
          const afterId = section.slice((idMatch.index || 0) + idMatch[0].length);
          const fallback = afterId.replace(/^[\s:]+/, "").split("\n")[0].trim();
          if (fallback && !fallback.startsWith("[")) description = fallback;
        }
        // Strip any residual [ID:xx] artifacts from description
        description = description.replace(/\[ID:\w+\]\s*:?\s*/g, "").trim();

        // Check for element tags ([CHARACTER], [LOCATION], etc.)
        for (const tag of ELEMENT_TAGS) {
          const name = parseTag(section, tag);
          if (!name) continue;

          const fieldId = TAG_TO_FIELD[tag];
          const mode = idNode ? "update" : "new";
          api.v1.log(`[crucible-builder] ${mode} [${tag}] name="${name}" desc="${description.slice(0, 80)}" id=${shortId || "none"}`);

          // ID-based revision: model re-emitted tag with [ID:xx]
          if (idNode) {
            ctx.dispatch(builderNodeAdded({
              id: idNode.id,
              fieldId: idNode.fieldId,
              name,
              content: description || undefined,
            }));
            break;
          }

          // Name-based dedup: match existing node
          const existingNode = builder.nodes.find(
            (n) => n.name.toLowerCase() === name.toLowerCase(),
          );
          if (existingNode) {
            ctx.dispatch(builderNodeAdded({
              id: existingNode.id,
              fieldId: existingNode.fieldId,
              name: existingNode.name,
              content: description || undefined,
            }));
            break;
          }

          // Create new builder node
          const nodeId = api.v1.uuid();
          ctx.dispatch(builderNodeAdded({
            id: nodeId,
            fieldId,
            name,
            content: description,
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
        ctx.dispatch(builderDeactivated());
      }
    } catch (e) {
      api.v1.log("[crucible-builder] Parse failed:", e);
      api.v1.log("[crucible-builder] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};
