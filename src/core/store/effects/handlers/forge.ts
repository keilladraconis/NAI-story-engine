/**
 * Forge Handler — Parses and executes structured commands from GLM's forge output,
 * dispatching results to the world slice (entityForged, relationshipAdded, etc.).
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
} from "../../slices/world";
import { parseCommands } from "../../../utils/crucible-command-parser";
import { TYPE_TO_FIELD } from "../../../utils/crucible-command-parser";
import { stripThinkingTags } from "../../../utils/tag-parser";
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
        const fieldId = TYPE_TO_FIELD[cmd.elementType] as DulfsFieldID | undefined;
        if (!fieldId) {
          api.v1.log(`[forge] CREATE: unknown type "${cmd.elementType}" for "${cmd.name}"`);
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
        const entity = getState().world.entities.find(
          (e) => e.name.toLowerCase() === cmd.name.toLowerCase(),
        );
        if (!entity) {
          api.v1.log(`[forge] REVISE: "${cmd.name}" not found`);
          break;
        }
        dispatch(entitySummaryUpdated({ entityId: entity.id, summary: cmd.content }));
        api.v1.log(`[forge] REVISE "${cmd.name}"`);
        break;
      }

      case "DELETE": {
        const entity = getState().world.entities.find(
          (e) => e.name.toLowerCase() === cmd.name.toLowerCase() && e.lifecycle === "draft",
        );
        if (!entity) {
          api.v1.log(`[forge] DELETE: "${cmd.name}" not found (or not a draft)`);
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
          api.v1.log(`[forge] LINK: one or both entities not found ("${cmd.fromName}" → "${cmd.toName}")`);
          break;
        }

        // Dedup: skip if relationship already exists
        const existing = getState().world.relationships.find(
          (r) => r.fromEntityId === from.id && r.toEntityId === to.id,
        );
        if (existing) {
          api.v1.log(`[forge] LINK: "${cmd.fromName}" → "${cmd.toName}" already exists`);
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
        api.v1.log(`[forge] CRITIQUE: ${cmd.content.slice(0, 100)}`);
        break;
    }
  }
}

export const forgeHandler: GenerationHandlers<ForgeTarget> = {
  streaming(ctx: StreamingContext<ForgeTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);

    // Show command keywords as ticker during generation
    const commandMatches = text.match(/\[(CREATE|REVISE|LINK|DELETE|CRITIQUE|DONE)\b[^\]]*\]/g);
    const lastCommand = commandMatches ? commandMatches[commandMatches.length - 1] : "";
    const tail = lastCommand || text.replace(/\n+/g, " ").slice(-80);

    api.v1.ui.updateParts([
      { id: IDS.FORGE.TICKER, text: tail },
    ]);
  },

  async completion(ctx: CompletionContext<ForgeTarget>): Promise<void> {
    // Clear ticker
    api.v1.ui.updateParts([{ id: IDS.FORGE.TICKER, text: "" }]);

    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    const commands = parseCommands(text);

    if (commands.length === 0) {
      api.v1.log("[forge] No valid commands found in GLM output");
      api.v1.log("[forge] Raw text:", text.slice(0, 500));
      return;
    }

    executeForgeCommands(commands, ctx.target.batchId, ctx.getState, ctx.dispatch);

    const newDrafts = ctx.getState().world.entities.filter(
      (e) => e.batchId === ctx.target.batchId && e.lifecycle === "draft",
    );
    api.v1.log(`[forge] Batch "${ctx.target.batchId}": ${newDrafts.length} draft entities`);
  },
};
