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
  entityRestored,
  threadCreated,
  threadDeleted,
  threadLedgerUpdated,
  threadWishSet,
} from "../../slices/world";
import {
  messageAppended,
  messageUpdated,
  messageRemoved,
  forgeSegmentsSet,
  messageUndone,
} from "../../slices/chat";
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
import { bindEntryFor, renameEntry } from "../entity-entry";
import { SCENARIO_BUILD_PREFILL } from "../../../utils/prompts";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { DulfsFieldID, FieldID } from "../../../../config/field-definitions";

type ForgeChatTarget = Extract<
  GenerationStrategy["target"],
  { type: "forgeChat" }
>;

function findEntityByName(
  state: RootState,
  name: string,
): WorldEntity | undefined {
  return Object.values(state.world.entitiesById).find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
}

/** Why a command was not applied. The next turn's context shows the model
 *  each of these beside the command it refused, so each reads as the repair:
 *  what to write instead, or that the thing cannot be done. */
const REASON = {
  exists: "already exists; REVISE it instead",
  noSummary: "needs a summary after the bar",
  unknownType:
    "unknown type; use CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION or TOPIC",
  notFound: "not found; name an element under [WORLD], spelled exactly",
  noNewName: "needs a new name after the arrow",
  sameName: "is already its name; write no RENAME for it",
  taken: "is the name of another element; choose a different name",
  notBuiltHere: "was not built here and cannot be deleted from the chat",
  concluded: "is concluded and cannot be rewritten",
} as const;

function lorebookRefused(error: unknown): string {
  return `the lorebook refused: ${error instanceof Error ? error.message : String(error)}`;
}

/** Every lorebook entry the World already holds: an entity's or a Thread's.
 *  A new entity may not adopt one of these. */
function boundEntryIds(state: RootState): Set<string> {
  const ids = new Set<string>();
  for (const owner of [
    ...Object.values(state.world.entitiesById),
    ...state.world.threads,
  ]) {
    if (owner.lorebookEntryId) ids.add(owner.lorebookEntryId);
  }
  return ids;
}

/** Make a live entity with its lorebook entry. A lorebook failure rejects the
 *  command and makes nothing. */
async function createLive(
  kind: "CREATE",
  elementType: string,
  fieldId: DulfsFieldID,
  name: string,
  summary: string,
  chatId: string,
  getState: () => RootState,
  dispatch: AppDispatch,
): Promise<ForgeActionRecord> {
  let bound: { entryId: string; created: boolean };
  try {
    bound = await bindEntryFor(
      { name, categoryId: fieldId },
      boundEntryIds(getState()),
    );
  } catch (error) {
    return {
      kind,
      status: "rejected",
      elementType,
      name,
      reason: lorebookRefused(error),
    };
  }
  const entity: WorldEntity = {
    id: api.v1.uuid(),
    categoryId: fieldId,
    name,
    summary,
    lifecycle: "live",
    lorebookEntryId: bound.entryId,
    sourceChatId: chatId,
  };
  dispatch(entityForged({ entity }));
  return {
    kind,
    status: "applied",
    elementType,
    name,
    entityId: entity.id,
    undo: {
      op: "entityCreated",
      entityId: entity.id,
      entryCreated: bound.created,
    },
  };
}

/** Execute a single parsed command and return its outcome record. */
export async function executeForgeCommand(
  cmd: ParsedCommand,
  chatId: string,
  _assistantMessageId: string,
  getState: () => RootState,
  dispatch: AppDispatch,
): Promise<ForgeActionRecord> {
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
      return createLive(
        "CREATE",
        elementType,
        fieldId,
        cmd.name,
        cmd.content,
        chatId,
        getState,
        dispatch,
      );
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
        dispatch(
          entitySummaryUpdated({ entityId: target.id, summary: cmd.content }),
        );
        return {
          kind: "REVISE",
          status: "applied",
          name: cmd.name,
          entityId: target.id,
          undo: {
            op: "summary",
            entityId: target.id,
            before: target.summary,
            wrote: cmd.content,
          },
        };
      }
      // Find-or-create: the model routinely revises something it never created.
      return createLive(
        "CREATE",
        "CHARACTER",
        FieldID.DramatisPersonae,
        cmd.name,
        cmd.content,
        chatId,
        getState,
        dispatch,
      );
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
      if (!target.sourceChatId) {
        return {
          kind: "DELETE",
          status: "rejected",
          name: cmd.name,
          reason: REASON.notBuiltHere,
        };
      }
      const threadIds = getState()
        .world.threads.filter((t) => t.entityIds.includes(target.id))
        .map((t) => t.id);
      // The entry goes first: a refused removal must leave the entity in
      // place, and the dispatch after it is synchronous.
      let entry: LorebookEntry | null;
      try {
        entry = target.lorebookEntryId
          ? await api.v1.lorebook.entry(target.lorebookEntryId)
          : null;
        if (entry) await api.v1.lorebook.removeEntry(entry.id);
      } catch (error) {
        return {
          kind: "DELETE",
          status: "rejected",
          name: target.name,
          reason: lorebookRefused(error),
        };
      }
      dispatch(entityDeleted({ entityId: target.id }));
      return {
        kind: "DELETE",
        status: "applied",
        name: target.name,
        undo: { op: "entityDeleted", entity: target, entry, threadIds },
      };
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
      const newName = cmd.newName.trim();
      if (!newName) {
        return {
          kind: "RENAME",
          status: "rejected",
          name: target.name,
          reason: REASON.noNewName,
        };
      }
      if (newName === target.name) {
        return {
          kind: "RENAME",
          status: "rejected",
          name: target.name,
          reason: REASON.sameName,
        };
      }
      const clash = findEntityByName(getState(), newName);
      if (clash && clash.id !== target.id) {
        return {
          kind: "RENAME",
          status: "rejected",
          name: target.name,
          reason: REASON.taken,
        };
      }
      if (target.lorebookEntryId) {
        try {
          await renameEntry(target.lorebookEntryId, target.name, newName);
        } catch (error) {
          return {
            kind: "RENAME",
            status: "rejected",
            name: target.name,
            reason: lorebookRefused(error),
          };
        }
      }
      dispatch(
        entityEdited({
          entityId: target.id,
          name: newName,
          summary: target.summary,
        }),
      );
      return {
        kind: "RENAME",
        status: "applied",
        name: cmd.oldName,
        newName,
        entityId: target.id,
        undo: {
          op: "name",
          entityId: target.id,
          before: target.name,
          wrote: newName,
        },
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
        const before: [string, string, string] = [
          existing.state,
          existing.latent,
          existing.wish,
        ];
        const wrote: [string, string, string] = [
          cmd.state || existing.state,
          cmd.latent || existing.latent,
          cmd.wish || existing.wish,
        ];
        dispatch(
          threadLedgerUpdated({
            threadId: existing.id,
            state: wrote[0],
            latent: wrote[1],
          }),
        );
        if (cmd.wish) {
          dispatch(threadWishSet({ threadId: existing.id, wish: cmd.wish }));
        }
        return {
          kind: "THREAD",
          status: "applied",
          name: existing.title,
          threadId: existing.id,
          undo: {
            op: "threadRewritten",
            threadId: existing.id,
            before,
            wrote,
          },
        };
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
          reason: `unknown member "${unknown.name}"; name only elements under [WORLD], spelled exactly`,
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
      return {
        kind: "THREAD",
        status: "applied",
        name: cmd.title,
        threadId: thread.id,
        undo: { op: "threadCreated", threadId: thread.id },
      };
    }

    case "LINK":
    case "DONE":
      return { kind: "UNKNOWN", status: "applied" };
  }
}

/** Walk a finished turn into ordered display segments, executing each command
 *  as it is encountered. DONE/LINK produce no segment. */
async function buildForgeSegments(
  text: string,
  chatId: string,
  messageId: string,
  getState: () => RootState,
  dispatch: AppDispatch,
): Promise<ForgeSegment[]> {
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
    const action = await executeForgeCommand(
      tok.command,
      chatId,
      messageId,
      getState,
      dispatch,
    );
    segments.push({
      kind: "action",
      action: { ...action, body: commandBody(tok.command) },
    });
  }
  flush();
  return segments;
}

/** Reverse one applied command. "skipped" means the thing changed since the
 *  command wrote it, so the newer value is left alone. */
export async function undoForgeAction(
  action: ForgeActionRecord,
  getState: () => RootState,
  dispatch: AppDispatch,
): Promise<"undone" | "skipped" | "failed"> {
  const undo = action.undo;
  if (!undo) return "skipped";
  try {
    const world = getState().world;
    switch (undo.op) {
      case "entityCreated": {
        const entity = world.entitiesById[undo.entityId];
        if (!entity) return "undone";
        // Read first: an entry the writer already deleted by hand needs no
        // removal, and a removal of it would fail the undo for good.
        if (undo.entryCreated && entity.lorebookEntryId) {
          const entry = await api.v1.lorebook.entry(entity.lorebookEntryId);
          if (entry) await api.v1.lorebook.removeEntry(entry.id);
        }
        dispatch(entityDeleted({ entityId: entity.id }));
        return "undone";
      }
      case "summary": {
        const entity = world.entitiesById[undo.entityId];
        if (!entity || entity.summary !== undo.wrote) return "skipped";
        dispatch(
          entitySummaryUpdated({ entityId: entity.id, summary: undo.before }),
        );
        return "undone";
      }
      case "name": {
        const entity = world.entitiesById[undo.entityId];
        if (!entity || entity.name !== undo.wrote) return "skipped";
        if (entity.lorebookEntryId) {
          await renameEntry(entity.lorebookEntryId, undo.wrote, undo.before);
        }
        dispatch(
          entityEdited({
            entityId: entity.id,
            name: undo.before,
            summary: entity.summary,
          }),
        );
        return "undone";
      }
      case "entityDeleted": {
        if (world.entitiesById[undo.entity.id]) return "undone";
        // The recreated entry has a new id; the entity must bind to it.
        const entryId = undo.entry
          ? await api.v1.lorebook.createEntry(undo.entry)
          : undefined;
        dispatch(
          entityRestored({
            entity: entryId
              ? { ...undo.entity, lorebookEntryId: entryId }
              : undo.entity,
            threadIds: undo.threadIds,
          }),
        );
        return "undone";
      }
      case "threadCreated": {
        const thread = world.threads.find((t) => t.id === undo.threadId);
        if (!thread) return "undone";
        dispatch(
          threadDeleted({
            threadId: thread.id,
            lorebookEntryId: thread.lorebookEntryId,
          }),
        );
        return "undone";
      }
      case "threadRewritten": {
        const thread = world.threads.find((t) => t.id === undo.threadId);
        if (
          !thread ||
          thread.status !== "open" ||
          thread.state !== undo.wrote[0] ||
          thread.latent !== undo.wrote[1] ||
          thread.wish !== undo.wrote[2]
        ) {
          return "skipped";
        }
        dispatch(
          threadLedgerUpdated({
            threadId: thread.id,
            state: undo.before[0],
            latent: undo.before[1],
          }),
        );
        dispatch(threadWishSet({ threadId: thread.id, wish: undo.before[2] }));
        return "undone";
      }
    }
  } catch (error) {
    api.v1.log("[scenario] undo failed:", error);
    return "failed";
  }
}

/** Reverse a Build reply's applied commands, last first. Commands already
 *  reversed by an earlier attempt are left alone. Marks the reply undone only
 *  when none failed; returns whether it did. */
export async function undoTurn(
  getState: () => RootState,
  dispatch: AppDispatch,
  chatId: string,
  messageId: string,
): Promise<boolean> {
  const message = getState()
    .chat.chats.find((c) => c.id === chatId)
    ?.messages.find((m) => m.id === messageId);
  const segments = message?.forgeSegments;
  if (!segments) return false;

  const next = [...segments];
  let failed = false;
  for (let i = next.length - 1; i >= 0; i--) {
    const seg = next[i];
    if (seg.kind !== "action") continue;
    const { action } = seg;
    if (action.status !== "applied" || !action.undo) continue;
    if (action.undoResult === "undone" || action.undoResult === "skipped") {
      continue;
    }
    const undoResult = await undoForgeAction(action, getState, dispatch);
    if (undoResult === "failed") failed = true;
    next[i] = { kind: "action", action: { ...action, undoResult } };
  }
  dispatch(forgeSegmentsSet({ chatId, id: messageId, segments: next }));
  if (!failed) dispatch(messageUndone({ chatId, id: messageId }));
  return !failed;
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
    if (
      !ctx.accumulatedText ||
      ctx.accumulatedText.trim() === SCENARIO_BUILD_PREFILL
    ) {
      // Cancelled or returned nothing before any tokens streamed (the kept
      // prefill is not a reply): drop the empty placeholder turn instead of
      // leaving a blank bubble behind.
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

    const segments = await buildForgeSegments(
      cleaned,
      ctx.target.chatId,
      ctx.target.messageId,
      ctx.getState,
      ctx.dispatch,
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
