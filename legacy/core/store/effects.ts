import { Effect } from "./store";
import { RootState, BrainstormMessage } from "./types";
import { GenX } from "../../../lib/gen-x";
import {
  brainstormAddMessage,
  brainstormUpdateMessage,
  uiBrainstormSaveMessageEdit,
  uiBrainstormEditStarted,
  uiBrainstormEditEnded,
  brainstormHistoryPruned,
  generationStarted,
  generationCompleted,
  generationFailed,
  genxRequestGeneration,
  storyLoaded,
  fieldUpdated,
  dulfsItemUpdated,
} from "./actions";
import { buildBrainstormStrategy } from "./utils/context-builder";
import { initialStoryState } from "./reducers/storyReducer";
import { FieldID, DulfsFieldID } from "../../config/field-definitions";
import { IDS } from "../../ui/framework/ids";

export function registerEffects(
  runner: { register: (effect: Effect<RootState>) => void },
  genX: GenX,
) {
  runner.register(createBrainstormSubmitEffect(genX));
  runner.register(createBrainstormRetryEffect(genX));
  runner.register(createGenXGenerationEffect(genX));
  runner.register(createCancellationEffect(genX)); // Add this
  runner.register(createUserPresenceEffect(genX));
  runner.register(createStoryLoadEffect());
  runner.register(createStorySaveEffect());
  runner.register(createBrainstormEditEffects());
}

// Intent: Cancellation
const createCancellationEffect =
  (genX: GenX): Effect<RootState> =>
  (action) => {
    if (action.type === "ui/requestCancellation") {
      genX.cancelCurrent();
    }
  };

// Intent: User Presence Confirmed
const createUserPresenceEffect =
  (genX: GenX): Effect<RootState> =>
  (action) => {
    if (action.type === "ui/userPresenceConfirmed") {
      genX.userInteraction();
    }
  };

// Intent: Brainstorm Retry
const createBrainstormRetryEffect =
  (genX: GenX): Effect<RootState> =>
  async (action, { dispatch, getState }) => {
    if (action.type !== "ui/brainstormRetry") return;

    // Cancel any ongoing generation to prevent "zombie" streams from flooding the store
    // and causing UI lag/crashes when retrying rapidly.
    genX.cancelCurrent();

    const { messageId } = action.payload;

    // 1. Prune history (Domain)
    // This synchronously updates the state in the reducer
    dispatch(brainstormHistoryPruned({ messageId }));

    // 2. Check state to decide if we should regenerate
    const state = getState();
    const field = state.story.fields[FieldID.Brainstorm];
    const messages = (field?.data?.messages || []) as BrainstormMessage[];
    const lastMsg = messages[messages.length - 1];

    // If the last message is now a user message, we assume the user wants the assistant to try again
    if (lastMsg && lastMsg.role === "user") {
      const assistantId = api.v1.uuid();
      dispatch(
        brainstormAddMessage({
          message: { id: assistantId, role: "assistant", content: "" },
        }),
      );

      // Generate
      const strategy = await buildBrainstormStrategy(state.story, assistantId);

      dispatch(genxRequestGeneration(strategy));
    }
  };

// Intent: Brainstorm Edit Workflow
const createBrainstormEditEffects =
  (): Effect<RootState> =>
  async (action, { dispatch, getState }) => {
    // Handle Start Edit
    if (action.type === "ui/brainstormEditMessage") {
      let { messageId, content } = action.payload;
      const state = getState();

      // If content is not provided, look it up from the store
      if (content === undefined) {
        const field = state.story.fields[FieldID.Brainstorm];
        const messages = (field?.data?.messages || []) as BrainstormMessage[];
        const msg = messages.find((m) => m.id === messageId);
        content = msg?.content || "";
      }

      const currentEditId = state.ui.brainstormEditingMessageId;

      // 1. If we are already editing another message, save it first
      if (currentEditId && currentEditId !== messageId) {
        dispatch(uiBrainstormSaveMessageEdit({ messageId: currentEditId }));
      }

      // 2. Initialize the storage for the new draft
      const storageKey = IDS.BRAINSTORM.message(messageId).TEXT_INPUT;
      await api.v1.storyStorage.set(storageKey, content);

      // 3. Update UI state
      dispatch(uiBrainstormEditStarted({ messageId }));
      return;
    }

    // Handle Save Edit
    if (action.type === "ui/brainstormSaveMessageEdit") {
      const { messageId } = action.payload;
      const storageKey = IDS.BRAINSTORM.message(messageId).TEXT_INPUT;

      // 1. Retrieve drafted content
      const draftContent = await api.v1.storyStorage.get(storageKey);

      // 2. Clear storage (cleanup)
      await api.v1.storyStorage.set(storageKey, "");

      // 3. Update Domain State (if content exists)
      if (typeof draftContent === "string") {
        dispatch(brainstormUpdateMessage({ messageId, content: draftContent }));
      }

      // 4. Update UI State
      dispatch(uiBrainstormEditEnded({ messageId }));
      return;
    }
  };

// Intent: Save Story
const createStorySaveEffect =
  (): Effect<RootState> =>
  async (action, { getState }) => {
    // Listen to any domain change in story, brainstorm, or dulfs
    if (
      (action.type.startsWith("story/") ||
        action.type.startsWith("brainstorm/") ||
        action.type.startsWith("dulfs/")) &&
      action.type !== "story/loadRequested"
    ) {
      try {
        const state = getState();
        // Fire and forget save
        api.v1.storyStorage.set("kse-story-data", state.story);
      } catch (e) {
        api.v1.log("Error saving story data:", e);
      }
    }
  };

// Intent: Load Story
const createStoryLoadEffect =
  (): Effect<RootState> =>
  async (action, { dispatch }) => {
    if (action.type !== "story/loadRequested") return;

    try {
      const data = await api.v1.storyStorage.getOrDefault(
        "kse-story-data",
        initialStoryState,
      );
      dispatch(storyLoaded({ story: data }));
      api.v1.log("Story data loaded via effect.");
    } catch (e) {
      api.v1.log("Error loading story data:", e);
    }
  };

// Intent: User Submits Message (Logic)
const createBrainstormSubmitEffect =
  (_genX: GenX): Effect<RootState> =>
  async (action, { dispatch, getState }) => {
    if (action.type !== "ui/brainstormSubmitUserMessage") return;

    const content = (await api.v1.storyStorage.get(IDS.BRAINSTORM.INPUT)) || "";
    await api.v1.storyStorage.set(IDS.BRAINSTORM.INPUT, "");

    let assistantId;
    // If the user sent a message, we add the message and an empty assistant placeholder.
    // If not, then we find the last assistant message's id and use it as the target
    if (content && content.trim()) {
      const userMsg: BrainstormMessage = {
        id: api.v1.uuid(),
        role: "user",
        content,
      };
      dispatch(brainstormAddMessage({ message: userMsg }));

      assistantId = api.v1.uuid();
      const assistantMsg: BrainstormMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };
      dispatch(brainstormAddMessage({ message: assistantMsg }));
    }

    const state = getState();

    // Use the Strategy Builder to construct the full context
    const strategy = await buildBrainstormStrategy(state.story, assistantId);

    dispatch(genxRequestGeneration(strategy));
  };

// Service: GenX Generation
const createGenXGenerationEffect =
  (genX: GenX): Effect<RootState> =>
  async (action, { dispatch, getState }) => {
    if (action.type !== "genx/requestGeneration") return;

    const { requestId, messages, params, target, prefixBehavior } =
      action.payload;

    dispatch(generationStarted({ requestId }));

    let accumulatedText = "";

    // If we are keeping the prefix (e.g. resumption), initialize accumulatedText with existing content
    if (prefixBehavior === "keep") {
      const state = getState();
      if (target.type === "brainstorm") {
        const field = state.story.fields[FieldID.Brainstorm];
        const message = (field?.data?.messages || []).find(
          (m: BrainstormMessage) => m.id === target.messageId,
        );
        if (message) {
          accumulatedText = message.content;
        }
      } else if (target.type === "field") {
        if (target.fieldId.includes(":")) {
          const [fieldId, itemId] = target.fieldId.split(":");
          const list = state.story.dulfs[fieldId as DulfsFieldID] || [];
          const item = list.find((i) => i.id === itemId);
          if (item) {
            accumulatedText = item.content;
          }
        } else {
          const field = state.story.fields[target.fieldId];
          if (field) {
            accumulatedText = field.content;
          }
        }
      }
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
              // Optimization: Stream directly to UI to avoid Redux overhead during high-frequency updates
              const uiId = IDS.BRAINSTORM.message(
                target.messageId,
              ).TEXT_DISPLAY;
              api.v1.ui.updateParts([{ id: uiId, text: accumulatedText }]);
            } else if (target.type === "field") {
              // Optimization: Stream directly to field text display
              const uiId = target.fieldId.includes(":")
                ? `text-display-lore-${target.fieldId.split(":")[1]}`
                : `text-display-${target.fieldId}`;

              if (uiId) {
                // Process content for NovelAI's markdown renderer (same as createToggleableContent)
                const processed = accumulatedText
                  .replace(/\n/g, "  \n")
                  .replace(/\[/g, "\\[");
                api.v1.ui.updateParts([{ id: uiId, text: processed }]);
              }
            }
          }
        },
        "background",
        await api.v1.createCancellationSignal(),
      );

      dispatch(generationCompleted({ requestId }));
    } catch (error: any) {
      api.v1.log("Generation failed:", error);
      dispatch(
        generationFailed({ requestId, error: error.message || String(error) }),
      );
    } finally {
      // Always sync whatever we managed to generate to the store
      // This prevents "ghost text" where the UI shows streamed content but the store is empty
      if (target.type === "brainstorm" && accumulatedText) {
        dispatch(
          brainstormUpdateMessage({
            messageId: target.messageId,
            content: accumulatedText,
          }),
        );
      } else if (target.type === "field" && accumulatedText) {
        if (target.fieldId.includes(":")) {
          const [fieldId, itemId] = target.fieldId.split(":");
          dispatch(
            dulfsItemUpdated({
              fieldId: fieldId as DulfsFieldID,
              itemId,
              updates: { content: accumulatedText },
            }),
          );
        } else {
          dispatch(
            fieldUpdated({ fieldId: target.fieldId, content: accumulatedText }),
          );
        }
      }
    }
  };
