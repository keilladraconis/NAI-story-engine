import { Effect } from "./store";
import { RootState, BrainstormMessage } from "./types";
import { GenX } from "../../../lib/gen-x";
import {
  brainstormAddMessage,
  brainstormAppendToMessage,
  brainstormUpdateMessage,
  brainstormSaveMessageEdit,
  uiBrainstormEditStarted,
  uiBrainstormEditEnded,
  generationStarted,
  generationCompleted,
  generationFailed,
  genxRequestGeneration,
  storyLoaded,
} from "./actions";
import { buildBrainstormStrategy } from "./utils/context-builder";
import { initialStoryState } from "./reducers/storyReducer";

export function registerEffects(runner: { register: (effect: Effect<RootState>) => void }, genX: GenX) {
  runner.register(createBrainstormSubmitEffect(genX));
  runner.register(createGenXGenerationEffect(genX));
  runner.register(createStoryLoadEffect());
  runner.register(createStorySaveEffect());
  runner.register(createBrainstormEditEffects());
}

// Intent: Brainstorm Edit Workflow
const createBrainstormEditEffects = (): Effect<RootState> => async (action, { dispatch, getState }) => {
  // Handle Start Edit
  if (action.type === "story/brainstormEditMessage") {
    const { messageId, content } = action.payload;
    const state = getState();
    const currentEditId = state.ui.brainstormEditingMessageId;

    // 1. If we are already editing another message, save it first
    if (currentEditId && currentEditId !== messageId) {
      // Dispatch the save intent synchronously (well, trigger it)
      // Since effects are async, we can't await the *processing* of the other effect easily here
      // unless we manually call the logic. 
      // But we can dispatch the action and trust the order of operations if we await the storage call.
      // Actually, we should probably manually run the save logic here to ensure sequentiality
      // OR just dispatch and assume the storage write for the *new* one won't race the read of the *old* one.
      // Let's dispatch the save action.
      dispatch(brainstormSaveMessageEdit({ messageId: currentEditId }));
    }

    // 2. Initialize the storage for the new draft
    const storageKey = `brainstorm-edit-${messageId}`;
    await api.v1.storyStorage.set(storageKey, content);

    // 3. Update UI state
    dispatch(uiBrainstormEditStarted({ messageId }));
    return;
  }

  // Handle Save Edit
  if (action.type === "story/brainstormSaveMessageEdit") {
    const { messageId } = action.payload;
    const storageKey = `brainstorm-edit-${messageId}`;

    // 1. Retrieve drafted content
    const draftContent = await api.v1.storyStorage.get(storageKey);
    
    // 2. Clear storage (cleanup)
    await api.v1.storyStorage.set(storageKey, "");

    // 3. Update Domain State (if content exists)
    // If draftContent is null/undefined, it means no change or error, fallback to empty string?
    // Or maybe we should keep original? Ideally draftContent should be valid string.
    if (typeof draftContent === "string") {
        dispatch(brainstormUpdateMessage({ messageId, content: draftContent }));
    }

    // 4. Update UI State
    dispatch(uiBrainstormEditEnded({ messageId }));
    return;
  }
};

// Intent: Save Story
const createStorySaveEffect = (): Effect<RootState> => async (action, { getState }) => {
  if (action.type.startsWith("story/") && action.type !== "story/loadRequested") {
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
const createStoryLoadEffect = (): Effect<RootState> => async (action, { dispatch }) => {
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

// Intent: User Submits Message
const createBrainstormSubmitEffect = (_genX: GenX): Effect<RootState> => async (action, { dispatch, getState }) => {
  if (action.type !== "ui/brainstormSubmitUserMessage") return;

  const { content } = action.payload;
  
  // 1. Clear storage (side effect cleanup)
  await api.v1.storyStorage.set("brainstorm-input", "");

  // 2. Add User Message
  const userMsg: BrainstormMessage = {
    id: api.v1.uuid(),
    role: "user",
    content
  };
  dispatch(brainstormAddMessage({ message: userMsg }));

  // 3. Add Assistant Placeholder
  const assistantId = api.v1.uuid();
  const assistantMsg: BrainstormMessage = {
    id: assistantId,
    role: "assistant",
    content: ""
  };
  dispatch(brainstormAddMessage({ message: assistantMsg }));

  // 4. Request Generation
  const state = getState();
  
  // Use the Strategy Builder to construct the full context
  // We mock a request object since the effect is creating the request
  const strategy = await buildBrainstormStrategy(state.story, {
    id: api.v1.uuid(),
    type: "brainstorm",
    targetId: assistantId
  });

  dispatch(genxRequestGeneration({
    requestId: api.v1.uuid(),
    messages: strategy.messages,
    params: strategy.params,
    target: { type: "brainstorm", messageId: assistantId }
  }));
};

// Service: GenX Generation
const createGenXGenerationEffect = (genX: GenX): Effect<RootState> => async (action, { dispatch }) => {
  if (action.type !== "genx/requestGeneration") return;

  const { requestId, messages, params, target } = action.payload;

  dispatch(generationStarted({ requestId }));

  try {
    await genX.generate(
      messages,
      params,
      (choices, _final) => {
        const text = choices[0]?.text || "";
        if (text) {
          if (target.type === "brainstorm") {
             dispatch(brainstormAppendToMessage({ 
               messageId: target.messageId, 
               content: text 
             }));
          } else if (target.type === "field") {
             // Handle generic field streaming if needed
             // dispatch(fieldAppend({ fieldId: target.fieldId, content: text }));
          }
        }
      },
      "background"
    );
    dispatch(generationCompleted({ requestId }));
  } catch (error: any) {
    api.v1.log("Generation failed:", error);
    dispatch(generationFailed({ requestId, error: error.message || String(error) }));
  }
};
