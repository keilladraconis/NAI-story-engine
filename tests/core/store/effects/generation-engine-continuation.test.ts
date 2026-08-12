import { describe, it, expect, vi } from "vitest";
import type { Store } from "nai-store";
import type { GenX } from "nai-gen-x";
import { makeTestStore } from "../helpers/store-helpers";
import { registerGenerationEngineEffects } from "../../../../src/core/store/effects/generation-engine";
import { generationSubmitted } from "../../../../src/core/store/slices/ui";
import {
  requestActivated,
  requestCancelled,
} from "../../../../src/core/store/slices/runtime";
import {
  chatCreated,
  messageAdded,
} from "../../../../src/core/store/slices/chat";
import type {
  RootState,
  AppDispatch,
  GenerationStrategy,
} from "../../../../src/core/store/types";
import type { Chat } from "../../../../src/core/chat-types/types";

const CHAT_ID = "refine-chat";
const MESSAGE_ID = "candidate";

type TestStore = ReturnType<typeof makeTestStore>;

type Step = {
  text: string;
  finish_reason?: string;
  /** Runs once the call is registered — use it to simulate a user cancelling. */
  onCall?: (taskId: string, store: TestStore) => void;
  /** Reject instead of returning, as GenX does for a cancelled signal. */
  rejectWith?: string;
};

/**
 * GenX stub that replays a scripted sequence of responses — one per call — so a
 * test can say "the model hit the token cap twice, then finished".
 */
function makeScriptedGenX(script: Step[], getStore: () => TestStore) {
  const seen: { messages: Message[]; params: Record<string, unknown> }[] = [];
  let call = 0;

  const generate = vi.fn(
    async (
      messages: Message[] | (() => Promise<{ messages: Message[] }>),
      params: Record<string, unknown>,
      onStream?: (choices: GenerationChoice[], final: boolean) => void,
    ) => {
      const step = script[Math.min(call, script.length - 1)];
      call++;
      const resolved =
        typeof messages === "function" ? (await messages()).messages : messages;
      seen.push({ messages: resolved, params });
      step.onCall?.(String(params.taskId), getStore());
      if (step.text)
        onStream?.([{ text: step.text }] as GenerationChoice[], true);
      if (step.rejectWith) throw new Error(step.rejectWith);
      return {
        choices: [{ text: step.text, finish_reason: step.finish_reason }],
      };
    },
  );

  return { genX: { generate } as unknown as GenX, generate, seen };
}

function makeHarness(script: Step[]) {
  const store = makeTestStore();
  const { genX, generate, seen } = makeScriptedGenX(script, () => store);

  registerGenerationEngineEffects(
    store.subscribeEffect as Store<RootState>["subscribeEffect"],
    store.dispatch as AppDispatch,
    store.getState as () => RootState,
    genX,
  );

  const chat: Chat = {
    id: CHAT_ID,
    type: "refine",
    title: "Refining: lorebookContent",
    messages: [],
    seed: {
      kind: "fromField",
      sourceFieldId: "lorebookContent",
      sourceText: "x",
    },
    refineTarget: { fieldId: "lorebookContent", originalText: "x" },
  };
  store.dispatch(chatCreated({ chat }));
  store.dispatch(
    messageAdded({
      chatId: CHAT_ID,
      message: { id: MESSAGE_ID, role: "assistant", content: "" },
    }),
  );

  return { store, generate, seen };
}

function strategyWith(
  overrides: Partial<GenerationStrategy> & { tail?: Message },
): GenerationStrategy {
  const { tail, ...rest } = overrides;
  return {
    requestId: "refine-req",
    messageFactory: async () => ({
      messages: [
        { role: "system", content: "instructions" },
        ...(tail ? [tail] : [{ role: "user" as const, content: "rewrite it" }]),
      ],
      params: { max_tokens: 512 },
    }),
    target: {
      type: "chatRefine",
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
      fieldId: "lorebookContent",
    },
    prefillBehavior: "trim",
    continuation: { maxCalls: 5 },
    ...rest,
  };
}

function committedText(store: TestStore): string {
  const chat = store.getState().chat.chats.find((c) => c.id === CHAT_ID);
  return chat?.messages.find((m) => m.id === MESSAGE_ID)?.content ?? "";
}

describe("generation engine — continuation", () => {
  it("keeps continuing while the model reports a token-cap cut, then stops on a natural stop", async () => {
    const { store, generate } = makeHarness([
      { text: "The keep stands on", finish_reason: "length" },
      { text: " a cliff above", finish_reason: "length" },
      { text: " the river.", finish_reason: "stop" },
    ]);

    store.dispatch(generationSubmitted(strategyWith({})));

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(3));
    await vi.waitFor(() =>
      expect(committedText(store)).toBe(
        "The keep stands on a cliff above the river.",
      ),
    );
  });

  it("stops at the continuation limit instead of running forever", async () => {
    const { store, generate } = makeHarness([
      { text: "chunk ", finish_reason: "length" },
    ]);

    store.dispatch(
      generationSubmitted(strategyWith({ continuation: { maxCalls: 3 } })),
    );

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(3));
    await vi.waitFor(() =>
      expect(committedText(store)).toBe("chunk chunk chunk "),
    );
  });

  it("does not continue when the first call ended naturally", async () => {
    const { store, generate } = makeHarness([
      { text: "done", finish_reason: "stop" },
    ]);

    store.dispatch(generationSubmitted(strategyWith({})));

    await vi.waitFor(() => expect(committedText(store)).toBe("done"));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("stops early when a continuation call adds nothing", async () => {
    const { store, generate } = makeHarness([
      { text: "first", finish_reason: "length" },
      { text: "", finish_reason: "length" },
    ]);

    store.dispatch(generationSubmitted(strategyWith({})));

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(committedText(store)).toBe("first"));
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("folds an assistant prefill into the continuation turn rather than dropping it", async () => {
    // The prefill is text the model is treated as having written. Sending the
    // continuation without it loses the Name/Type header a lorebook entry
    // depends on; sending it as a separate turn leaves two assistant messages.
    const prefill = "Ashfall Keep\nType: Location\n";
    const { store, seen } = makeHarness([
      { text: "A fortress", finish_reason: "length" },
      { text: " of black stone.", finish_reason: "stop" },
    ]);

    store.dispatch(
      generationSubmitted(
        strategyWith({ tail: { role: "assistant", content: prefill } }),
      ),
    );

    await vi.waitFor(() => expect(seen).toHaveLength(2));
    const continuation = seen[1].messages;
    expect(continuation).toHaveLength(2);
    expect(continuation[1]).toEqual({
      role: "assistant",
      content: `${prefill}A fortress`,
    });
    await vi.waitFor(() =>
      expect(committedText(store)).toBe("A fortress of black stone."),
    );
  });

  it("stops when the user cancels mid-continuation and retires the continuation task", async () => {
    // While a continuation runs it — not the parent — is the request the
    // runtime holds as active. Cancellation has to recognise that, and the
    // dead task must not be left sitting in activeRequest afterwards.
    const { store, generate } = makeHarness([
      { text: "first", finish_reason: "length" },
      {
        text: "",
        finish_reason: "length",
        onCall: (taskId, s) => {
          s.dispatch(requestActivated({ requestId: taskId }));
          s.dispatch(requestCancelled({ requestId: taskId }));
        },
        rejectWith: "Cancelled",
      },
    ]);

    store.dispatch(generationSubmitted(strategyWith({})));

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(store.getState().runtime.activeRequest).toBeNull(),
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
