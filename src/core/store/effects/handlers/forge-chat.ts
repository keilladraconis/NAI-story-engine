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
  threadCreated,
  threadLedgerUpdated,
  threadWishSet,
} from "../../slices/world";
import {
  messageAppended,
  messageUpdated,
  messageRemoved,
  forgeSegmentsSet,
} from "../../slices/chat";
import { tombstoneAdded } from "../../slices/forge";
import { WorldEntity, ThreadDraft, RootState, AppDispatch } from "../../types";
import {
  walkForgeLines,
  canonicalizeForgeCommands,
  TYPE_TO_FIELD,
  unrecognizedAction,
  commandBody,
  type ParsedCommand,
} from "../../../utils/crucible-command-parser";
import type {
  ForgeActionRecord,
  ForgeSegment,
} from "../../../chat-types/types";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { DULFS_CATEGORY_LABELS } from "../../../utils/category-detect";
import { DulfsFieldID, FieldID } from "../../../../config/field-definitions";

type ForgeChatTarget = Extract<
  GenerationStrategy["target"],
  { type: "forgeChat" }
>;
type ForgeCleanupTarget = Extract<
  GenerationStrategy["target"],
  { type: "forgeCleanup" }
>;

function findEntityByName(
  state: RootState,
  name: string,
): WorldEntity | undefined {
  return Object.values(state.world.entitiesById).find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
}

/** True if `name` was discarded earlier in this session — never resurrect it. */
function isTombstoned(state: RootState, chatId: string, name: string): boolean {
  const tombs = state.forge.tombstonesByChatId[chatId] ?? [];
  return tombs.some((t) => t.name.toLowerCase() === name.toLowerCase());
}

/** Why a command was not applied. The next turn's context shows the model
 *  each of these beside the command it refused, so each reads as the repair:
 *  what to write instead, or that the thing cannot be done. */
const REASON = {
  exists: "already exists; REVISE it instead",
  discarded: "was discarded; do not recreate it",
  noSummary: "needs a summary after the bar",
  unknownType:
    "unknown type; use CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION or TOPIC",
  live: "is live and cannot be changed from the chat",
  notFound: "not found; name a draft under [POOL], spelled exactly",
  noNewName: "needs a new name after the arrow",
  concluded: "is concluded and cannot be rewritten",
} as const;

/** Execute a single parsed command and return its outcome record. With
 *  reviseOnly (cleanup pass), any non-REVISE command is rejected unexecuted. */
export function executeForgeCommand(
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
          : cmd.kind === "DONE"
            ? undefined
            : (cmd as { name?: string }).name;
    return {
      kind: cmd.kind === "LINK" || cmd.kind === "DONE" ? "UNKNOWN" : cmd.kind,
      status: "rejected",
      elementType:
        cmd.kind === "CREATE" ? cmd.elementType.toUpperCase() : undefined,
      name,
      reason: "cleanup pass",
    };
  }

  switch (cmd.kind) {
    case "CREATE": {
      const elementType = cmd.elementType.toUpperCase();
      if (!cmd.content.trim()) {
        return {
          kind: "CREATE",
          status: "rejected",
          elementType,
          name: cmd.name,
          reason: REASON.noSummary,
        };
      }
      const fieldId = TYPE_TO_FIELD[elementType] as DulfsFieldID | undefined;
      if (!fieldId) {
        return {
          kind: "CREATE",
          status: "rejected",
          elementType,
          name: cmd.name,
          reason: REASON.unknownType,
        };
      }
      if (findEntityByName(getState(), cmd.name)) {
        return {
          kind: "CREATE",
          status: "rejected",
          elementType,
          name: cmd.name,
          reason: REASON.exists,
        };
      }
      if (isTombstoned(getState(), chatId, cmd.name)) {
        return {
          kind: "CREATE",
          status: "rejected",
          elementType,
          name: cmd.name,
          reason: REASON.discarded,
        };
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
        return {
          kind: "REVISE",
          status: "rejected",
          name: cmd.name,
          reason: REASON.noSummary,
        };
      }
      const target = findEntityByName(getState(), cmd.name);
      if (target) {
        if (target.lifecycle === "live") {
          return {
            kind: "REVISE",
            status: "rejected",
            name: cmd.name,
            reason: REASON.live,
          };
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
        return {
          kind: "REVISE",
          status: "rejected",
          name: cmd.name,
          reason: REASON.discarded,
        };
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
      return {
        kind: "CREATE",
        status: "applied",
        elementType: "CHARACTER",
        name: cmd.name,
      };
    }

    case "DELETE": {
      const target = findEntityByName(getState(), cmd.name);
      if (!target) {
        return {
          kind: "DELETE",
          status: "rejected",
          name: cmd.name,
          reason: REASON.notFound,
        };
      }
      if (target.lifecycle === "live") {
        return {
          kind: "DELETE",
          status: "rejected",
          name: cmd.name,
          reason: REASON.live,
        };
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
        return {
          kind: "RENAME",
          status: "rejected",
          name: cmd.oldName,
          reason: REASON.notFound,
        };
      }
      if (target.lifecycle === "live") {
        return {
          kind: "RENAME",
          status: "rejected",
          name: target.name,
          reason: REASON.live,
        };
      }
      if (!cmd.newName.trim()) {
        return {
          kind: "RENAME",
          status: "rejected",
          name: target.name,
          reason: REASON.noNewName,
        };
      }
      dispatch(
        entityEdited({
          entityId: target.id,
          name: cmd.newName,
          summary: target.summary,
        }),
      );
      return {
        kind: "RENAME",
        status: "applied",
        name: cmd.oldName,
        newName: cmd.newName,
      };
    }

    case "THREAD": {
      const state = getState();
      const existing = state.world.threads.find(
        (t) => t.title.toLowerCase() === cmd.title.toLowerCase(),
      );
      if (existing) {
        if (existing.status === "concluded") {
          return {
            kind: "THREAD",
            status: "rejected",
            name: cmd.title,
            reason: REASON.concluded,
          };
        }
        // A rewrite replaces what it supplies. An empty segment means "no
        // change", never "erase": the model re-emits a Thread to move its
        // state, and must not be able to wipe the private half by omission.
        dispatch(
          threadLedgerUpdated({
            threadId: existing.id,
            state: cmd.state || existing.state,
            latent: cmd.latent || existing.latent,
          }),
        );
        if (cmd.wish) {
          dispatch(threadWishSet({ threadId: existing.id, wish: cmd.wish }));
        }
        return { kind: "THREAD", status: "applied", name: existing.title };
      }
      // Every named member must be a known element (the parser admits no
      // THREAD without one). A Thread made from the names that happen to
      // resolve stands between a different cast than its state was written for.
      const members = cmd.memberNames.map((name) => ({
        name,
        id: findEntityByName(state, name)?.id,
      }));
      const unknown = members.find((m) => !m.id);
      if (unknown) {
        return {
          kind: "THREAD",
          status: "rejected",
          name: cmd.title,
          reason: `unknown member "${unknown.name}"; name only elements under [POOL] or [LIVE], spelled exactly`,
        };
      }
      const memberIds = members
        .map((m) => m.id)
        .filter((id): id is string => !!id);
      // No status: `threadCreated` defaults it (world.ts).
      const thread: ThreadDraft = {
        id: api.v1.uuid(),
        title: cmd.title,
        state: cmd.state,
        latent: cmd.latent,
        wish: cmd.wish,
        entityIds: memberIds,
      };
      dispatch(threadCreated({ thread }));
      return { kind: "THREAD", status: "applied", name: cmd.title };
    }

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
      segments.push({ kind: "action", action: unrecognizedAction(tok.raw) });
      continue;
    }
    if (tok.command.kind === "DONE" || tok.command.kind === "LINK") continue;
    flush();
    const action = executeForgeCommand(
      tok.command,
      chatId,
      messageId,
      getState,
      dispatch,
      { reviseOnly },
    );
    segments.push({
      kind: "action",
      action: { ...action, body: commandBody(tok.command) },
    });
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
    if (!ctx.accumulatedText) {
      // Cancelled or returned nothing before any tokens streamed: drop the empty
      // placeholder turn instead of leaving a blank bubble behind.
      ctx.dispatch(
        messageRemoved({ chatId: ctx.target.chatId, id: ctx.target.messageId }),
      );
      return;
    }
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
      forgeSegmentsSet({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        segments,
      }),
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
    if (!ctx.accumulatedText) {
      // Same as the phase turn: a cancelled/empty cleanup leaves no husk.
      ctx.dispatch(
        messageRemoved({ chatId: ctx.target.chatId, id: ctx.target.messageId }),
      );
      return;
    }
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
      forgeSegmentsSet({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        segments,
      }),
    );
  },
};
