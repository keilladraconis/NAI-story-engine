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
import { FieldID } from "../../config/field-definitions";

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
  // We need the messages context.
  const state = getState();
  const field = state.story.fields[FieldID.Brainstorm];
  const allMessages = (field?.data?.messages || []) as BrainstormMessage[];
  
  // Exclude the last empty assistant message we just added from the prompt context
  // but include the user message we just added.
  const promptMessages = allMessages
    .slice(0, -1) // remove last (assistant placeholder)
    .map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

  dispatch(genxRequestGeneration({
    requestId: api.v1.uuid(),
    messages: promptMessages,
    params: {
      model: "glm-4-6",
      max_tokens: 300,
      temperature: 0.7
    },
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
