import { describe, it, expect, expectTypeOf } from "vitest";
import type { ChatMessage } from "../../../src/core/chat-types/types";

describe("ChatMessage.messageKind", () => {
  it("is an optional 'cleanup' tag", () => {
    type K = NonNullable<ChatMessage["messageKind"]>;
    expectTypeOf<K>().toEqualTypeOf<"cleanup">();
  });

  it("messages without messageKind are valid", () => {
    const m: ChatMessage = { id: "1", role: "user", content: "hi" };
    expect(m.messageKind).toBeUndefined();
  });
});
