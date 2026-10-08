import { describe, it, expect } from "vitest";
import {
  isUndoable,
  latestUndoable,
  pruneBlocked,
} from "../../../src/core/chat-types/undo";
import type { ChatMessage } from "../../../src/core/chat-types/types";

const build = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: "assistant",
  content: "x",
  mode: "build",
  forgeSegments: [
    {
      kind: "action",
      action: {
        kind: "REVISE",
        status: "applied",
        name: "Kei",
        undo: { op: "summary", entityId: "e", before: "a", wrote: "b" },
      },
    },
  ],
  ...over,
});
const user = (id: string): ChatMessage => ({ id, role: "user", content: "hi" });

describe("which Build reply can be undone", () => {
  it("is one that applied something and has not been undone", () => {
    expect(isUndoable(build("b1"))).toBe(true);
    expect(isUndoable(build("b1", { undone: true }))).toBe(false);
    expect(isUndoable(build("b1", { forgeSegments: undefined }))).toBe(false);
    expect(
      isUndoable(
        build("b1", {
          forgeSegments: [
            {
              kind: "action",
              action: { kind: "DELETE", status: "rejected", name: "K" },
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(isUndoable({ ...build("b1"), mode: "plan" })).toBe(false);
  });

  it("is only the latest such reply, and the one before once that is undone", () => {
    expect(latestUndoable([build("b1"), user("u"), build("b2")])?.id).toBe(
      "b2",
    );
    expect(
      latestUndoable([build("b1"), user("u"), build("b2", { undone: true })])
        ?.id,
    ).toBe("b1");
    expect(latestUndoable([user("u")])).toBeUndefined();
  });

  it("blocks a prune that would drop a later reply still applied", () => {
    const msgs = [build("b1"), user("u"), build("b2")];
    expect(pruneBlocked(msgs, "b1")).toBe(true);
    expect(pruneBlocked(msgs, "b2")).toBe(false);
    expect(
      pruneBlocked([build("b1"), build("b2", { undone: true })], "b1"),
    ).toBe(false);
  });
});
