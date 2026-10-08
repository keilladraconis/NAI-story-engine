import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Store } from "nai-store";
import type { GenX } from "nai-gen-x";
import { makeTestStore } from "../helpers/store-helpers";
import { registerGenerationEngineEffects } from "../../../../src/core/store/effects/generation-engine";
import { generationSubmitted } from "../../../../src/core/store/slices/ui";
import {
  requestActivated,
  requestQueued,
} from "../../../../src/core/store/slices/runtime";
import type {
  RootState,
  AppDispatch,
  GenerationStrategy,
  GenerationRequest,
} from "../../../../src/core/store/types";

// A completion handler the test holds open: the engine awaits it, and what the
// runtime shows for the target in that window is what these tests are about.
const gate = vi.hoisted(() => {
  const state = {
    entered: false,
    release: (): void => {},
    promise: Promise.resolve(),
    reset(): void {
      state.entered = false;
      state.promise = new Promise<void>((resolve) => {
        state.release = resolve;
      });
    },
  };
  return state;
});

vi.mock("../../../../src/core/store/effects/generation-handlers", () => ({
  getHandler: () => ({
    streaming: () => {},
    completion: async () => {
      gate.entered = true;
      await gate.promise;
    },
  }),
}));

const REQUEST_ID = "build-req";
const MESSAGE_ID = "reply";

type TestStore = ReturnType<typeof makeTestStore>;

/** GenX stub: one scripted finish reason per call. Like the real one it tells
 *  the runtime which task has started, which is what makes it the active
 *  request. */
function makeHarness(finishReasons: string[]) {
  const store: TestStore = makeTestStore();
  let call = 0;
  const generate = vi.fn(
    async (
      messages: Message[] | (() => Promise<{ messages: Message[] }>),
      params: Record<string, unknown>,
      onStream?: (choices: GenerationChoice[], final: boolean) => void,
    ) => {
      const finish_reason = finishReasons[call++];
      if (typeof messages === "function") await messages();
      store.dispatch(requestActivated({ requestId: String(params.taskId) }));
      onStream?.([{ text: "text " }] as GenerationChoice[], true);
      return { choices: [{ text: "text ", finish_reason }] };
    },
  );

  registerGenerationEngineEffects(
    store.subscribeEffect as Store<RootState>["subscribeEffect"],
    store.dispatch as AppDispatch,
    store.getState as () => RootState,
    { generate } as unknown as GenX,
  );

  const strategy: GenerationStrategy = {
    requestId: REQUEST_ID,
    messageFactory: async () => ({
      messages: [{ role: "user", content: "build" }],
      params: { max_tokens: 1024 },
    }),
    target: { type: "forgeChat", chatId: "chat", messageId: MESSAGE_ID },
    prefillBehavior: "trim",
    continuation: { maxCalls: 4 },
  };

  // As the Build effect does: the request is queued before it is submitted.
  store.dispatch(
    requestQueued({ id: REQUEST_ID, type: "forgeChat", targetId: MESSAGE_ID }),
  );
  store.dispatch(generationSubmitted(strategy));

  return { store, generate };
}

/** The requests the runtime holds for the reply that are not cancelled. */
function liveForTarget(store: TestStore): GenerationRequest[] {
  const { activeRequest, queue } = store.getState().runtime;
  return [activeRequest, ...queue].filter(
    (r): r is GenerationRequest =>
      !!r && r.targetId === MESSAGE_ID && r.status !== "cancelled",
  );
}

describe("generation engine — a request outlives its completion handler", () => {
  beforeEach(() => gate.reset());

  it("holds the request while an uncontinued generation's completion is pending", async () => {
    const { store, generate } = makeHarness(["stop"]);

    await vi.waitFor(() => expect(gate.entered).toBe(true));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(liveForTarget(store).map((r) => r.id)).toEqual([REQUEST_ID]);

    gate.release();
    await vi.waitFor(() => expect(liveForTarget(store)).toEqual([]));
    expect(store.getState().runtime.activeRequest).toBeNull();
  });

  it("holds the last continuation while a continued generation's completion is pending", async () => {
    const { store, generate } = makeHarness(["length", "length", "stop"]);

    await vi.waitFor(() => expect(gate.entered).toBe(true));
    expect(generate).toHaveBeenCalledTimes(3);
    // One request for the reply, never two: an earlier continuation is retired
    // when the next one takes over.
    expect(liveForTarget(store).map((r) => r.id)).toEqual([
      `${REQUEST_ID}-cont-2`,
    ]);

    gate.release();
    await vi.waitFor(() => expect(liveForTarget(store)).toEqual([]));
    expect(store.getState().runtime.activeRequest).toBeNull();
    expect(store.getState().runtime.queue).toEqual([]);
  });
});
