import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { directorGuidanceSet, beatRejected, beatTainted } from "../../index";
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

    // Determine current beat index
    const state = ctx.getState();
    const { activeGoalId } = state.crucible;
    const chain = activeGoalId ? state.crucible.chains[activeGoalId] : null;
    const atBeatIndex = chain ? chain.beats.length : 0;

    api.v1.log(`[crucible-director] Guidance at beat ${atBeatIndex}:`);
    if (solver) api.v1.log(`  Solver: ${solver.slice(0, 200)}`);
    if (builder) api.v1.log(`  Builder: ${builder.slice(0, 200)}`);

    ctx.dispatch(directorGuidanceSet({
      solver: solver.trim(),
      builder: builder.trim(),
      atBeatIndex,
    }));

    // Parse corrective actions
    const shouldReject = text.includes("[REJECT]");
    const taintMatch = text.match(/\[TAINT Scene (\d+)\]/);

    if (shouldReject) {
      if (chain && chain.beats.length > 0) {
        api.v1.log(`[crucible-director] REJECT — rolling back last scene`);
        ctx.dispatch(beatRejected({ goalId: activeGoalId! }));
      }
    }

    if (taintMatch) {
      const targetSceneNum = parseInt(taintMatch[1], 10);
      const beatIndex = SCENE_OFFSET - targetSceneNum;
      if (chain && beatIndex >= 0 && beatIndex < chain.beats.length) {
        api.v1.log(`[crucible-director] TAINT Scene ${targetSceneNum} (beat index ${beatIndex})`);
        ctx.dispatch(beatTainted({ goalId: activeGoalId!, beatIndex }));
      }
    }
  },
};
