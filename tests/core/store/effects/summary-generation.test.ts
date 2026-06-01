import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerSummaryGenerationEffects,
  entityRegenRequested,
} from "../../../../src/core/store/effects/summary-generation";
import type {
  RootState,
  AppDispatch,
  WorldEntity,
} from "../../../../src/core/store/types";
import { FieldID } from "../../../../src/config/field-definitions";

// Isolate the effect's branching from real strategy construction.
vi.mock("../../../../src/core/utils/lorebook-strategy", () => ({
  createLorebookContentFactory: vi.fn(() => async () => ({ messages: [] })),
  buildLorebookKeysPayload: vi.fn(
    async (_g: unknown, entryId: string, requestId: string) => ({
      requestId,
      messageFactory: async () => ({ messages: [] }),
      target: { type: "lorebookKeys", entryId },
      prefillBehavior: "trim" as const,
    }),
  ),
}));

type Handler = (
  a: { type: string; payload: unknown },
  ctx: { getState: () => RootState },
) => Promise<void> | void;

function makeEntity(over: Partial<WorldEntity>): WorldEntity {
  return {
    id: "e1",
    categoryId: FieldID.DramatisPersonae,
    name: "Vesper",
    summary: "a governess",
    lifecycle: "live",
    ...over,
  } as WorldEntity;
}

function makeState(entity?: WorldEntity): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  if (entity) entitiesById[entity.id] = entity;
  return { world: { entitiesById } } as unknown as RootState;
}

function makeHarness(state: RootState) {
  const subs: {
    predicate: (a: { type: string }) => boolean;
    handler: Handler;
  }[] = [];
  const dispatch = vi.fn();
  const subscribeEffect = vi.fn(
    (predicate: (a: { type: string }) => boolean, handler: Handler) => {
      subs.push({ predicate, handler });
    },
  );
  const getState = () => state;
  registerSummaryGenerationEffects(
    subscribeEffect as never,
    dispatch as unknown as AppDispatch,
    getState,
  );
  async function fire(action: { type: string; payload?: unknown }) {
    for (const s of subs) {
      if (s.predicate(action)) await s.handler(action as never, { getState });
    }
  }
  const queuedTypes = () =>
    dispatch.mock.calls
      .filter(([a]) => a.type === "runtime/requestQueued")
      .map(([a]) => (a.payload as { type: string }).type);
  const submittedTargets = () =>
    dispatch.mock.calls
      .filter(([a]) => a.type === "ui/generationSubmitted")
      .map(([a]) => (a.payload as { target: { type: string } }).target.type);
  return { dispatch, fire, queuedTypes, submittedTargets };
}

describe("entityRegenRequested effect", () => {
  beforeEach(() => {
    vi.mocked(api.v1.lorebook.entry).mockReset();
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue(undefined as never);
  });

  it("is a no-op for a draft entity with no lorebook entry", async () => {
    const draft = makeEntity({
      lifecycle: "draft",
      lorebookEntryId: undefined,
    });
    const { dispatch, fire } = makeHarness(makeState(draft));
    await fire(entityRegenRequested({ entityId: "e1" }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("generates content and keys (not summary) when the entry is empty but summary exists", async () => {
    const live = makeEntity({
      lorebookEntryId: "lb-1",
      summary: "a governess",
    });
    const { fire, queuedTypes, submittedTargets } = makeHarness(
      makeState(live),
    );
    await fire(entityRegenRequested({ entityId: "e1" }));
    expect(queuedTypes().sort()).toEqual(["lorebookContent", "lorebookKeys"]);
    expect(submittedTargets().sort()).toEqual([
      "lorebookContent",
      "lorebookKeys",
    ]);
  });

  it("also generates the summary when it is missing", async () => {
    const live = makeEntity({ lorebookEntryId: "lb-1", summary: "" });
    const { fire, queuedTypes, dispatch } = makeHarness(makeState(live));
    await fire(entityRegenRequested({ entityId: "e1" }));
    expect(queuedTypes()).toContain("entitySummary");
    expect(
      dispatch.mock.calls.some(
        ([a]) => a.type === "ui/uiEntitySummaryGenerationRequested",
      ),
    ).toBe(true);
  });

  it("does nothing when the entity is already complete", async () => {
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue({
      text: "rich lore",
      keys: ["vesper"],
    } as never);
    const live = makeEntity({
      lorebookEntryId: "lb-1",
      summary: "a governess",
    });
    const { fire, queuedTypes, submittedTargets } = makeHarness(
      makeState(live),
    );
    await fire(entityRegenRequested({ entityId: "e1" }));
    expect(queuedTypes()).toEqual([]);
    expect(submittedTargets()).toEqual([]);
  });
});
