import { describe, it, expectTypeOf } from "vitest";
import type { HeaderControl } from "../../../src/core/chat-types/types";

describe("HeaderControl.kind union", () => {
  it("is exactly the set of supported control kinds", () => {
    expectTypeOf<HeaderControl["kind"]>().toEqualTypeOf<
      | "sessionsButton"
      | "newChatButton"
      | "label"
      | "backButton"
      | "scrubIndicator"
    >();
  });
});
