import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { directorGuidanceSet, sceneRejected, sceneTainted } from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  formatTagsWithEmoji,
} from "../../../utils/tag-parser";
import { appendToTranscript, truncateToTail } from "./crucible";
import { SCENE_OFFSET } from "../../../utils/crucible-strategy";

type CrucibleDirectorTarget = { type: "crucibleDirector" };

/** Strip thinking-tag breakout artifacts from generated text. */
function stripThinkingTags(text: string): string {
  return text.replace(/<\/?think>/g, "").replace(/<think>[\s\S]*$/g, "");
}

export const crucibleDirectorHandler: GenerationHandlers<CrucibleDirectorTarget> = {
  streaming(ctx: StreamingContext<CrucibleDirectorTarget>): void {
    const liveChunk = formatTagsWithEmoji(stripThinkingTags(ctx.accumulatedText));
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.STREAM_TEXT, text: truncateToTail(liveChunk) }]);
  },

  async completion(ctx: CompletionContext<CrucibleDirectorTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();

    // Append to stream transcript (user sees Director assessments too)
    const cleanText = formatTagsWithEmoji(text);
    if (cleanText) appendToTranscript("🎬 Director\n" + cleanText);

    // Parse guidance sections
    const solver = parseTag(text, "FOR SOLVER") || "";
    const builder = parseTag(text, "FOR BUILDER") || "";

    if (!solver && !builder) {
      api.v1.log("[crucible-director] No guidance sections found in output");
      api.v1.log("[crucible-director] Raw:", text.slice(0, 500));
      return;
    }

    // Determine current scene index
    const state = ctx.getState();
    const { activeGoalId } = state.crucible;
    const chain = activeGoalId ? state.crucible.chains[activeGoalId] : null;
    const atSceneIndex = chain ? chain.scenes.length : 0;

    api.v1.log(`[crucible-director] Guidance at scene ${atSceneIndex}:`);
    if (solver) api.v1.log(`  Solver: ${solver.slice(0, 200)}`);
    if (builder) api.v1.log(`  Builder: ${builder.slice(0, 200)}`);

    ctx.dispatch(directorGuidanceSet({
      solver: solver.trim(),
      builder: builder.trim(),
      atSceneIndex,
    }));

    // Parse corrective actions
    const shouldReject = text.includes("[REJECT]");
    const taintMatch = text.match(/\[TAINT Scene (\d+)\]/);

    if (shouldReject) {
      if (chain && chain.scenes.length > 0) {
        api.v1.log(`[crucible-director] REJECT — rolling back last scene`);
        ctx.dispatch(sceneRejected({ goalId: activeGoalId! }));
      }
    }

    if (taintMatch) {
      const targetSceneNum = parseInt(taintMatch[1], 10);
      const sceneIndex = SCENE_OFFSET - targetSceneNum;
      if (chain && sceneIndex >= 0 && sceneIndex < chain.scenes.length) {
        api.v1.log(`[crucible-director] TAINT Scene ${targetSceneNum} (scene index ${sceneIndex})`);
        ctx.dispatch(sceneTainted({ goalId: activeGoalId!, sceneIndex }));
      }
    }
  },
};
