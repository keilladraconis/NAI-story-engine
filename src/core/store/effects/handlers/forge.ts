/**
 * Forge Handler — Parses and executes structured commands from GLM's forge output,
 * dispatching results to the world slice (entityForged, etc.).
 * Drives the atomic forge loop by dispatching step/critique/done signals.
 */

import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { GenerationStrategy } from "../../types";
import { DulfsFieldID } from "../../../../config/field-definitions";
import {
  entityForged,
  entitySummaryUpdated,
  entityEdited,
  entityDeleted,
  groupCreated,
  forgeStepCompleted,
  forgeCritiqueReceived,
  forgeLoopEnded,
} from "../../slices/world";
import { WorldEntity, WorldGroup } from "../../types";
import { ensureCategory } from "../lorebook-sync";
import {
  parseCommands,
  CritiqueCommand,
} from "../../../utils/crucible-command-parser";
import { TYPE_TO_FIELD } from "../../../utils/crucible-command-parser";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { getPhaseForStep, FORGE_MAX_STEPS } from "../../../utils/forge-strategy";
import { IDS } from "../../../../ui/framework/ids";

type ForgeTarget = Extract<GenerationStrategy["target"], { type: "forge" }>;

/**
 * Executes forge commands against the world slice.
 * CREATE → lorebook entry + entityForged (live immediately)
 * REVISE → entitySummaryUpdated (works on any entity)
 * DELETE → entityDeleted (lorebook entry preserved)
 * RENAME → entityEdited + lorebook displayName update
 * THREAD → groupCreated
 */
async function executeForgeCommands(
  commands: ReturnType<typeof parseCommands>,
  getState: () => import("../../types").RootState,
  dispatch: import("../../types").AppDispatch,
): Promise<void> {
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
        const existing = Object.values(getState().world.entitiesById).find(
          (e) => e.name.toLowerCase() === cmd.name.toLowerCase(),
        );
        if (existing) {
          api.v1.log(`[forge] CREATE rejected: "${cmd.name}" already exists`);
          break;
        }

        const categoryId = await ensureCategory(fieldId);
        const lorebookEntryId = await api.v1.lorebook.createEntry({
          id: api.v1.uuid(),
          displayName: cmd.name,
          text: "",
          keys: [],
          enabled: true,
          category: categoryId,
        });

        const entity: WorldEntity = {
          id: api.v1.uuid(),
          categoryId: fieldId,
          lorebookEntryId,
          name: cmd.name,
          summary: cmd.content,
        };
        dispatch(entityForged({ entity }));
        api.v1.log(`[forge] CREATE ${cmd.elementType} "${cmd.name}" → ${lorebookEntryId}`);
        break;
      }

      case "REVISE": {
        if (!cmd.content.trim()) {
          api.v1.log(`[forge] REVISE rejected: no content for "${cmd.name}"`);
          break;
        }
        const entity = Object.values(getState().world.entitiesById).find(
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
        const entity = Object.values(getState().world.entitiesById).find(
          (e) => e.name.toLowerCase() === cmd.name.toLowerCase(),
        );
        if (!entity) {
          api.v1.log(`[forge] DELETE: "${cmd.name}" not found`);
          break;
        }
        dispatch(entityDeleted({ entityId: entity.id }));
        api.v1.log(`[forge] DELETE "${cmd.name}" (lorebook entry preserved)`);
        break;
      }

      case "THREAD": {
        const existingGroup = getState().world.groups.find(
          (g) => g.title.toLowerCase() === cmd.title.toLowerCase(),
        );
        if (existingGroup) {
          api.v1.log(`[forge] THREAD rejected: "${cmd.title}" already exists`);
          break;
        }
        const entitiesArr = Object.values(getState().world.entitiesById);
        const memberIds = cmd.memberNames
          .map(
            (name) =>
              entitiesArr.find(
                (e) => e.name.toLowerCase() === name.toLowerCase(),
              )?.id,
          )
          .filter((id): id is string => id !== undefined);
        if (memberIds.length < 2) {
          api.v1.log(
            `[forge] THREAD "${cmd.title}": needs at least 2 valid members, got ${memberIds.length}`,
          );
          break;
        }
        const group: WorldGroup = {
          id: api.v1.uuid(),
          title: cmd.title,
          summary: cmd.description,
          entityIds: memberIds,
        };
        dispatch(groupCreated({ group }));
        api.v1.log(
          `[forge] THREAD "${cmd.title}" with ${memberIds.length} members`,
        );
        break;
      }

      case "RENAME": {
        const entity = Object.values(getState().world.entitiesById).find(
          (e) => e.name.toLowerCase() === cmd.oldName.toLowerCase(),
        );
        if (!entity) {
          api.v1.log(`[forge] RENAME: "${cmd.oldName}" not found`);
          break;
        }
        if (!cmd.newName.trim()) {
          api.v1.log(`[forge] RENAME rejected: empty new name for "${cmd.oldName}"`);
          break;
        }
        dispatch(entityEdited({ entityId: entity.id, name: cmd.newName, summary: entity.summary ?? "" }));
        if (entity.lorebookEntryId) {
          const entry = await api.v1.lorebook.entry(entity.lorebookEntryId);
          if (entry) {
            await api.v1.lorebook.updateEntry(entity.lorebookEntryId, {
              ...entry,
              displayName: cmd.newName,
            });
          }
        }
        api.v1.log(`[forge] RENAME "${cmd.oldName}" → "${cmd.newName}"`);
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
      /\[(CREATE|REVISE|DELETE|RENAME|THREAD|CRITIQUE|DONE)\b[^\]]*\]/g,
    );
    const lastCommand = commandMatches
      ? commandMatches[commandMatches.length - 1]
      : "";
    const tail = lastCommand || text.replace(/\n+/g, " ").slice(-80);
    const phase = getPhaseForStep(ctx.target.step);
    const phaseStep = ctx.target.step - phase.startStep + 1;
    const phaseSteps = phase.endStep - phase.startStep + 1;

    api.v1.ui.updateParts([
      {
        id: IDS.FORGE.TICKER,
        text: `[${phase.name} ${phaseStep}/${phaseSteps}] ${tail}`,
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
      step: ctx.target.step,
      forgeGuidance: ctx.target.forgeGuidance,
      brainstormContext: ctx.target.brainstormContext,
      preForgeEntityIds: ctx.target.preForgeEntityIds,
    };

    if (commands.length === 0) {
      api.v1.log(
        "[forge] No valid commands found — consuming step and continuing",
      );
      ctx.dispatch(forgeStepCompleted(stepPayload));
      return;
    }

    await executeForgeCommands(commands, ctx.getState, ctx.dispatch);

    // DONE is a hard stop at any step (emergency exit, not prompted)
    if (commands.some((c) => c.kind === "DONE")) {
      ctx.dispatch(forgeLoopEnded());
      return;
    }

    const isLastStep = ctx.target.step >= FORGE_MAX_STEPS;
    const critique = commands.find(
      (c): c is CritiqueCommand => c.kind === "CRITIQUE",
    );

    if (isLastStep) {
      // Final step: write critique to guidance field and end loop
      ctx.dispatch(
        forgeCritiqueReceived({
          critiqueText: critique?.text ?? "",
        }),
      );
      return;
    }

    // Mid-loop critique is already logged in executeForgeCommands — just continue
    ctx.dispatch(forgeStepCompleted(stepPayload));
  },
};
