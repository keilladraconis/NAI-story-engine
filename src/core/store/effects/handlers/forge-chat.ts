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
import { DULFS_CATEGORY_LABELS } from "../../../utils/category-detect";
import { DulfsFieldID, FieldID } from "../../../../config/field-definitions";

type ForgeChatTarget = Extract<GenerationStrategy["target"], { type: "forgeChat" }>;
type ForgeCleanupTarget = Extract<GenerationStrategy["target"], { type: "forgeCleanup" }>;

function findEntityByName(state: RootState, name: string): WorldEntity | undefined {
  return Object.values(state.world.entitiesById).find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
}

/** True if `name` was discarded earlier in this session — never resurrect it. */
function isTombstoned(state: RootState, chatId: string, name: string): boolean {
  const tombs = state.forge.tombstonesByChatId[chatId] ?? [];
  return tombs.some((t) => t.name.toLowerCase() === name.toLowerCase());
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
  assistantMessageId: string,
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
        if (isTombstoned(getState(), chatId, cmd.name)) {
          api.v1.log(
            `[forge-chat] CREATE rejected: "${cmd.name}" was removed this session`,
          );
          break;
        }
        const entity: WorldEntity = {
          id: api.v1.uuid(),
          categoryId: fieldId,
          name: cmd.name,
          summary: cmd.content,
          lifecycle: "draft",
          sourceChatId: chatId,
          lastAffectingMessageId: assistantMessageId,
        };
        dispatch(entityForged({ entity }));
        break;
      }
      case "REVISE": {
        if (!cmd.content.trim()) break;
        const target = findEntityByName(getState(), cmd.name);
        if (target) {
          if (target.lifecycle === "live") {
            emitWarning(
              dispatch,
              chatId,
              `⚠ Forge attempted to revise live entity "${target.name}" — rejected. Live entities are read-only context.`,
            );
            break;
          }
          dispatch(
            entitySummaryUpdated({
              entityId: target.id,
              summary: cmd.content,
              lastAffectingMessageId: assistantMessageId,
            }),
          );
          break;
        }
        // Not found: find-or-create. The model routinely revises an element it
        // never created, so treat REVISE as create-if-missing — but never
        // resurrect something the user discarded this session.
        if (isTombstoned(getState(), chatId, cmd.name)) {
          api.v1.log(
            `[forge-chat] REVISE: "${cmd.name}" was removed this session — not recreating`,
          );
          break;
        }
        // REVISE carries no element type; default to Character (the most common
        // forge output). The user can recategorize in the edit pane.
        const created: WorldEntity = {
          id: api.v1.uuid(),
          categoryId: FieldID.DramatisPersonae,
          name: cmd.name,
          summary: cmd.content,
          lifecycle: "draft",
          sourceChatId: chatId,
          lastAffectingMessageId: assistantMessageId,
        };
        api.v1.log(
          `[forge-chat] REVISE "${cmd.name}" not found — creating as draft Character`,
        );
        dispatch(entityForged({ entity: created }));
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
              category: DULFS_CATEGORY_LABELS[target.categoryId] ?? "Entity",
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
    await executeForgeChatCommands(commands, ctx.target.chatId, ctx.target.messageId, ctx.getState, ctx.dispatch);
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
    await executeForgeChatCommands(reviseOnly, ctx.target.chatId, ctx.target.messageId, ctx.getState, ctx.dispatch);
  },
};
