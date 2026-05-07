import { Store, matchesAction } from "nai-store";
import type { RootState, AppDispatch } from "../types";
import {
  uiChatSubmitUserMessage,
  uiChatRetryGeneration,
  uiChatSummarizeRequested,
  uiChatRefineRequested,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
  uiCancelRequest,
  generationSubmitted,
} from "../slices/ui";
import { requestQueued } from "../slices/runtime";
import {
  chatCreated,
  messageAdded,
  messagesPrunedAfter,
  refineChatOpened,
  refineChatCleared,
} from "../slices/chat";
import { getChatTypeSpec } from "../../chat-types";
import type { Chat } from "../../chat-types/types";
import { buildChatStrategy } from "../../utils/chat-strategy";
import { buildModelParams } from "../../utils/config";
import { flushActiveEditor } from "../../../ui/framework/editable-draft";
import { IDS } from "../../../ui/framework/ids";

function findChat(state: RootState, id: string): Chat | undefined {
  if (state.chat.refineChat?.id === id) return state.chat.refineChat;
  return state.chat.chats.find((c) => c.id === id);
}

async function submitChatGeneration(
  getState: () => RootState,
  dispatch: AppDispatch,
  chat: Chat,
  assistantId: string,
): Promise<void> {
  const strategy = buildChatStrategy(getState, chat, assistantId);
  const params = await buildModelParams({ max_tokens: 1024, temperature: 1.0 });
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

      if (text.trim()) {
        dispatch(
          messageAdded({
            chatId,
            message: { id: api.v1.uuid(), role: "user", content: text },
          }),
        );
      }
      const chat = findChat(latest(), chatId);
      if (!chat || chat.messages.at(-1)?.role !== "user") return;
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

  // Intent: Refine Open — single-slot; toast on empty source or collision
  subscribeEffect(
    matchesAction(uiChatRefineRequested),
    async (action, { getState: latest }) => {
      const { fieldId, sourceText, entryId } = action.payload;
      if (!sourceText.trim()) {
        api.v1.ui.toast("Nothing to refine — field is empty.", { type: "info" });
        return;
      }
      if (latest().chat.refineChat) {
        api.v1.ui.toast("Finish or discard the current refine first.", {
          type: "warning",
        });
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
      dispatch(refineChatOpened({ chat: refine }));
    },
  );

  // Intent: Refine Discard — cancel any in-flight refine request, clear slot
  subscribeEffect(
    matchesAction(uiChatRefineDiscarded),
    async (_action, { getState: latest }) => {
      const refine = latest().chat.refineChat;
      if (!refine) return;
      const inflightId = latest().runtime.activeRequest?.id;
      if (inflightId && inflightId.startsWith(`refine-${refine.id}`)) {
        dispatch(uiCancelRequest({ requestId: inflightId }));
      }
      dispatch(refineChatCleared());
    },
  );

  // Intent: Refine Commit — let spec apply candidate to field, then clear slot
  subscribeEffect(
    matchesAction(uiChatRefineCommitted),
    async (_action, { getState: latest }) => {
      const refine = latest().chat.refineChat;
      if (!refine?.refineTarget) return;
      const hasCandidate = refine.messages.some(
        (m) => m.role === "assistant" && m.content.trim().length > 0,
      );
      if (!hasCandidate) return;
      const spec = getChatTypeSpec("refine");
      spec.onCommit?.(refine, { getState: latest, dispatch });
      dispatch(refineChatCleared());
    },
  );
}
