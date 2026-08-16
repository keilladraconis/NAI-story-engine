import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Store } from "nai-store";
import type { GenX } from "nai-gen-x";
import {
  resolveModel,
  buildModelParams,
  appendXialongStyleMessage,
} from "../../../src/core/utils/config";
import { makeTestStore } from "../store/helpers/store-helpers";
import { registerGenerationEngineEffects } from "../../../src/core/store/effects/generation-engine";
import { generationSubmitted } from "../../../src/core/store/slices/ui";
import type { RootState, AppDispatch } from "../../../src/core/store/types";

/** xialong_mode is the only config key these functions read. */
function xialongMode(on: boolean) {
  vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
    key === "xialong_mode" ? on : undefined,
  );
}

describe("resolveModel", () => {
  beforeEach(() => vi.mocked(api.v1.config.get).mockReset());

  it("uses GLM for everything when Xialong Mode is off", async () => {
    xialongMode(false);
    expect(await resolveModel("creative")).toEqual({
      model: "glm-4-6",
      xialong: false,
    });
    expect(await resolveModel("instruct")).toEqual({
      model: "glm-4-6",
      xialong: false,
    });
  });

  it("uses Xialong for creative work when Xialong Mode is on", async () => {
    xialongMode(true);
    expect(await resolveModel("creative")).toEqual({
      model: "xialong-v1",
      xialong: true,
    });
  });

  it("keeps instruct work on GLM even when Xialong Mode is on", async () => {
    // This is the whole point: xialong_mode means "use Xialong for prose",
    // not "use Xialong for everything".
    xialongMode(true);
    expect(await resolveModel("instruct")).toEqual({
      model: "glm-4-6",
      xialong: false,
    });
  });

  it("defaults to creative", async () => {
    xialongMode(true);
    expect(await resolveModel()).toEqual(await resolveModel("creative"));
  });
});

describe("buildModelParams", () => {
  beforeEach(() => vi.mocked(api.v1.config.get).mockReset());

  it("applies the Xialong sampler shape only for creative work", async () => {
    xialongMode(true);
    const creative = await buildModelParams({ max_tokens: 10, min_p: 0.1 });
    expect(creative).toEqual({
      model: "xialong-v1",
      top_k: 250,
      top_p: 0.95,
      max_tokens: 10,
    });

    // Instruct keeps min_p and gains no Xialong sampler overrides.
    const instruct = await buildModelParams(
      { max_tokens: 10, min_p: 0.1 },
      "instruct",
    );
    expect(instruct).toEqual({
      model: "glm-4-6",
      max_tokens: 10,
      min_p: 0.1,
    });
  });

  it("is unchanged for existing callsites that pass no capability", async () => {
    xialongMode(false);
    expect(await buildModelParams({ max_tokens: 64 })).toEqual({
      model: "glm-4-6",
      max_tokens: 64,
    });
  });
});

describe("appendXialongStyleMessage", () => {
  beforeEach(() => vi.mocked(api.v1.config.get).mockReset());

  it("appends for creative work in Xialong Mode", async () => {
    xialongMode(true);
    const messages: Message[] = [];
    await appendXialongStyleMessage(messages, "[ Style: terse ]");
    expect(messages).toHaveLength(1);
  });

  it("does not append for instruct work, even in Xialong Mode", async () => {
    // The style block is guidance for a model this call is not using. Sending
    // it to GLM is worse than either consistent choice.
    xialongMode(true);
    const messages: Message[] = [];
    await appendXialongStyleMessage(messages, "[ Style: terse ]", "instruct");
    expect(messages).toEqual([]);
  });

  it("does not append when Xialong Mode is off", async () => {
    xialongMode(false);
    const messages: Message[] = [];
    await appendXialongStyleMessage(messages, "[ Style: terse ]");
    expect(messages).toEqual([]);
  });
});

// external/script-types.d.ts still declares the single-argument form of
// countUncachedInputTokens; src/type-overrides.d.ts adds the (messages, model)
// one the runtime actually has. Both merge into the namespace, and the vendored
// declaration is the one `Parameters<>` picks, so name the real shape here to
// read the model argument off the recorded calls.
const countTokens = vi.mocked<
  (messages: Message[], model: string) => Promise<number>
>(api.v1.script.countUncachedInputTokens);

describe("the model is resolved exactly once per request", () => {
  beforeEach(() => {
    vi.mocked(api.v1.config.get).mockReset();
    countTokens.mockClear();
  });

  it("counts an instruct request's tokens against the model it actually uses", async () => {
    // countUncachedInputTokens must be told the model the request is really
    // using. Re-deriving it from global config would account an instruct
    // request against Xialong's tokeniser — and phase 4's pacing reads this
    // instrumentation.
    xialongMode(true);
    const store = makeTestStore();
    const generate = vi.fn(
      async (
        messages: Message[] | (() => Promise<{ messages: Message[] }>),
      ) => {
        if (typeof messages === "function") await messages();
        return { choices: [{ text: "ok", finish_reason: "stop" }] };
      },
    );
    registerGenerationEngineEffects(
      store.subscribeEffect as Store<RootState>["subscribeEffect"],
      store.dispatch as AppDispatch,
      store.getState as () => RootState,
      { generate } as unknown as GenX,
    );

    store.dispatch(
      generationSubmitted({
        requestId: "instruct-req",
        messageFactory: async () => ({
          messages: [{ role: "user", content: "list the keys" }],
          params: await buildModelParams({ max_tokens: 64 }, "instruct"),
        }),
        params: await buildModelParams({ max_tokens: 64 }, "instruct"),
        target: { type: "entitySummary", entityId: "e1" },
        prefillBehavior: "trim",
      }),
    );

    await vi.waitFor(() => expect(countTokens).toHaveBeenCalled());
    expect(countTokens.mock.calls[0][1]).toBe("glm-4-6");
  });
});
