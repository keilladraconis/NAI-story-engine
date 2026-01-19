import { describe, it, expect, vi } from "vitest";
import { createStore } from "../../../../src/core/store/store";
import {
  rootReducer,
  initialRootState,
} from "../../../../src/core/store/reducers/rootReducer";
import { registerEffects } from "../../../../src/core/store/effects";
import {
  genxRequestGeneration,
  brainstormAddMessage,
} from "../../../../src/core/store/actions";
import { FieldID } from "../../../../src/config/field-definitions";

describe("Generation Effects", () => {
  it("should stream directly to UI and sync store at end", async () => {
    // 1. Setup
    const store = createStore(rootReducer, initialRootState);
    const runner = {
      register: (effect: any) =>
        store.subscribeToActions((action) => effect(action, store)),
    };

    const messageId = "msg-123";

    // Pre-populate message in store so we can check it
    store.dispatch(
      brainstormAddMessage({
        message: { id: messageId, role: "assistant", content: "" },
      }),
    );

    const mockGenX = {
        generate: vi.fn().mockImplementation(async (_msgs, _params, callback) => {
            // Simulate streaming
            callback([{ text: "Hello " }], false);
            callback([{ text: "World" }], false);
        }),
        cancelCurrent: vi.fn(),
    } as any;

    registerEffects(runner as any, mockGenX);

    // 2. Action
    store.dispatch(genxRequestGeneration({
        requestId: "req-1",
        messages: [],
        params: { model: "test" } as any,
        target: { type: "brainstorm", messageId },
        prefixBehavior: "keep"
    }));

    // Wait for async effect to complete
    await new Promise(resolve => globalThis.setTimeout(resolve, 10));

    // 3. Verify UI Streaming
    // Expected calls:
    // 1. "Hello "
    // 2. "Hello World"

    // Note: api.v1.ui.updateParts might be called for other things if other effects react,
    // but here we only registered what's in registerEffects.
    // The message component also subscribes to store changes, but we ARE NOT updating the store during streaming.
    // So the component's useSelector for content shouldn't trigger updateParts during streaming.

    const calls = (api.v1.ui.updateParts as any).mock.calls;
    const textUpdates = calls.filter(
      (args: any[]) => args[0][0].id === `kse-bs-msg-${messageId}-text`,
    );

    expect(textUpdates.length).toBeGreaterThanOrEqual(2);
    expect(textUpdates[0][0][0].text).toBe("Hello ");
    expect(textUpdates[1][0][0].text).toBe("Hello World");

    // 4. Verify Store Sync
    const state = store.getState();
    const field = state.story.fields[FieldID.Brainstorm];
    const msg = field.data.messages.find((m: any) => m.id === messageId);

    expect(msg.content).toBe("Hello World");
  });
});
