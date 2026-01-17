import { Effect } from "./store";
import { RootState, BrainstormMessage } from "./types";
import { GenX } from "../../../lib/gen-x";
import {
  brainstormAddMessage,
  brainstormAppendToMessage,
  generationStarted,
  generationCompleted,
  generationFailed,
  genxRequestGeneration,
} from "./actions";
import { buildBrainstormStrategy } from "./utils/context-builder";

export function registerEffects(runner: { register: (effect: Effect<RootState>) => void }, genX: GenX) {
  runner.register(createBrainstormSubmitEffect(genX));
  runner.register(createGenXGenerationEffect(genX));
}

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
