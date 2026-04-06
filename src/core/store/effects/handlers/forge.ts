/**
 * Forge Handler — Parses and executes structured commands from GLM's forge output,
 * dispatching results to the world slice (entityForged, relationshipAdded, etc.).
 * Drives the atomic forge loop by dispatching step/critique/done signals.
 */

import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { GenerationStrategy } from "../../types";
import { WorldEntity, Relationship } from "../../types";
import { DulfsFieldID } from "../../../../config/field-definitions";
import {
  entityForged,
  entitySummaryUpdated,
  entityDeleted,
  relationshipAdded,
  relationshipUpdated,
  forgeStepCompleted,
  forgeCritiqueReceived,
  forgeLoopEnded,
} from "../../slices/world";
import {
  parseCommands,
  CritiqueCommand,
} from "../../../utils/crucible-command-parser";
import { TYPE_TO_FIELD } from "../../../utils/crucible-command-parser";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { FORGE_MAX_STEPS } from "../../../utils/forge-strategy";
import { IDS } from "../../../../ui/framework/ids";

type ForgeTarget = Extract<GenerationStrategy["target"], { type: "forge" }>;

/**
 * Executes forge commands against the world slice.
 * CREATE → entityForged (draft)
 * REVISE → entitySummaryUpdated
 * DELETE → entityDeleted
 * LINK → relationshipAdded
 */
function executeForgeCommands(
  commands: ReturnType<typeof parseCommands>,
  batchId: string,
  getState: () => import("../../types").RootState,
  dispatch: import("../../types").AppDispatch,
): void {
  for (const cmd of commands) {
    switch (cmd.kind) {
      case "CREATE": {
        if (!cmd.content.trim()) {
          api.v1.log(`[forge] CREATE rejected: no content for "${cmd.name}"`);
          break;
        }
        const fieldId = TYPE_TO_FIELD[cmd.elementType] as
          | DulfsFieldID
          | undefined;
        if (!fieldId) {
          api.v1.log(
            `[forge] CREATE: unknown type "${cmd.elementType}" for "${cmd.name}"`,
          );
          break;
        }

        // Dedup: skip if name already exists in world entities (case-insensitive)
        const existing = getState().world.entities.find(
          (e) => e.name.toLowerCase() === cmd.name.toLowerCase(),
        );
        if (existing) {
          api.v1.log(`[forge] CREATE rejected: "${cmd.name}" already exists`);
          break;
        }

        const entity: WorldEntity = {
          id: api.v1.uuid(),
          batchId,
          categoryId: fieldId,
          lifecycle: "draft",
          name: cmd.name,
          summary: cmd.content,
        };
        dispatch(entityForged({ entity }));
        api.v1.log(`[forge] CREATE ${cmd.elementType} "${cmd.name}"`);
        break;
      }

      case "REVISE": {
        if (!cmd.content.trim()) {
          api.v1.log(`[forge] REVISE rejected: no content for "${cmd.name}"`);
          break;
        }
        const entity = getState().world.entities.find(
          (e) => e.name.toLowerCase() === cmd.name.toLowerCase(),
        );
        if (!entity) {
          api.v1.log(`[forge] REVISE: "${cmd.name}" not found`);
          break;
        }
        dispatch(
          entitySummaryUpdated({ entityId: entity.id, summary: cmd.content }),
        );
        api.v1.log(`[forge] REVISE "${cmd.name}"`);
        break;
      }

      case "DELETE": {
        const entity = getState().world.entities.find(
          (e) =>
            e.name.toLowerCase() === cmd.name.toLowerCase() &&
            e.lifecycle === "draft",
        );
        if (!entity) {
          api.v1.log(
            `[forge] DELETE: "${cmd.name}" not found (or not a draft)`,
          );
          break;
        }
        dispatch(entityDeleted({ entityId: entity.id }));
        api.v1.log(`[forge] DELETE "${cmd.name}"`);
        break;
      }

      case "LINK": {
        const from = getState().world.entities.find(
          (e) => e.name.toLowerCase() === cmd.fromName.toLowerCase(),
        );
        const to = getState().world.entities.find(
          (e) => e.name.toLowerCase() === cmd.toName.toLowerCase(),
        );
        if (!from || !to) {
          api.v1.log(
            `[forge] LINK: one or both entities not found ("${cmd.fromName}" → "${cmd.toName}")`,
          );
          break;
        }

        // Update existing relationship rather than duplicating — check both
        // directions since the model may emit A→B and B→A as separate commands.
        const existing = getState().world.relationships.find(
          (r) =>
            (r.fromEntityId === from.id && r.toEntityId === to.id) ||
            (r.fromEntityId === to.id && r.toEntityId === from.id),
        );
        if (existing) {
          dispatch(
            relationshipUpdated({
              relationshipId: existing.id,
              description: cmd.description,
            }),
          );
          api.v1.log(
            `[forge] LINK updated "${cmd.fromName}" → "${cmd.toName}"`,
          );
          break;
        }

        const relationship: Relationship = {
          id: api.v1.uuid(),
          fromEntityId: from.id,
          toEntityId: to.id,
          description: cmd.description,
        };
        dispatch(relationshipAdded({ relationship }));
        api.v1.log(`[forge] LINK "${cmd.fromName}" → "${cmd.toName}"`);
        break;
      }

      case "DONE":
        api.v1.log("[forge] DONE");
        break;

      case "CRITIQUE":
        api.v1.log(`[forge] CRITIQUE: ${cmd.text.slice(0, 100)}`);
        break;
    }
  }
}

export const forgeHandler: GenerationHandlers<ForgeTarget> = {
  streaming(ctx: StreamingContext<ForgeTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);

    // Show command keywords as ticker during generation
    const commandMatches = text.match(
      /\[(CREATE|REVISE|LINK|DELETE|CRITIQUE|DONE)\b[^\]]*\]/g,
    );
    const lastCommand = commandMatches
      ? commandMatches[commandMatches.length - 1]
      : "";
    const tail = lastCommand || text.replace(/\n+/g, " ").slice(-80);

    api.v1.ui.updateParts([
      {
        id: IDS.FORGE.TICKER,
        text: `[${ctx.target.step}/${FORGE_MAX_STEPS}] ${tail}`,
      },
    ]);
  },

  async completion(ctx: CompletionContext<ForgeTarget>): Promise<void> {
    // Clear ticker
    api.v1.ui.updateParts([{ id: IDS.FORGE.TICKER, text: "" }]);

    if (!ctx.generationSucceeded || !ctx.accumulatedText) {
      ctx.dispatch(forgeLoopEnded());
      return;
    }

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    const commands = parseCommands(text);

    const stepPayload = {
      batchId: ctx.target.batchId,
      step: ctx.target.step,
      forgeGuidance: ctx.target.forgeGuidance,
      brainstormContext: ctx.target.brainstormContext,
    };

    if (commands.length === 0) {
      api.v1.log(
        "[forge] No valid commands found — consuming step and continuing",
      );
      ctx.dispatch(forgeStepCompleted(stepPayload));
      return;
    }

    executeForgeCommands(
      commands,
      ctx.target.batchId,
      ctx.getState,
      ctx.dispatch,
    );

    const critique = commands.find(
      (c): c is CritiqueCommand => c.kind === "CRITIQUE",
    );
    if (critique) {
      ctx.dispatch(
        forgeCritiqueReceived({
          batchId: ctx.target.batchId,
          critiqueText: critique.text,
        }),
      );
      return;
    }

    if (commands.some((c) => c.kind === "DONE")) {
      ctx.dispatch(forgeLoopEnded());
      return;
    }

    ctx.dispatch(forgeStepCompleted(stepPayload));
  },
};
