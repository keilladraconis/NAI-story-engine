import { Store, matchesAction } from "nai-store";
import type { RootState, AppDispatch } from "../types";
import {
  uiChatSubmitUserMessage,
  uiChatRetryGeneration,
  uiChatSummarizeRequested,
  uiChatRefineRequested,
  uiChatRefineGenerateRequested,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
  uiCancelRequest,
  generationSubmitted,
} from "../slices/ui";
import { requestQueued } from "../slices/runtime";
import {
  chatCreated,
  chatSwitched,
  chatDeleted,
  messageAdded,
  messageRemoved,
  messagesPrunedAfter,
} from "../slices/chat";
import { getChatTypeSpec } from "../../chat-types";
import type { Chat } from "../../chat-types/types";
import { buildChatStrategy } from "../../utils/chat-strategy";
import { buildModelParams } from "../../utils/config";
import { flushActiveEditor } from "../../../ui/framework/editable-draft";
import { IDS } from "../../../ui/framework/ids";

function findChat(state: RootState, id: string): Chat | undefined {
  return state.chat.chats.find((c) => c.id === id);
}

async function submitChatGeneration(
  getState: () => RootState,
  dispatch: AppDispatch,
  chat: Chat,
  assistantId: string,
): Promise<void> {
  let strategy;
  try {
    strategy = await buildChatStrategy(getState, chat, assistantId);
  } catch (error) {
    api.v1.log(
      `[chat] failed to build strategy for ${chat.id}:`,
      error as Error,
    );
    api.v1.ui.toast(`Could not start refine: ${(error as Error).message}`, {
      type: "error",
    });
    dispatch(messageRemoved({ chatId: chat.id, id: assistantId }));
    return;
  }
  const params = await buildModelParams({ max_tokens: 512, temperature: 1.0 });
  dispatch(
    requestQueued({
      id: strategy.requestId,
      type: chat.type === "refine" ? "chatRefine" : "chat",
      targetId: assistantId,
    }),
  );
  dispatch(generationSubmitted({ ...strategy, params }));
}

export function registerChatEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // Intent: Chat Submit (user message → assistant placeholder → generate)
  subscribeEffect(
    matchesAction(uiChatSubmitUserMessage),
    async (action, { getState: latest }) => {
      await flushActiveEditor();
      const { chatId } = action.payload;
      const inputKey = IDS.BRAINSTORM.INPUT;
      const text = ((await api.v1.storyStorage.get(inputKey)) as string) || "";
      await api.v1.storyStorage.set(inputKey, "");
      api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.INPUT, value: "" }]);

      const chat = findChat(latest(), chatId);
      if (!chat) return;
      const spec = getChatTypeSpec(chat.type);
      if (spec.handleSend?.(chat, text, { getState: latest, dispatch })) {
        return;
      }

      if (text.trim()) {
        dispatch(
          messageAdded({
            chatId,
            message: { id: api.v1.uuid(), role: "user", content: text },
          }),
        );
      }
      // Re-read after the dispatch: the user message just added is not in the
      // `chat` snapshot captured above. Computing `last` (and building the
      // generation strategy) from the stale snapshot is what dropped the first
      // send on the floor and forced a second, empty send to generate.
      const refreshed = findChat(latest(), chatId);
      const last = refreshed?.messages.at(-1);
      if (!refreshed || !last) return;
      if (last.role === "user") {
        const assistantId = api.v1.uuid();
        dispatch(
          messageAdded({
            chatId,
            message: { id: assistantId, role: "assistant", content: "" },
          }),
        );
        await submitChatGeneration(latest, dispatch, refreshed, assistantId);
        return;
      }
      // Empty send on an assistant tail = manual continuation: extend the
      // existing message in place instead of opening a new turn.
      if (last.role === "assistant" && !text.trim()) {
        await submitChatGeneration(latest, dispatch, refreshed, last.id);
      }
    },
  );

  // Intent: Chat Retry (prune after target, fresh assistant placeholder, generate)
  subscribeEffect(
    matchesAction(uiChatRetryGeneration),
    async (action, { getState: latest }) => {
      const { chatId, messageId } = action.payload;
      dispatch(messagesPrunedAfter({ chatId, id: messageId }));
      const chat = findChat(latest(), chatId);
      if (!chat) return;
      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId,
          message: { id: assistantId, role: "assistant", content: "" },
        }),
      );
      await submitChatGeneration(latest, dispatch, chat, assistantId);
    },
  );

  // Intent: Chat Summarize → create new summary chat, generate summary
  subscribeEffect(
    matchesAction(uiChatSummarizeRequested),
    async (action, { getState: latest }) => {
      const spec = getChatTypeSpec("summary");
      const init = spec.initialize(action.payload.seed, {
        getState: latest,
        dispatch,
      });
      const newChat: Chat = {
        id: api.v1.uuid(),
        type: "summary",
        title: init.title,
        messages: init.initialMessages,
        seed: action.payload.seed as Chat["seed"],
      };
      dispatch(chatCreated({ chat: newChat }));
      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId: newChat.id,
          message: { id: assistantId, role: "assistant", content: "" },
        }),
      );
      await submitChatGeneration(latest, dispatch, newChat, assistantId);
    },
  );

  // Intent: Refine Open — create (or reuse) a refine chat in chats[] for a field
  subscribeEffect(
    matchesAction(uiChatRefineRequested),
    async (action, { getState: latest }) => {
      const { fieldId, sourceText, entryId } = action.payload;
      if (!sourceText.trim()) {
        api.v1.ui.toast("Nothing to refine — field is empty.", {
          type: "info",
        });
        return;
      }
      // Reuse an open refine for this field (it may be backgrounded) rather than
      // stacking duplicates; otherwise open a fresh one. chatCreated foregrounds
      // it (and plugin.ts switches to the Chat tab for refine chats).
      const existing = latest().chat.chats.find(
        (c) => c.type === "refine" && c.refineTarget?.fieldId === fieldId,
      );
      if (existing) {
        dispatch(chatSwitched({ id: existing.id }));
        return;
      }
      const spec = getChatTypeSpec("refine");
      const seed = {
        kind: "fromField" as const,
        sourceFieldId: fieldId,
        sourceText,
      };
      const init = spec.initialize(seed, { getState: latest, dispatch });
      const refine: Chat = {
        id: api.v1.uuid(),
        type: "refine",
        title: init.title,
        messages: init.initialMessages,
        seed,
        refineTarget: { fieldId, originalText: sourceText, entryId },
      };
      dispatch(chatCreated({ chat: refine }));
    },
  );

  // Intent: Refine Generate — add a fresh assistant candidate placeholder and
  // run a refine generation. The strategy decides rewrite (seeded snapshot
  // present) vs fresh field generation (snapshot deleted).
  subscribeEffect(
    matchesAction(uiChatRefineGenerateRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const rt = latest().runtime;
      const pending =
        rt.activeRequest?.type === "chatRefine" ||
        rt.queue.some((r) => r.type === "chatRefine");
      if (pending) return;
      const chat = findChat(latest(), chatId);
      if (!chat) return;
      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId,
          message: { id: assistantId, role: "assistant", content: "" },
        }),
      );
      const refreshed = findChat(latest(), chatId);
      if (!refreshed) return;
      await submitChatGeneration(latest, dispatch, refreshed, assistantId);
    },
  );

  // Intent: Refine Discard — cancel any in-flight refine request, delete the chat
  subscribeEffect(
    matchesAction(uiChatRefineDiscarded),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const refine = findChat(latest(), chatId);
      if (!refine || refine.type !== "refine") return;
      const inflightId = latest().runtime.activeRequest?.id;
      if (inflightId && inflightId.startsWith(`refine-${refine.id}`)) {
        dispatch(uiCancelRequest({ requestId: inflightId }));
      }
      dispatch(chatDeleted({ id: chatId }));
    },
  );

  // Intent: Refine Commit — apply the candidate to the field, then delete the chat
  subscribeEffect(
    matchesAction(uiChatRefineCommitted),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const refine = findChat(latest(), chatId);
      if (!refine?.refineTarget) return;
      const hasCandidate = refine.messages.some(
        (m) => m.role === "assistant" && m.content.trim().length > 0,
      );
      if (!hasCandidate) return;
      const spec = getChatTypeSpec("refine");
      spec.onCommit?.(refine, { getState: latest, dispatch });
      dispatch(chatDeleted({ id: chatId }));
    },
  );
}
