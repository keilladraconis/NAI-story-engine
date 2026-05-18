import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { GenerationStrategy } from "../../types";
import {
  entityForged,
  entitySummaryUpdated,
  entityEdited,
  entityDeleted,
  groupCreated,
} from "../../slices/world";
import { messageAppended, messageUpdated, messageAdded } from "../../slices/chat";
import { tombstoneAdded } from "../../slices/forge";
import { WorldEntity, WorldGroup, RootState, AppDispatch } from "../../types";
import {
  parseCommands,
  TYPE_TO_FIELD,
  type ParsedCommand,
} from "../../../utils/crucible-command-parser";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { DulfsFieldID, FieldID } from "../../../../config/field-definitions";

type ForgeChatTarget = Extract<GenerationStrategy["target"], { type: "forgeChat" }>;
type ForgeCleanupTarget = Extract<GenerationStrategy["target"], { type: "forgeCleanup" }>;

const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
  [FieldID.Topics]: "Topic",
};

function findEntityByName(state: RootState, name: string): WorldEntity | undefined {
  return Object.values(state.world.entitiesById).find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
}

function emitWarning(dispatch: AppDispatch, chatId: string, text: string): void {
  dispatch(
    messageAdded({
      chatId,
      message: {
        id: api.v1.uuid(),
        role: "assistant",
        content: text,
        messageKind: "warning",
      },
    }),
  );
}

async function executeForgeChatCommands(
  commands: ParsedCommand[],
  chatId: string,
  getState: () => RootState,
  dispatch: AppDispatch,
): Promise<void> {
  for (const cmd of commands) {
    switch (cmd.kind) {
      case "CREATE": {
        if (!cmd.content.trim()) {
          api.v1.log(`[forge-chat] CREATE rejected: empty content for "${cmd.name}"`);
          break;
        }
        const fieldId = TYPE_TO_FIELD[cmd.elementType] as DulfsFieldID | undefined;
        if (!fieldId) {
          api.v1.log(`[forge-chat] CREATE: unknown type "${cmd.elementType}"`);
          break;
        }
        const existing = findEntityByName(getState(), cmd.name);
        if (existing) {
          api.v1.log(`[forge-chat] CREATE rejected: "${cmd.name}" already exists`);
          break;
        }
        const entity: WorldEntity = {
          id: api.v1.uuid(),
          categoryId: fieldId,
          name: cmd.name,
          summary: cmd.content,
          lifecycle: "draft",
          sourceChatId: chatId,
        };
        dispatch(entityForged({ entity }));
        break;
      }
      case "REVISE": {
        if (!cmd.content.trim()) break;
        const target = findEntityByName(getState(), cmd.name);
        if (!target) {
          api.v1.log(`[forge-chat] REVISE: "${cmd.name}" not found`);
          break;
        }
        if (target.lifecycle === "live") {
          emitWarning(
            dispatch,
            chatId,
            `⚠ Forge attempted to revise live entity "${target.name}" — rejected. Live entities are read-only context.`,
          );
          break;
        }
        dispatch(entitySummaryUpdated({ entityId: target.id, summary: cmd.content }));
        break;
      }
      case "DELETE": {
        const target = findEntityByName(getState(), cmd.name);
        if (!target) {
          api.v1.log(`[forge-chat] DELETE: "${cmd.name}" not found`);
          break;
        }
        if (target.lifecycle === "live") {
          emitWarning(
            dispatch,
            chatId,
            `⚠ Forge attempted to delete live entity "${target.name}" — rejected. Live entities are read-only context.`,
          );
          break;
        }
        dispatch(entityDeleted({ entityId: target.id }));
        dispatch(
          tombstoneAdded({
            chatId,
            tombstone: {
              name: target.name,
              category: FIELD_LABEL[target.categoryId] ?? "Entity",
              reason: "model",
            },
          }),
        );
        break;
      }
      case "RENAME": {
        const target = findEntityByName(getState(), cmd.oldName);
        if (!target) {
          api.v1.log(`[forge-chat] RENAME: "${cmd.oldName}" not found`);
          break;
        }
        if (target.lifecycle === "live") {
          emitWarning(
            dispatch,
            chatId,
            `⚠ Forge attempted to rename live entity "${target.name}" — rejected. Live entities are read-only context.`,
          );
          break;
        }
        if (!cmd.newName.trim()) break;
        dispatch(
          entityEdited({
            entityId: target.id,
            name: cmd.newName,
            summary: target.summary,
          }),
        );
        break;
      }
      case "THREAD": {
        const state = getState();
        const existingGroup = state.world.groups.find(
          (g) => g.title.toLowerCase() === cmd.title.toLowerCase(),
        );
        if (existingGroup) {
          api.v1.log(`[forge-chat] THREAD rejected: "${cmd.title}" already exists`);
          break;
        }
        const memberIds = cmd.memberNames
          .map((name) => findEntityByName(state, name)?.id)
          .filter((id): id is string => !!id);
        if (memberIds.length < 2) {
          api.v1.log(
            `[forge-chat] THREAD "${cmd.title}": needs >=2 valid members, got ${memberIds.length}`,
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
        break;
      }
      case "CRITIQUE":
      case "DONE":
      case "LINK":
        break;
    }
  }
}

export const forgeChatHandler: GenerationHandlers<ForgeChatTarget> = {
  streaming(ctx: StreamingContext<ForgeChatTarget>, newText: string): void {
    ctx.dispatch(
      messageAppended({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: newText,
      }),
    );
  },

  async completion(ctx: CompletionContext<ForgeChatTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;
    const cleaned = stripThinkingTags(ctx.accumulatedText);
    ctx.dispatch(
      messageUpdated({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: cleaned,
      }),
    );
    if (!ctx.generationSucceeded) return;

    const commands = parseCommands(cleaned);
    await executeForgeChatCommands(commands, ctx.target.chatId, ctx.getState, ctx.dispatch);
  },
};

export const forgeCleanupHandler: GenerationHandlers<ForgeCleanupTarget> = {
  streaming(ctx: StreamingContext<ForgeCleanupTarget>, newText: string): void {
    ctx.dispatch(
      messageAppended({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: newText,
      }),
    );
  },

  async completion(ctx: CompletionContext<ForgeCleanupTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;
    const cleaned = stripThinkingTags(ctx.accumulatedText);
    ctx.dispatch(
      messageUpdated({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: cleaned,
      }),
    );
    if (!ctx.generationSucceeded) return;

    const all = parseCommands(cleaned);
    const reviseOnly = all.filter(
      (c): c is Extract<ParsedCommand, { kind: "REVISE" }> => c.kind === "REVISE",
    );
    await executeForgeChatCommands(reviseOnly, ctx.target.chatId, ctx.getState, ctx.dispatch);
  },
};
