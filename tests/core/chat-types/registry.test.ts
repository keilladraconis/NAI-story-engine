import { describe, it, expect } from "vitest";
import {
  getChatTypeSpec,
  CHAT_TYPE_REGISTRY,
} from "../../../src/core/chat-types/index";
import { KNOWN_CHAT_TYPES } from "../../../src/core/store/slices/chat";

describe("chat-type registry", () => {
  it("registers scenario, summary, refine, and matches KNOWN_CHAT_TYPES", () => {
    expect(Object.keys(CHAT_TYPE_REGISTRY).sort()).toEqual([
      "refine",
      "scenario",
      "summary",
    ]);
    expect(Object.keys(CHAT_TYPE_REGISTRY).sort()).toEqual(
      [...KNOWN_CHAT_TYPES].sort(),
    );
  });

  it("getChatTypeSpec returns the registered spec", () => {
    expect(getChatTypeSpec("scenario").id).toBe("scenario");
  });

  it("getChatTypeSpec throws on unknown id", () => {
    expect(() => getChatTypeSpec("nope")).toThrow(/no chat-type spec/i);
  });
});
