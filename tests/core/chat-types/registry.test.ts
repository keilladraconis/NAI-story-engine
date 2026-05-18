import { describe, it, expect } from "vitest";
import {
  getChatTypeSpec,
  CHAT_TYPE_REGISTRY,
} from "../../../src/core/chat-types/index";

describe("chat-type registry", () => {
  it("registers brainstorm, summary, refine, forge", () => {
    expect(CHAT_TYPE_REGISTRY.brainstorm).toBeDefined();
    expect(CHAT_TYPE_REGISTRY.summary).toBeDefined();
    expect(CHAT_TYPE_REGISTRY.refine).toBeDefined();
    expect(CHAT_TYPE_REGISTRY.forge).toBeDefined();
  });

  it("getChatTypeSpec returns the registered spec", () => {
    expect(getChatTypeSpec("brainstorm").id).toBe("brainstorm");
  });

  it("getChatTypeSpec returns forge spec by id", () => {
    expect(getChatTypeSpec("forge").id).toBe("forge");
  });

  it("getChatTypeSpec throws on unknown id", () => {
    expect(() => getChatTypeSpec("nope")).toThrow(/no chat-type spec/i);
  });
});
