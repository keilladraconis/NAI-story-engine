import { describe, it, expect, vi } from "vitest";
import { createStore } from "../../../../src/core/store/store";
import { rootReducer, initialRootState } from "../../../../src/core/store/reducers/rootReducer";
import { registerEffects } from "../../../../src/core/store/effects";
import { uiBrainstormRetry } from "../../../../src/core/store/actions";
import { GenX } from "../../../../lib/gen-x";

// Mock GenX
const mockGenX = {
  cancelCurrent: vi.fn(),
  generate: vi.fn(),
  subscribe: vi.fn(),
  state: { status: "idle" },
} as unknown as GenX;

describe("Brainstorm Effects", () => {
  it("should cancel current generation on retry", () => {
    const store = createStore(rootReducer, initialRootState);
    const runner = { register: (effect: any) => store.subscribeToActions((action) => effect(action, store)) };
    
    registerEffects(runner as any, mockGenX);

    // Dispatch retry
    store.dispatch(uiBrainstormRetry({ messageId: "some-id" }));

    // Verify cancellation
    expect(mockGenX.cancelCurrent).toHaveBeenCalled();
  });
});
