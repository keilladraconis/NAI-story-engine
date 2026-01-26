import { Store } from "../../../lib/nai-store";
import { RootState, BrainstormMessage } from "./types";
import { GenX } from "../../../lib/gen-x";
import {
  uiBrainstormSubmitUserMessage,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  messageAdded,
  messageUpdated,
  uiRequestGeneration,
  generationStarted,
  generationCompleted,
  generationFailed,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  setBrainstormEditingMessageId,
  uiBrainstormRetryGeneration,
  pruneHistory,
} from "./index";
import { buildBrainstormStrategy } from "../utils/context-builder";
import { IDS } from "../../ui/framework/ids";

export function registerEffects(store: Store<RootState>, genX: GenX) {
  const { subscribeEffect } = store;

  // Intent: Brainstorm Edit Begin
  subscribeEffect(
    (action) => action.type === uiBrainstormMessageEditBegin({} as any).type,
    async (action, { dispatch, getState }) => {
      const { id: newId } = action.payload;
      const state = getState();
      const currentEditingId = state.ui.brainstorm.editingMessageId;

      // 1. If currently editing another message, save it first
      if (currentEditingId && currentEditingId !== newId) {
        const prevInputId = IDS.BRAINSTORM.message(currentEditingId).INPUT;
        const content = (await api.v1.storyStorage.get(`draft-${prevInputId}`)) || "";
        dispatch(messageUpdated({ id: currentEditingId, content: String(content) }));
      }

      // 2. Prepare the NEW message for editing
      const newMessage = state.brainstorm.messages.find((m) => m.id === newId);
      if (newMessage) {
        // Seed the storage so the input shows the current content
        const newInputId = IDS.BRAINSTORM.message(newId).INPUT;
        await api.v1.storyStorage.set(`draft-${newInputId}`, newMessage.content);
        
        // 3. Set the editing ID
        dispatch(setBrainstormEditingMessageId(newId));
      }
    }
  );

  // Intent: Brainstorm Edit End (Save)
  subscribeEffect(
    (action) => action.type === uiBrainstormMessageEditEnd().type,
    async (_action, { dispatch, getState }) => {
      const state = getState();
      const editingId = state.ui.brainstorm.editingMessageId;

      if (editingId) {
        const inputId = IDS.BRAINSTORM.message(editingId).INPUT;
        const content = (await api.v1.storyStorage.get(`draft-${inputId}`)) || "";
        
        dispatch(messageUpdated({ id: editingId, content: String(content) }));
        dispatch(setBrainstormEditingMessageId(null));
      }
    }
  );

  // Intent: Brainstorm Submit
  subscribeEffect(
    (action) => action.type === uiBrainstormSubmitUserMessage().type,
    async (_action, { dispatch, getState }) => {
      const storageKey = IDS.BRAINSTORM.INPUT;
      const content = (await api.v1.storyStorage.get(storageKey)) || "";
      
      if (!content || !String(content).trim()) return;

      // Clear Input
      await api.v1.storyStorage.set(storageKey, "");
      api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.INPUT, value: "" }]); // Reset UI

      // Add User Message
      const userMsg: BrainstormMessage = {
        id: api.v1.uuid(),
        role: "user",
        content: String(content),
      };
      dispatch(messageAdded(userMsg));

      // Add Assistant Placeholder
      const assistantId = api.v1.uuid();
      const assistantMsg: BrainstormMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };
      dispatch(messageAdded(assistantMsg));

      // Request Generation
      const state = getState();
      const strategy = await buildBrainstormStrategy(state, assistantId);
      dispatch(uiRequestGeneration(strategy));
    }
  );

  // Intent: Brainstorm Retry
  subscribeEffect(
    (action) => action.type === uiBrainstormRetryGeneration({} as any).type,
    async (action, { dispatch, getState }) => {
      const { messageId } = action.payload;
      
      // Prune history (keep up to user, remove assistant response if target is assistant)
      // Or if target is user, keep up to that user message.
      // The logic inside pruneHistory handles role-based pruning.
      dispatch(pruneHistory(messageId));

      // After pruning, we need to generate a response.
      // 1. If we retried a User message, we pruned everything after it. We need an Assistant response.
      // 2. If we retried an Assistant message, we pruned it. We need a new Assistant response.
      
      const state = getState(); // Get updated state
      const lastMessage = state.brainstorm.messages[state.brainstorm.messages.length - 1];

      let assistantId: string;

      if (lastMessage && lastMessage.role === "assistant") {
          // Should not happen if we just pruned to generate?
          // If we pruned an assistant message, the last one should be User.
          // If we pruned a user message, the last one is that User message.
          // So in both cases we need a new Assistant placeholder.
          // Wait, if we are "retrying" a user message, do we want to edit it? No, that's Edit.
          // Retry on User message usually means "Regenerate the response to this message".
          // Retry on Assistant message means "Regenerate this response".
          assistantId = api.v1.uuid();
      } else {
          // Last is user (or system), add assistant placeholder
          assistantId = api.v1.uuid();
          dispatch(messageAdded({
              id: assistantId,
              role: "assistant",
              content: ""
          }));
      }

      const strategy = await buildBrainstormStrategy(state, assistantId);
      dispatch(uiRequestGeneration(strategy));
    }
  );

  // Intent: GenX Generation
  subscribeEffect(
    (action) => action.type === uiRequestGeneration({} as any).type, // Match type only
    async (action, { dispatch, getState }) => {
      const strategy = action.payload; // Type: GenerationStrategy
      const { requestId, messages, params, target, prefixBehavior } = strategy;

      dispatch(generationStarted({ requestId }));

      let accumulatedText = "";

      // Handle Prefix (Resumption)
      if (prefixBehavior === "keep") {
        const state = getState();
        if (target.type === "brainstorm") {
          const message = state.brainstorm.messages.find(
            (m) => m.id === target.messageId
          );
          if (message) accumulatedText = message.content;
        } 
        // Add other targets (field/list) if/when supported
      }

      try {
        await genX.generate(
          messages,
          params,
          (choices, _final) => {
            const text = choices[0]?.text || "";
            if (text) {
              accumulatedText += text;

              if (target.type === "brainstorm") {
                // Stream to UI
                const uiId = IDS.BRAINSTORM.message(target.messageId).TEXT;
                api.v1.ui.updateParts([{ id: uiId, text: accumulatedText }]);
              }
              // Add other targets
            }
          },
          "background",
          await api.v1.createCancellationSignal()
        );

        dispatch(generationCompleted({ requestId }));
      } catch (error: any) {
        api.v1.log("Generation failed:", error);
        dispatch(
          generationFailed({ requestId, error: error.message || String(error) })
        );
      } finally {
        // Sync to Store
        if (target.type === "brainstorm" && accumulatedText) {
          dispatch(
            messageUpdated({
              id: target.messageId,
              content: accumulatedText,
            })
          );
        }
      }
    }
  );

  // Intent: Cancellation
  subscribeEffect(
    (action) => action.type === uiRequestCancellation().type,
    () => {
      genX.cancelCurrent();
    }
  );

  // Intent: User Presence
  subscribeEffect(
    (action) => action.type === uiUserPresenceConfirmed().type,
    () => {
      genX.userInteraction();
    }
  );
  
  // Save Story Effect (Autosave)
  subscribeEffect(
      (action) => action.type.startsWith("story/") || action.type.startsWith("brainstorm/"),
      async (action, { getState }) => {
          if (action.type === "story/loadRequested") return; // Don't save on load trigger
          try {
             // We save the 'story' slice. 
             // Do we save 'brainstorm' slice?
             // Legacy saved the whole story state which included brainstorm messages.
             // Here they are separate. We should persist both.
             // We can use 'kse-story-data' for story and 'kse-brainstorm-data' for brainstorm?
             // Or combine them into one object for storage.
             const state = getState();
             const persistData = {
                 story: state.story,
                 brainstorm: state.brainstorm
             };
             // Debouncing? NAIStore doesn't debounce.
             // Ideally we debounce. For now, fire and forget (NovelAI storage handles some key-based debounce? No)
             // We'll just save. It's local storage usually.
             api.v1.storyStorage.set("kse-persist", persistData);
          } catch(e) { /* ignore */ }
      }
  );
}
