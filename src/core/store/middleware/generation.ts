import { Store } from "../store";
import { Action, RootState, GenerationRequest } from "../types";
import { ActionTypes, fieldUpdated, dulfsItemUpdated, dulfsItemAdded } from "../actions";
import { buildStrategy } from "../utils/context-strategies";
import { DulfsFieldID, FieldID } from "../../../config/field-definitions";

const activeSignals = new Map<string, any>(); // RequestID -> CancellationSignal

export const generationMiddleware = (store: Store<RootState>) => {
  let isGenerating = false;

  const processQueue = async () => {
    if (isGenerating) return;

    const state = store.getState();
    if (state.runtime.queue.length === 0) return;

    // Simple FIFO for now, but SEGA might need round-robin later
    const request = state.runtime.queue[0];
    
    // Dispatch STARTED to move from queue to active
    store.dispatch({ type: ActionTypes.GENERATION_STARTED, payload: { requestId: request.id } });
    isGenerating = true;

    try {
      await runGeneration(store, request);
    } catch (e) {
      api.v1.log("Generation failed", e);
      store.dispatch({ type: ActionTypes.GENERATION_FAILED, payload: { requestId: request.id, error: String(e) } });
    } finally {
      isGenerating = false;
      store.dispatch({ type: ActionTypes.GENERATION_COMPLETED, payload: { requestId: request.id } });
      
      // Trigger next
      processQueue(); 
    }
  };

  return (next: (action: Action) => void) => (action: Action) => {
    const result = next(action);

    if (action.type === ActionTypes.GENERATION_REQUESTED) {
      processQueue();
    }
    
    if (action.type === ActionTypes.GENERATION_CANCELLED) {
        const { requestId } = action.payload;
        const signal = activeSignals.get(requestId);
        if (signal) {
            signal.cancel();
            activeSignals.delete(requestId);
        }
    }

    return result;
  };
};

async function runGeneration(store: Store<RootState>, request: GenerationRequest) {
  const signal = await api.v1.createCancellationSignal();
  activeSignals.set(request.id, signal);

  try {
    const strategy = await buildStrategy(store.getState().story, request);
    
    // Check for prefill
    let buffer = strategy.assistantPrefill || "";
    
    // If we have a prefill, we should ensure the field reflects it immediately if it's a content generation
    if (buffer && request.type === 'field' && request.targetId.includes(':')) {
         const [fieldId, itemId] = request.targetId.split(':');
         store.dispatch(dulfsItemUpdated(fieldId as DulfsFieldID, itemId, { content: buffer }));
    }

    await api.v1.generate(
        strategy.messages,
        strategy.params,
        async (choices) => {
            // Callback provides choices array
            const choice = choices[0];
            if (!choice || signal.cancelled) return;
            
            let text = choice.text;
            
            // Apply filters
        if (strategy.filters) {
            for (const filter of strategy.filters) {
                text = filter(text);
            }
        }
        
        buffer += text;

        if (request.type === 'field') {
            if (request.targetId.includes(':')) {
                // Dulfs Content
                const [fieldId, itemId] = request.targetId.split(':');
                store.dispatch(dulfsItemUpdated(fieldId as DulfsFieldID, itemId, { content: buffer }));
            } else {
                // Regular Field
                store.dispatch(fieldUpdated(request.targetId, buffer));
            }
        }
    }, 'background', signal);

    if (signal.cancelled) return;

    // Final processing
    if (request.type === 'list') {
        const lines = buffer.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
        const fieldId = request.targetId as DulfsFieldID;
        
        for (const line of lines) {
            // Basic cleanup of numbering "1. Name" -> "Name"
            const name = line.replace(/^["\d-]+\.\s*|^\s*-\s*/, "");
            if (name) {
                const newItem = {
                    id: api.v1.uuid(),
                    fieldId: fieldId,
                    name: name,
                    content: ""
                };
                store.dispatch(dulfsItemAdded(fieldId, newItem));
            }
        }
        api.v1.ui.toast(`Generated ${lines.length} items`);
    } else if (request.type === 'brainstorm') {
        store.dispatch({ type: ActionTypes.BRAINSTORM_MESSAGE_ADDED, payload: { role: 'assistant', content: buffer } });
        // Clear the streaming buffer
        store.dispatch(fieldUpdated(FieldID.Brainstorm, ""));
    }

  } finally {
      activeSignals.delete(request.id);
      signal.dispose();
  }
}
