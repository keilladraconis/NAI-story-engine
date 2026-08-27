import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEntitySummaryFactory } from "../../../src/core/utils/summary-strategy";
import type { RootState } from "../../../src/core/store";

// Minimal RootState with one entity and a settable activeEditId. The summary
// factory only touches world.entitiesById, foundation, and ui.activeEditId.
function makeState(entityName: string, activeEditId: string | null): RootState {
  return {
    world: {
      entitiesById: {
        e1: {
          id: "e1",
          categoryId: "dramatisPersonae",
          name: entityName,
          summary: "",
          lifecycle: "live",
        },
      },
      threads: [],
    },
    foundation: { shape: null, intent: "", worldState: "" },
    ui: { activeEditId },
  } as unknown as RootState;
}

function userText(messages: Message[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

describe("createEntitySummaryFactory — EDIT_PANE_TITLE contamination guard", () => {
  beforeEach(() => {
    vi.mocked(api.v1.storyStorage.get).mockReset();
  });

  it("uses the pane draft name when the pane is editing THIS entity", async () => {
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue("Pane Draft Name");
    const factory = createEntitySummaryFactory(
      () => makeState("Redux Name", "e1"),
      "e1",
    );
    const { messages } = await factory();
    expect(userText(messages)).toContain("Pane Draft Name");
    expect(userText(messages)).not.toContain("Redux Name");
  });

  it("ignores a stale EDIT_PANE_TITLE when no pane is open, using Redux name", async () => {
    // A previously-closed pane left "Stale Alice" in the slot.
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue("Stale Alice");
    const factory = createEntitySummaryFactory(
      () => makeState("Real Bob", null),
      "e1",
    );
    const { messages } = await factory();
    expect(userText(messages)).toContain("Real Bob");
    expect(userText(messages)).not.toContain("Stale Alice");
  });

  it("ignores EDIT_PANE_TITLE when a DIFFERENT entity's pane is open", async () => {
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue("Stale Alice");
    const factory = createEntitySummaryFactory(
      () => makeState("Real Bob", "other-entity"),
      "e1",
    );
    const { messages } = await factory();
    expect(userText(messages)).toContain("Real Bob");
    expect(userText(messages)).not.toContain("Stale Alice");
  });
});
