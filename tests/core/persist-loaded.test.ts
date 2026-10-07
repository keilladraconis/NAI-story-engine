import { describe, it, expect } from "vitest";
import { persistedDataLoaded, rootReducer } from "../../src/core/store";
import { FieldID } from "../../src/config/field-definitions";
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

/** Cases name only the slices they care about; the rest come from a fresh
 *  store, because persist/loaded now reads `chat` and `world` to cut drafts
 *  loose from chats it dropped. */
function reduce(seed: Partial<RootState>, action: Action): RootState {
  const fresh = rootReducer(undefined, { type: "@@INIT" });
  return rootReducer({ ...fresh, ...seed }, action);
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

  it("returns drafts of a dropped chat to the World", () => {
    const draft: WorldEntity = {
      id: "e1",
      name: "Hesper Vane",
      summary: "",
      categoryId: FieldID.DramatisPersonae,
      lifecycle: "draft",
      sourceChatId: "old-forge",
    };
    const next = rootReducer(
      undefined,
      persistedDataLoaded({
        chat: {
          chats: [
            {
              id: "old-forge",
              type: "forge",
              title: "Forge",
              messages: [],
              seed: { kind: "blank" },
            },
          ],
          activeChatId: "old-forge",
        },
        world: {
          ...initialWorldState,
          entitiesById: { e1: draft },
          entityIds: ["e1"],
        },
      }),
    );
    expect(next.chat.chats.every((c) => c.type === "scenario")).toBe(true);
    expect(next.world.entitiesById.e1.sourceChatId).toBeUndefined();
  });
});
