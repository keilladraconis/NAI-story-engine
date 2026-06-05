import { describe, it, expect, vi } from "vitest";

// Isolate the refine branch's mode selection from the heavy context/field
// machinery: stub the prefix builder, the rewrite-tail builder, and the field
// strategy registry so each path emits a detectable marker.
vi.mock("../../../src/core/utils/context-builder", () => ({
  buildStoryEnginePrefix: vi.fn(async () => [
    { role: "system", content: "PREFIX" },
  ]),
}));
vi.mock("../../../src/core/utils/refine-strategy", () => ({
  buildRefineTail: vi.fn(
    (prefix: { role: string; content: string }[], refine: {
      currentText: string;
    }) => [...prefix, { role: "system", content: `REWRITE:${refine.currentText}` }],
  ),
}));
vi.mock("../../../src/core/utils/field-strategy-registry", () => ({
  getFieldStrategy: vi.fn((fieldId: string) => () => ({
    requestId: "fld",
    messageFactory: async () => ({
      messages: [{ role: "system", content: `FRESH:${fieldId}` }],
      params: { temperature: 0.9 },
    }),
    target: { type: "foundation", field: fieldId },
  })),
}));
vi.mock("../../../src/core/utils/config", () => ({
  isXialongMode: vi.fn(async () => false),
  buildModelParams: vi.fn(async (p: unknown) => p),
}));

import { buildChatStrategy } from "../../../src/core/utils/chat-strategy";
import type { Chat, ChatMessage } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";

const getState = () => ({}) as unknown as RootState;

function refineChat(messages: ChatMessage[]): Chat {
  return {
    id: "r1",
    type: "refine",
    title: "Refining: attg",
    messages,
    seed: { kind: "fromField", sourceFieldId: "attg", sourceText: "old" },
    refineTarget: { fieldId: "attg", originalText: "old" },
  };
}

describe("buildChatStrategy — refine rewrite-vs-fresh branch", () => {
  it("rewrites the snapshot while a refineSource message is present", async () => {
    const chat = refineChat([
      { id: "s", role: "system", content: "old", messageKind: "refineSource" },
    ]);
    const strategy = await buildChatStrategy(getState, chat, "asst");
    const built = await strategy.messageFactory!();
    expect(built.messages.some((m) => m.content === "REWRITE:old")).toBe(true);
    expect(built.messages.some((m) => m.content === "FRESH:attg")).toBe(false);
  });

  it("runs a fresh field generation once the snapshot is deleted", async () => {
    const strategy = await buildChatStrategy(getState, refineChat([]), "asst");
    const built = await strategy.messageFactory!();
    expect(built.messages.some((m) => m.content === "FRESH:attg")).toBe(true);
    expect(built.messages.some((m) => m.content === "REWRITE:old")).toBe(false);
  });

  it("appends the latest typed instruction to a fresh generation", async () => {
    const chat = refineChat([
      { id: "u", role: "user", content: "make it punchier" },
    ]);
    const strategy = await buildChatStrategy(getState, chat, "asst");
    const built = await strategy.messageFactory!();
    const last = built.messages[built.messages.length - 1];
    expect(last).toEqual({ role: "user", content: "make it punchier" });
  });
});
