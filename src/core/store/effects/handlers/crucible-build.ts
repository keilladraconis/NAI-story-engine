/**
 * Crucible Build Handler — Parses and executes structured commands from GLM's build pass output.
 */

import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { buildPassCompleted } from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import { parseCommands, executeCommands } from "../../../utils/crucible-command-parser";

/** Strip thinking-tag breakout artifacts from generated text. */
function stripThinkingTags(text: string): string {
  return text.replace(/<\/?think>/g, "").replace(/<think>[\s\S]*$/g, "");
}

type BuildPassTarget = { type: "crucibleBuildPass"; passNumber: number };

export const crucibleBuildPassHandler: GenerationHandlers<BuildPassTarget> = {
  streaming(ctx: StreamingContext<BuildPassTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);

    // Show command keywords as ticker during generation
    const commandMatches = text.match(/\[(CREATE|REVISE|LINK|DELETE|CRITIQUE|DONE)\b[^\]]*\]/g);
    const lastCommand = commandMatches ? commandMatches[commandMatches.length - 1] : "";
    const tail = lastCommand || text.replace(/\n+/g, " ").slice(-80);

    api.v1.ui.updateParts([
      { id: IDS.CRUCIBLE.TICKER_TEXT, text: tail },
    ]);
  },

  async completion(ctx: CompletionContext<BuildPassTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    const commands = parseCommands(text);

    if (commands.length === 0) {
      api.v1.log("[crucible] Build pass: no valid commands found");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
      ctx.dispatch(buildPassCompleted({
        passNumber: ctx.target.passNumber,
        commandLog: ["⚠ No valid commands parsed from GLM output"],
        guidance: "",
      }));
      return;
    }

    const { commandLog, critique } = executeCommands(commands, ctx.getState, ctx.dispatch);

    api.v1.log(`[crucible] Build pass ${ctx.target.passNumber}: ${commandLog.length} commands executed`);
    if (critique) {
      api.v1.log(`[crucible] Critique: ${critique.slice(0, 200)}`);
    }

    ctx.dispatch(buildPassCompleted({
      passNumber: ctx.target.passNumber,
      commandLog,
      guidance: "",
    }));
  },
};
