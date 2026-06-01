import { describe, it, expect } from "vitest";
import {
  formatForgeChip,
  buildForgeMessageView,
} from "../../../src/ui/components/SeForgeMessageView";
import type { ForgeSegment } from "../../../src/core/chat-types/types";

describe("formatForgeChip", () => {
  it("formats applied actions", () => {
    expect(formatForgeChip({ kind: "CREATE", status: "applied", elementType: "SYSTEM", name: "Apartment" }))
      .toEqual({ icon: "➕", label: "System · Apartment" });
    expect(formatForgeChip({ kind: "REVISE", status: "applied", name: "Wilson" }))
      .toEqual({ icon: "✏️", label: "Revised · Wilson" });
    expect(formatForgeChip({ kind: "DELETE", status: "applied", name: "Wilson" }))
      .toEqual({ icon: "🗑", label: "Deleted · Wilson" });
    expect(formatForgeChip({ kind: "RENAME", status: "applied", name: "A", newName: "B" }))
      .toEqual({ icon: "✏️", label: "Renamed · A → B" });
    expect(formatForgeChip({ kind: "THREAD", status: "applied", name: "The Pact" }))
      .toEqual({ icon: "🧵", label: "Thread · The Pact" });
    expect(formatForgeChip({ kind: "CRITIQUE", status: "applied", text: "needs a foil" }))
      .toEqual({ icon: "💬", label: "Critique: needs a foil" });
  });

  it("formats rejected actions with the attempted verb and reason", () => {
    expect(formatForgeChip({ kind: "REVISE", status: "rejected", name: "Wilson", reason: "live entity" }))
      .toEqual({ icon: "⚠️", label: "Revise · Wilson — live entity" });
    expect(formatForgeChip({ kind: "CREATE", status: "rejected", name: "Vane", reason: "duplicate" }))
      .toEqual({ icon: "⚠️", label: "Create · Vane — duplicate" });
  });

  it("formats unrecognized actions from the raw line", () => {
    expect(formatForgeChip({ kind: "UNKNOWN", status: "unrecognized", reason: '[CREATE SYSTm "X" | d]' }))
      .toEqual({ icon: "⚠️", label: 'Unrecognized · [CREATE SYSTm "X" | d]' });
  });

  it("falls back to the raw element type for unknown types", () => {
    expect(formatForgeChip({ kind: "CREATE", status: "applied", elementType: "WIDGET", name: "Z" }))
      .toEqual({ icon: "➕", label: "WIDGET · Z" });
  });
});

describe("buildForgeMessageView", () => {
  it("returns a prose text part and a chip row in order", () => {
    const segments: ForgeSegment[] = [
      { kind: "prose", text: "hello\nworld" },
      { kind: "action", action: { kind: "CREATE", status: "applied", elementType: "SYSTEM", name: "X" } },
    ];
    const parts = buildForgeMessageView(segments, "pfx") as unknown as Array<{
      type: string;
      id: string;
      text?: string;
    }>;
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toBe("hello  \nworld");
    expect(parts[1].type).toBe("row");
    expect(parts[1].id).toBe("pfx-seg-1");
  });
});
