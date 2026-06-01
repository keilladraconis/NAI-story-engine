import { describe, it, expect, vi } from "vitest";
import { forgeSpec } from "../../../src/core/chat-types/forge";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";
import {
  FORGE_SKETCH_PROMPT,
  FORGE_EXPAND_PROMPT,
  FORGE_WEAVE_PROMPT,
} from "../../../src/core/utils/prompts";

const ctx: SpecCtx = {
  getState: vi.fn(),
  dispatch: vi.fn(),
};

function makeChat(over: Partial<Chat> = {}): Chat {
  return {
    id: "fc-1",
    type: "forge",
    title: "Forge",
    subMode: "sketch",
    messages: [],
    seed: { kind: "blank" },
    ...over,
  };
}

describe("forgeSpec", () => {
  it("declares save lifecycle and sketch/expand/weave submodes", () => {
    expect(forgeSpec.id).toBe("forge");
    expect(forgeSpec.lifecycle).toBe("save");
    expect(forgeSpec.subModes).toEqual(["sketch", "expand", "weave"]);
    expect(forgeSpec.defaultSubMode).toBe("sketch");
  });

  it("initialize seeds an empty sketch session", () => {
    const init = forgeSpec.initialize({ kind: "blank" }, ctx);
    expect(init.subMode).toBe("sketch");
    expect(init.initialMessages).toEqual([]);
    expect(init.title).toMatch(/Forge/);
  });

  it("systemPromptFor returns sketch prompt for sketch subMode", () => {
    expect(
      forgeSpec.systemPromptFor(makeChat({ subMode: "sketch" }), ctx),
    ).toBe(FORGE_SKETCH_PROMPT);
  });

  it("systemPromptFor returns expand prompt for expand subMode", () => {
    expect(
      forgeSpec.systemPromptFor(makeChat({ subMode: "expand" }), ctx),
    ).toBe(FORGE_EXPAND_PROMPT);
  });

  it("systemPromptFor returns weave prompt for weave subMode", () => {
    expect(forgeSpec.systemPromptFor(makeChat({ subMode: "weave" }), ctx)).toBe(
      FORGE_WEAVE_PROMPT,
    );
  });

  it("systemPromptFor defaults to sketch when subMode is missing", () => {
    expect(
      forgeSpec.systemPromptFor(makeChat({ subMode: undefined }), ctx),
    ).toBe(FORGE_SKETCH_PROMPT);
  });

  it("contextSlice returns the full transcript", () => {
    const chat = makeChat({
      messages: [
        { id: "u", role: "user", content: "hi" },
        { id: "a", role: "assistant", content: '[CREATE CHARACTER "A" | foo]' },
      ],
    });
    expect(forgeSpec.contextSlice(chat, ctx)).toEqual(chat.messages);
  });

  it("headerControls includes phase, cast-all, discard-all, sessions", () => {
    const controls = forgeSpec.headerControls(makeChat(), ctx);
    const kinds = controls.map((c) => c.kind);
    expect(kinds).toContain("phaseIndicator");
    expect(kinds).toContain("castAllButton");
    expect(kinds).toContain("discardAllButton");
    expect(kinds).toContain("sessionsButton");
  });
});
