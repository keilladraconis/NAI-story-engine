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

  it("includes forgeCleanup target with chatId, messageId, discardedNames", () => {
    type T = GenerationStrategy["target"];
    type ForgeCleanup = Extract<T, { type: "forgeCleanup" }>;
    expectTypeOf<ForgeCleanup>().toEqualTypeOf<{
      type: "forgeCleanup";
      chatId: string;
      messageId: string;
      discardedNames: string[];
    }>();
  });
});

describe("GenerationRequest.type union", () => {
  it("includes forgeChat and forgeCleanup as valid request types", () => {
    const fc: GenerationRequest = {
      id: "x",
      type: "forgeChat",
      targetId: "y",
      status: "queued",
    };
    const fcl: GenerationRequest = {
      id: "x",
      type: "forgeCleanup",
      targetId: "y",
      status: "queued",
    };
    expectTypeOf(fc.type).toEqualTypeOf<GenerationRequest["type"]>();
    expectTypeOf(fcl.type).toEqualTypeOf<GenerationRequest["type"]>();
  });
});
