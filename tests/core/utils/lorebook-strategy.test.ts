import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/core/utils/context-builder", () => ({
  buildStoryEnginePrefix: vi.fn(async () => [
    { role: "system", content: "PREFIX" },
  ]),
}));

import {
  buildLorebookContentPayload,
  buildLorebookContentStrategy,
  buildLorebookPrefillFromEntry,
  resolveDisplayName,
  LOREBOOK_CONTENT_MAX_CALLS,
} from "../../../src/core/utils/lorebook-strategy";
import type { RootState } from "../../../src/core/store/types";
import { EDIT_PANE_TITLE } from "../../../src/core/keys";

const ENTRY_ID = "entry-1";

const getState = () =>
  ({
    world: { entitiesById: {}, entityIds: [], threads: [] },
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

// ─────────────────── who is watching decides the DRAFT layer ───────────────────

describe("resolveDisplayName — attended and unattended", () => {
  /** The writer has this entry open in the edit pane, half a name typed. */
  function midKeystroke(): () => RootState {
    vi.mocked(api.v1.storyStorage.get).mockImplementation(
      async (key: string) => (key === EDIT_PANE_TITLE ? "Adal" : null),
    );
    return () =>
      ({
        world: { entitiesById: {}, entityIds: [], threads: [] },
        ui: { lorebook: { selectedEntryId: ENTRY_ID } },
      }) as unknown as RootState;
  }

  const ENTRY = {
    id: ENTRY_ID,
    displayName: "Adaline Vance",
  } as unknown as LorebookEntry;

  it("prefers the pane draft for a press the writer is watching", async () => {
    // The DRAFT layer's whole purpose: a hand-pressed Generate reflects what
    // was typed a moment ago, before Save.
    const state = midKeystroke()();
    expect(
      await resolveDisplayName(state, ENTRY_ID, ENTRY.displayName, "attended"),
    ).toBe("Adal");
  });

  it("ignores it for a write nobody is watching", async () => {
    // Phase 6 is the first unattended caller. `EDIT_PANE_TITLE` is mirrored on
    // every keystroke, so a pass landing mid-word writes "Adal" as the entry's
    // header — or probes a thread's detector for a string the prose will never
    // contain, which makes the thread remind forever.
    const state = midKeystroke()();
    expect(
      await resolveDisplayName(
        state,
        ENTRY_ID,
        ENTRY.displayName,
        "unattended",
      ),
    ).toBe("Adaline Vance");
  });

  it("keeps the rest of the order for an unattended caller", async () => {
    // Only the DRAFT layer is dropped. LOREBOOK still outranks STATE, because
    // the writer renaming an entry in their own lorebook is a saved decision.
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
    const state = {
      world: {
        entitiesById: {
          e1: { id: "e1", name: "Stale", lorebookEntryId: ENTRY_ID },
        },
        entityIds: ["e1"],
        threads: [],
      },
      ui: { lorebook: { selectedEntryId: null } },
    } as unknown as RootState;

    expect(
      await resolveDisplayName(state, ENTRY_ID, "Adaline Vance", "unattended"),
    ).toBe("Adaline Vance");
    expect(
      await resolveDisplayName(state, ENTRY_ID, undefined, "unattended"),
    ).toBe("Stale");
  });

  it("carries the choice through the prefill the Engine writes with", async () => {
    // The header the revise and condense prompts anchor on, and the first line
    // of the entry that gets written back.
    const state = midKeystroke();
    expect(
      await buildLorebookPrefillFromEntry(state, ENTRY, "attended"),
    ).toMatch(/^Adal\n/);
    expect(
      await buildLorebookPrefillFromEntry(state, ENTRY, "unattended"),
    ).toMatch(/^Adaline Vance\n/);
  });
});
