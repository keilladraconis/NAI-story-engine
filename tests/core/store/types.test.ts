import { describe, it, expectTypeOf } from "vitest";
import type {
  GenerationStrategy,
  GenerationRequest,
} from "../../../src/core/store/types";

describe("GenerationStrategy.target union", () => {
  it("includes forgeChat target with chatId and messageId", () => {
    type T = GenerationStrategy["target"];
    type ForgeChat = Extract<T, { type: "forgeChat" }>;
    expectTypeOf<ForgeChat>().toEqualTypeOf<{
      type: "forgeChat";
      chatId: string;
      messageId: string;
    }>();
  });
});

describe("GenerationRequest.type union", () => {
  it("includes forgeChat as a valid request type", () => {
    const fc: GenerationRequest = {
      id: "x",
      type: "forgeChat",
      targetId: "y",
      status: "queued",
    };
    expectTypeOf(fc.type).toEqualTypeOf<GenerationRequest["type"]>();
  });
});
