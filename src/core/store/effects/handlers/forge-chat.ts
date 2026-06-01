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
import { messageAppended, messageUpdated, forgeSegmentsSet } from "../../slices/chat";
import { tombstoneAdded } from "../../slices/forge";
import { WorldEntity, WorldGroup, RootState, AppDispatch } from "../../types";
import {
  walkForgeLines,
  canonicalizeForgeCommands,
  TYPE_TO_FIELD,
  type ParsedCommand,
} from "../../../utils/crucible-command-parser";
import type { ForgeActionRecord, ForgeSegment } from "../../../chat-types/types";
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

/** Execute a single parsed command and return its outcome record. With
 *  reviseOnly (cleanup pass), any non-REVISE command is rejected unexecuted. */
function executeForgeCommand(
  cmd: ParsedCommand,
  chatId: string,
  assistantMessageId: string,
  getState: () => RootState,
  dispatch: AppDispatch,
  opts: { reviseOnly: boolean },
): ForgeActionRecord {
  if (opts.reviseOnly && cmd.kind !== "REVISE") {
    const name =
      cmd.kind === "RENAME"
        ? cmd.oldName
        : cmd.kind === "THREAD"
          ? cmd.title
          : cmd.kind === "CRITIQUE" || cmd.kind === "DONE"
            ? undefined
            : (cmd as { name?: string }).name;
    return {
      kind: cmd.kind === "LINK" || cmd.kind === "DONE" ? "UNKNOWN" : cmd.kind,
      status: "rejected",
      elementType: cmd.kind === "CREATE" ? cmd.elementType.toUpperCase() : undefined,
      name,
      reason: "cleanup pass",
    };
  }

  switch (cmd.kind) {
    case "CREATE": {
      const elementType = cmd.elementType.toUpperCase();
      if (!cmd.content.trim()) {
        return { kind: "CREATE", status: "rejected", elementType, name: cmd.name, reason: "empty content" };
      }
      const fieldId = TYPE_TO_FIELD[elementType] as DulfsFieldID | undefined;
      if (!fieldId) {
        return { kind: "CREATE", status: "rejected", elementType, name: cmd.name, reason: "unknown type" };
      }
      if (findEntityByName(getState(), cmd.name)) {
        return { kind: "CREATE", status: "rejected", elementType, name: cmd.name, reason: "duplicate" };
      }
      if (isTombstoned(getState(), chatId, cmd.name)) {
        return { kind: "CREATE", status: "rejected", elementType, name: cmd.name, reason: "removed this session" };
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
      return { kind: "CREATE", status: "applied", elementType, name: cmd.name };
    }

    case "REVISE": {
      if (!cmd.content.trim()) {
        return { kind: "REVISE", status: "rejected", name: cmd.name, reason: "empty content" };
      }
      const target = findEntityByName(getState(), cmd.name);
      if (target) {
        if (target.lifecycle === "live") {
          return { kind: "REVISE", status: "rejected", name: cmd.name, reason: "live entity" };
        }
        dispatch(
          entitySummaryUpdated({
            entityId: target.id,
            summary: cmd.content,
            lastAffectingMessageId: assistantMessageId,
          }),
        );
        return { kind: "REVISE", status: "applied", name: cmd.name };
      }
      // Find-or-create: the model routinely revises something it never created.
      if (isTombstoned(getState(), chatId, cmd.name)) {
        return { kind: "REVISE", status: "rejected", name: cmd.name, reason: "removed this session" };
      }
      const created: WorldEntity = {
        id: api.v1.uuid(),
        categoryId: FieldID.DramatisPersonae,
        name: cmd.name,
        summary: cmd.content,
        lifecycle: "draft",
        sourceChatId: chatId,
        lastAffectingMessageId: assistantMessageId,
      };
      dispatch(entityForged({ entity: created }));
      return { kind: "CREATE", status: "applied", elementType: "CHARACTER", name: cmd.name };
    }

    case "DELETE": {
      const target = findEntityByName(getState(), cmd.name);
      if (!target) {
        return { kind: "DELETE", status: "rejected", name: cmd.name, reason: "not found" };
      }
      if (target.lifecycle === "live") {
        return { kind: "DELETE", status: "rejected", name: cmd.name, reason: "live entity" };
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
      return { kind: "DELETE", status: "applied", name: target.name };
    }

    case "RENAME": {
      const target = findEntityByName(getState(), cmd.oldName);
      if (!target) {
        return { kind: "RENAME", status: "rejected", name: cmd.oldName, reason: "not found" };
      }
      if (target.lifecycle === "live") {
        return { kind: "RENAME", status: "rejected", name: target.name, reason: "live entity" };
      }
      if (!cmd.newName.trim()) {
        return { kind: "RENAME", status: "rejected", name: target.name, reason: "empty new name" };
      }
      dispatch(entityEdited({ entityId: target.id, name: cmd.newName, summary: target.summary }));
      return { kind: "RENAME", status: "applied", name: cmd.oldName, newName: cmd.newName };
    }

    case "THREAD": {
      const state = getState();
      if (state.world.groups.find((g) => g.title.toLowerCase() === cmd.title.toLowerCase())) {
        return { kind: "THREAD", status: "rejected", name: cmd.title, reason: "duplicate" };
      }
      const memberIds = cmd.memberNames
        .map((name) => findEntityByName(state, name)?.id)
        .filter((id): id is string => !!id);
      if (memberIds.length < 2) {
        return { kind: "THREAD", status: "rejected", name: cmd.title, reason: "needs ≥2 members" };
      }
      const group: WorldGroup = {
        id: api.v1.uuid(),
        title: cmd.title,
        summary: cmd.description,
        entityIds: memberIds,
      };
      dispatch(groupCreated({ group }));
      return { kind: "THREAD", status: "applied", name: cmd.title };
    }

    case "CRITIQUE":
      return { kind: "CRITIQUE", status: "applied", text: cmd.text };

    case "LINK":
    case "DONE":
      return { kind: "UNKNOWN", status: "applied" };
  }
}

/** Walk a finished turn into ordered display segments, executing each command
 *  as it is encountered. DONE/LINK produce no segment. */
function buildForgeSegments(
  text: string,
  chatId: string,
  messageId: string,
  getState: () => RootState,
  dispatch: AppDispatch,
  reviseOnly: boolean,
): ForgeSegment[] {
  const segments: ForgeSegment[] = [];
  let prose: string[] = [];
  const flush = () => {
    const joined = prose.join("\n").trim();
    if (joined) segments.push({ kind: "prose", text: joined });
    prose = [];
  };
  for (const tok of walkForgeLines(text)) {
    if (tok.kind === "prose") {
      prose.push(tok.text);
      continue;
    }
    if (tok.kind === "unrecognized") {
      flush();
      segments.push({ kind: "action", action: { kind: "UNKNOWN", status: "unrecognized", reason: tok.raw } });
      continue;
    }
    if (tok.command.kind === "DONE" || tok.command.kind === "LINK") continue;
    flush();
    const action = executeForgeCommand(tok.command, chatId, messageId, getState, dispatch, { reviseOnly });
    segments.push({ kind: "action", action });
  }
  flush();
  return segments;
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
        content: canonicalizeForgeCommands(cleaned),
      }),
    );
    if (!ctx.generationSucceeded) return;

    const segments = buildForgeSegments(
      cleaned,
      ctx.target.chatId,
      ctx.target.messageId,
      ctx.getState,
      ctx.dispatch,
      false,
    );
    ctx.dispatch(
      forgeSegmentsSet({ chatId: ctx.target.chatId, id: ctx.target.messageId, segments }),
    );
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
        content: canonicalizeForgeCommands(cleaned),
      }),
    );
    if (!ctx.generationSucceeded) return;

    const segments = buildForgeSegments(
      cleaned,
      ctx.target.chatId,
      ctx.target.messageId,
      ctx.getState,
      ctx.dispatch,
      true,
    );
    ctx.dispatch(
      forgeSegmentsSet({ chatId: ctx.target.chatId, id: ctx.target.messageId, segments }),
    );
  },
};
