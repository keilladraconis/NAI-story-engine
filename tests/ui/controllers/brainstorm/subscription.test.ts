import { describe, it, expect, vi } from "vitest";
import { createStore } from "../../../../src/core/store/store";
import { rootReducer, initialRootState } from "../../../../src/core/store/reducers/rootReducer";
import { brainstormAddMessage, brainstormAppendToMessage } from "../../../../src/core/store/actions";
import { FieldID } from "../../../../src/config/field-definitions";
import { BrainstormMessage } from "../../../../src/core/store/types";

describe("Brainstorm Subscription Optimization", () => {
  const getMessages = (state: any) => {
    return (state.story.fields[FieldID.Brainstorm]?.data?.messages || []) as BrainstormMessage[];
  };

  it("should not notify subscriber when only content changes (streaming)", () => {
    const store = createStore(rootReducer, initialRootState);
    const listener = vi.fn();

    // 1. Setup initial state with one message
    const msg1: BrainstormMessage = { id: "msg-1", role: "user", content: "Hello" };
    store.dispatch(brainstormAddMessage({ message: msg1 }));

    // 2. Subscribe using the Optimized Selector (Ids only)
    store.subscribeSelector(
      (state) => getMessages(state).map((m) => m.id).join(","),
      listener
    );

    // 3. Append content to the message
    store.dispatch(brainstormAppendToMessage({ messageId: "msg-1", content: " World" }));

    // 4. Verify state updated
    const messages = getMessages(store.getState());
    expect(messages[0].content).toBe("Hello World");

    // 5. Verify listener NOT called (because IDs didn't change)
    expect(listener).not.toHaveBeenCalled();
  });

  it("should notify subscriber when a message is added (structure change)", () => {
    const store = createStore(rootReducer, initialRootState);
    const listener = vi.fn();

    // 1. Setup initial state
    const msg1: BrainstormMessage = { id: "msg-1", role: "user", content: "Hello" };
    store.dispatch(brainstormAddMessage({ message: msg1 }));

    // 2. Subscribe
    store.subscribeSelector(
      (state) => getMessages(state).map((m) => m.id).join(","),
      listener
    );

    // 3. Add new message
    const msg2: BrainstormMessage = { id: "msg-2", role: "assistant", content: "Hi" };
    store.dispatch(brainstormAddMessage({ message: msg2 }));

    // 4. Verify listener called
    expect(listener).toHaveBeenCalledWith("msg-1,msg-2");
  });
});
