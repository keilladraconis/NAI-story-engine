import { describe, it, expect } from "vitest";
import { persistedDataLoaded, rootReducer } from "../../src/core/store";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialStoryState } from "../../src/core/store/slices/story";
import type {
  RootState,
  WorldEntity,
  WorldState,
} from "../../src/core/store/types";
import type { Action } from "nai-store";

function entity(id: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name: id,
    summary: "",
  };
}

function world(ids: string[]): WorldState {
  return {
    ...initialWorldState,
    entityIds: ids,
    entitiesById: Object.fromEntries(ids.map((id) => [id, entity(id)])),
  };
}

/** The partial seed is deliberate: persist/loaded spreads `current` and only
 *  rewrites the branch-scoped keys, so the slices a case does not name are
 *  never read. */
function reduce(seed: Partial<RootState>, action: Action): RootState {
  return rootReducer(seed as RootState, action);
}

describe("persist/loaded replaces branch-scoped slices", () => {
  it("drops an entity the incoming branch does not have", () => {
    const before: Partial<RootState> = { world: world(["a", "b"]) };
    const after = reduce(before, persistedDataLoaded({ world: world(["a"]) }));

    expect(after.world.entityIds).toEqual(["a"]);
    // The merge bug hides here: a `{ ...current.world.entitiesById,
    // ...data.world.entitiesById }` reducer replaces entityIds but leaves the
    // abandoned branch's record behind.
    expect(after.world.entitiesById).not.toHaveProperty("b");
  });

  it("drops a field the incoming branch does not have", () => {
    // dramatisPersonae is a list field, so it is absent from the seeded
    // skeleton — a branch that never wrote it must not inherit the value the
    // branch we navigated away from had.
    const before: Partial<RootState> = {
      story: {
        ...initialStoryState,
        fields: {
          ...initialStoryState.fields,
          dramatisPersonae: {
            id: "dramatisPersonae",
            content: "from a dead branch",
          },
        },
      },
    };
    const after = reduce(
      before,
      persistedDataLoaded({ story: initialStoryState }),
    );

    expect(after.story.fields.dramatisPersonae).toBeUndefined();
  });
});
