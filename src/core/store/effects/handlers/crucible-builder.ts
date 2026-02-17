import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  builderElementAdded,
  builderSceneProcessed,
  directorGuidanceConsumed,
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

      // Build reverse map: shortId → element
      const shortIds = computeShortIds(builder.elements);
      const shortIdToElement = new Map<string, typeof builder.elements[0]>();
      for (const el of builder.elements) {
        const sid = shortIds.get(el.id);
        if (sid) shortIdToElement.set(sid.toUpperCase(), el);
      }

      // Parse sections — each element is a section
      const sections = splitSections(text);

      for (const section of sections) {
        // Extract [ID:xx] if present
        const idMatch = section.match(/\[ID:(\w+)\]/);
        const shortId = idMatch ? idMatch[1].toUpperCase() : null;
        const idElement = shortId ? shortIdToElement.get(shortId) : null;

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
          const mode = idElement ? "update" : "new";
          api.v1.log(`[crucible-builder] ${mode} [${tag}] name="${name}" desc="${description.slice(0, 80)}" id=${shortId || "none"}`);

          // ID-based revision: model re-emitted tag with [ID:xx]
          if (idElement) {
            ctx.dispatch(builderElementAdded({
              id: idElement.id,
              fieldId: idElement.fieldId,
              name,
              content: description || undefined,
            }));
            break;
          }

          // Name-based dedup: match existing element
          const existingElement = builder.elements.find(
            (el) => el.name.toLowerCase() === name.toLowerCase(),
          );
          if (existingElement) {
            ctx.dispatch(builderElementAdded({
              id: existingElement.id,
              fieldId: existingElement.fieldId,
              name: existingElement.name,
              content: description || undefined,
            }));
            break;
          }

          // Create new world element
          const elementId = api.v1.uuid();
          ctx.dispatch(builderElementAdded({
            id: elementId,
            fieldId,
            name,
            content: description,
          }));
          break; // Only one element tag per section
        }
      }

      // Mark scenes as processed up to current chain length
      const lastSceneIndex = chain.scenes.length - 1;
      if (lastSceneIndex >= 0) {
        ctx.dispatch(builderSceneProcessed({ sceneIndex: lastSceneIndex }));
      }

      ctx.dispatch(directorGuidanceConsumed({ by: "builder" }));
    } catch (e) {
      api.v1.log("[crucible-builder] Parse failed:", e);
      api.v1.log("[crucible-builder] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};
