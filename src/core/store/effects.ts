import { Store } from "../../../lib/nai-store";
import { RootState, BrainstormMessage } from "./types";
import { GenX } from "../../../lib/gen-x";
import {
  uiBrainstormSubmitUserMessage,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  messageAdded,
  messageUpdated,
  intentRequestGeneration,
  generationStarted,
  generationCompleted,
  generationFailed,
  historyPruned,
} from "./index";
import { buildBrainstormStrategy } from "../utils/context-builder";
import { IDS } from "../../ui/framework/ids";
import { FieldID, DulfsFieldID } from "../../config/field-definitions";
import { dulfsItemUpdated, fieldUpdated } from "./slices/story";

type Effect = Parameters<Store<RootState>["subscribeEffect"]>[1];

export function registerEffects(store: Store<RootState>, genX: GenX) {
  const { subscribeEffect } = store;

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
      dispatch(intentRequestGeneration(strategy));
    }
  );

  // Intent: GenX Generation
  subscribeEffect(
    (action) => action.type === intentRequestGeneration({} as any).type, // Match type only
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
