import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/core/utils/context-builder", () => ({
  buildStoryEnginePrefix: vi.fn(async () => [
    { role: "system", content: "PREFIX" },
  ]),
}));

import {
  buildLorebookContentPayload,
  buildLorebookContentStrategy,
  LOREBOOK_CONTENT_MAX_CALLS,
} from "../../../src/core/utils/lorebook-strategy";
import type { RootState } from "../../../src/core/store/types";

const ENTRY_ID = "entry-1";

const getState = () =>
  ({
    world: { entitiesById: {}, entityIds: [], groups: [] },
    ui: { lorebook: { selectedEntryId: null } },
  }) as unknown as RootState;

describe("buildLorebookContentPayload", () => {
  it("lets a truncated entry keep going instead of saving it mid-sentence", () => {
    const payload = buildLorebookContentPayload(getState, ENTRY_ID, "req-1");
    expect(payload.continuation).toEqual({
      maxCalls: LOREBOOK_CONTENT_MAX_CALLS,
    });
    expect(LOREBOOK_CONTENT_MAX_CALLS).toBeGreaterThan(1);
  });

  it("targets the entry it was asked for under the caller's request id", () => {
    const payload = buildLorebookContentPayload(getState, ENTRY_ID, "req-1");
    expect(payload.requestId).toBe("req-1");
    expect(payload.target).toEqual({
      type: "lorebookContent",
      entryId: ENTRY_ID,
    });
  });

  it("leaves the token budget to the factory rather than restating it", () => {
    // Four callsites used to each pass their own max_tokens, and they had
    // already drifted (512 vs 1024) — while the factory's value silently won.
    const payload = buildLorebookContentPayload(getState, ENTRY_ID, "req-1");
    expect(payload.params).toBeUndefined();
    expect(payload.messageFactory).toBeTypeOf("function");
  });
});

describe("buildLorebookContentStrategy", () => {
  it("keeps the shared continuation behaviour for a plain generation", () => {
    const strategy = buildLorebookContentStrategy(getState, {
      entryId: ENTRY_ID,
      requestId: "req-2",
    });
    expect(strategy.continuation).toEqual({
      maxCalls: LOREBOOK_CONTENT_MAX_CALLS,
    });
  });

  it("keeps it for a refine too, and appends the refine tail", async () => {
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue({
      id: ENTRY_ID,
      displayName: "Ashfall Keep",
      text: "the original entry",
      keys: [],
    } as unknown as Awaited<ReturnType<typeof api.v1.lorebook.entry>>);

    const strategy = buildLorebookContentStrategy(getState, {
      entryId: ENTRY_ID,
      requestId: "req-3",
      refineContext: {
        fieldId: "lorebookContent",
        currentText: "the original entry",
        history: [],
      },
    });
    expect(strategy.continuation).toEqual({
      maxCalls: LOREBOOK_CONTENT_MAX_CALLS,
    });

    const built = await strategy.messageFactory!();
    const text = built.messages.map((m) => m.content).join("\n");
    expect(text).toContain("the original entry");
    expect(text).toContain("REFINE TARGET");
  });

  it("requires an entryId", () => {
    expect(() => buildLorebookContentStrategy(getState, {})).toThrow(
      /requires entryId/i,
    );
  });
});
