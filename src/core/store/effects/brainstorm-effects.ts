import { Store, matchesAction } from "nai-store";
import { RootState, BrainstormMessage, AppDispatch, GenerationStrategy } from "../types";
import { currentChat, currentMessages } from "../slices/brainstorm";
import {
  uiBrainstormSubmitUserMessage,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  uiBrainstormRetryGeneration,
  uiBrainstormSummarize,
  messageAdded,
  messageUpdated,
  editingMessageIdSet,
  pruneHistory,
  requestQueued,
  requestCompleted,
  generationSubmitted,
  chatCreated,
  chatRenamed,
} from "../index";

// Pending title strategies keyed by their summary's requestId.
// Title generation is deferred until the summary (and all its continuations) finishes.
const pendingSummaryTitles = new Map<string, { strategy: GenerationStrategy; targetId: string }>();
import {
  buildBrainstormStrategy,
  buildSummarizeStrategy,
  buildBrainstormTitleStrategy,
} from "../../utils/context-builder";
import { IDS, STORAGE_KEYS } from "../../../ui/framework/ids";

export function registerBrainstormEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  // Intent: Brainstorm Edit Begin
  subscribeEffect(
    matchesAction(uiBrainstormMessageEditBegin),
    async (action) => {
      const { id: newId } = action.payload;
      const state = getState();
      const currentEditingId = state.brainstorm.editingMessageId;

      // 1. If currently editing another message, save it first
      if (currentEditingId && currentEditingId !== newId) {
        const prevInputId = IDS.BRAINSTORM.message(currentEditingId).INPUT;
        const content =
          (await api.v1.storyStorage.get(STORAGE_KEYS.brainstormDraft(prevInputId))) || "";
        dispatch(
          messageUpdated({ id: currentEditingId, content: String(content) }),
        );
      }

      // 2. Prepare the NEW message for editing
      const newMessage = currentMessages(state.brainstorm).find((m) => m.id === newId);
      if (newMessage) {
        const newInputId = IDS.BRAINSTORM.message(newId).INPUT;
        await api.v1.storyStorage.set(
          STORAGE_KEYS.brainstormDraft(newInputId),
          newMessage.content,
        );

        // 3. Set the editing ID
        dispatch(editingMessageIdSet(newId));
      }
    },
  );

  // Intent: Brainstorm Edit End (Save)
  subscribeEffect(
    (action) => action.type === uiBrainstormMessageEditEnd.type,
    async () => {
      const state = getState();
      const editingId = state.brainstorm.editingMessageId;

      if (editingId) {
        const inputId = IDS.BRAINSTORM.message(editingId).INPUT;
        const content =
          (await api.v1.storyStorage.get(STORAGE_KEYS.brainstormDraft(inputId))) || "";

        dispatch(messageUpdated({ id: editingId, content: String(content) }));
        dispatch(editingMessageIdSet(null));
      }
    },
  );

  // Intent: Brainstorm Submit
  subscribeEffect(
    (action) => action.type === uiBrainstormSubmitUserMessage.type,
    async (_action, { getState: getLatest }) => {
      const editingId = getLatest().brainstorm.editingMessageId;
      if (editingId) {
        const editInputId = IDS.BRAINSTORM.message(editingId).INPUT;
        const editContent =
          (await api.v1.storyStorage.get(STORAGE_KEYS.brainstormDraft(editInputId))) || "";
        dispatch(messageUpdated({ id: editingId, content: String(editContent) }));
        dispatch(editingMessageIdSet(null));
      }

      const storageKey = IDS.BRAINSTORM.INPUT;
      const content = (await api.v1.storyStorage.get(storageKey)) || "";

      // Clear Input
      await api.v1.storyStorage.set(storageKey, "");
      api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.INPUT, value: "" }]);

      let assistantId;

      if (content.trim()) {
        const userMsg: BrainstormMessage = {
          id: api.v1.uuid(),
          role: "user",
          content: String(content),
        };
        dispatch(messageAdded(userMsg));
      }

      const lastMessage = currentMessages(getLatest().brainstorm).at(-1);
      if (lastMessage?.role === "user") {
        assistantId = api.v1.uuid();
        const assistantMsg: BrainstormMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
        };
        dispatch(messageAdded(assistantMsg));
      } else if (lastMessage?.role == "assistant") {
        assistantId = lastMessage.id;
      } else {
        return;
      }

      const mode = currentChat(getLatest().brainstorm).mode || "cowriter";
      const strategy = buildBrainstormStrategy(getState, assistantId, mode);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "brainstorm",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Brainstorm Retry
  subscribeEffect(
    matchesAction(uiBrainstormRetryGeneration),
    async (action, { dispatch, getState: getLatest }) => {
      const { messageId } = action.payload;
      dispatch(pruneHistory(messageId));

      const state = getLatest();
      const lastMessage = currentMessages(state.brainstorm).at(-1);

      let assistantId: string;

      if (lastMessage && lastMessage.role === "assistant") {
        assistantId = api.v1.uuid();
      } else {
        assistantId = api.v1.uuid();
        dispatch(
          messageAdded({
            id: assistantId,
            role: "assistant",
            content: "",
          }),
        );
      }

      const mode = currentChat(getLatest().brainstorm).mode || "cowriter";
      const strategy = buildBrainstormStrategy(getState, assistantId, mode);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "brainstorm",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Brainstorm Summarize → create a new chat, generate summary there (original chat preserved)
  subscribeEffect(
    matchesAction(uiBrainstormSummarize),
    async (_action, { getState: getLatest }) => {
      const state = getLatest();
      const messages = currentMessages(state.brainstorm);
      if (messages.length === 0) {
        api.v1.ui.toast("Nothing to summarize", { type: "info" });
        return;
      }

      const chatHistory = [...messages];
      const sourceTitle = currentChat(state.brainstorm).title;

      // Create a new chat (original is preserved); chatCreated switches to it
      dispatch(chatCreated());
      const newIndex = getLatest().brainstorm.currentChatIndex;
      dispatch(chatRenamed({ index: newIndex, title: `Summary: ${sourceTitle}` }));

      const assistantId = api.v1.uuid();
      dispatch(messageAdded({ id: assistantId, role: "assistant", content: "" }));

      const strategy = buildSummarizeStrategy(assistantId, chatHistory);
      dispatch(requestQueued({ id: strategy.requestId, type: "brainstorm", targetId: assistantId }));
      dispatch(generationSubmitted(strategy));

      // Register title to run after summary (and all its continuations) finish.
      const titleStrategy = buildBrainstormTitleStrategy(newIndex, chatHistory);
      pendingSummaryTitles.set(strategy.requestId, {
        strategy: titleStrategy,
        targetId: String(newIndex),
      });
    },
  );

  // Intent: Fire pending title generation once the summary request fully completes.
  subscribeEffect(
    matchesAction(requestCompleted),
    (action) => {
      const { requestId } = action.payload;
      const pending = pendingSummaryTitles.get(requestId);
      if (!pending) return;

      pendingSummaryTitles.delete(requestId);
      dispatch(requestQueued({
        id: pending.strategy.requestId,
        type: "brainstormChatTitle",
        targetId: pending.targetId,
      }));
      dispatch(generationSubmitted(pending.strategy));
    },
  );
}
