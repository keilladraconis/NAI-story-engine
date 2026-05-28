import { describe, it, expectTypeOf } from "vitest";
import type { HeaderControl } from "../../../src/core/chat-types/types";

describe("HeaderControl.kind union", () => {
  it("includes the three new Forge variants", () => {
    expectTypeOf<HeaderControl["kind"]>().toEqualTypeOf<
      | "subModeToggle"
      | "summarizeButton"
      | "sessionsButton"
      | "newChatButton"
      | "label"
      | "castAllButton"
      | "discardAllButton"
      | "phaseIndicator"
    >();
  });
});
