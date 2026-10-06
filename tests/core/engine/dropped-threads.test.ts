// Threads written before 0.16 are dropped on load. What happens to the
// lorebook entries they owned, and to the record that still names them.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStore, type Store } from "nai-store";
import { disableDroppedThreadEntries } from "../../../src/core/engine/thread-bind";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import type { RootState } from "../../../src/core/store/types";
import {
  loadWorldRecord,
  saveWorldRecord,
} from "../../../src/core/store/persistence/story-store";
import { STORAGE_KEYS } from "../../../src/core/keys";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

let story: StoryStorageFake;
let lorebook: LorebookFake;

beforeEach(() => {
  story = installStoryStorageFake();
  lorebook = installLorebookFake();
  vi.mocked(api.v1.log).mockClear();
  for (const id of ["le-swarm", "le-queen"]) {
    lorebook.seed({
      id,
      displayName: id,
      text: "x",
      keys: [],
      enabled: true,
    } as unknown as LorebookEntry);
  }
  story.set(STORAGE_KEYS.WORLD, {
    world: {
      threads: [
        {
          id: "old1",
          title: "The swarm",
          text: "x",
          horizon: "plot",
          lorebookEntryId: "le-swarm",
        },
        {
          id: "old2",
          title: "The queen",
          text: "y",
          horizon: "scene",
          lorebookEntryId: "le-queen",
        },
        { id: "new", title: "Kept", state: "Stands.", entityIds: [] },
      ],
    },
  });
});

/** What mount does: load, hand the World to the store, then clean up. */
async function load(): Promise<{
  store: Store<RootState>;
  dropped: string[];
}> {
  const store = createStore<RootState>(rootReducer);
  const record = await loadWorldRecord();
  store.dispatch(
    persistedDataLoaded({ story: record.story, world: record.world }),
  );
  return { store, dropped: record.droppedThreadEntryIds };
}

describe("cleaning up after Threads dropped on load", () => {
  it("switches their entries off and saves, so the next load finds nothing to drop", async () => {
    const { store, dropped } = await load();
    expect(dropped).toEqual(["le-swarm", "le-queen"]);

    await disableDroppedThreadEntries(dropped, store.getState, saveWorldRecord);

    expect(lorebook.read("le-swarm")?.enabled).toBe(false);
    expect(lorebook.read("le-queen")?.enabled).toBe(false);
    const again = await loadWorldRecord();
    expect(again.droppedThreadEntryIds).toEqual([]);
    expect(again.world.threads.map((t) => t.id)).toEqual(["new"]);
  });

  it("leaves an entry the writer switched back on alone on the next load", async () => {
    const first = await load();
    await disableDroppedThreadEntries(
      first.dropped,
      first.store.getState,
      saveWorldRecord,
    );
    lorebook.seed({ ...lorebook.read("le-swarm")!, enabled: true });

    const second = await load();
    await disableDroppedThreadEntries(
      second.dropped,
      second.store.getState,
      saveWorldRecord,
    );

    expect(lorebook.read("le-swarm")?.enabled).toBe(true);
  });

  it("neither throws nor stops at an entry the lorebook refuses", async () => {
    const { store, dropped } = await load();
    lorebook.failNextUpdate(new Error("lorebook is busy"));

    await expect(
      disableDroppedThreadEntries(dropped, store.getState, saveWorldRecord),
    ).resolves.toBeUndefined();

    expect(lorebook.read("le-swarm")?.enabled).toBe(true);
    expect(lorebook.read("le-queen")?.enabled).toBe(false);
    expect((await loadWorldRecord()).droppedThreadEntryIds).toEqual([]);
    expect(
      vi
        .mocked(api.v1.log)
        .mock.calls.some((call) => call.join(" ").includes("le-swarm")),
    ).toBe(true);
  });

  it("does not save when nothing was dropped", async () => {
    const { store } = await load();
    const save = vi.fn(async () => {});
    await disableDroppedThreadEntries([], store.getState, save);
    expect(save).not.toHaveBeenCalled();
  });

  it("does not throw when the save itself fails", async () => {
    const { store, dropped } = await load();
    await expect(
      disableDroppedThreadEntries(dropped, store.getState, async () => {
        throw new Error("storage is full");
      }),
    ).resolves.toBeUndefined();
    expect(lorebook.read("le-queen")?.enabled).toBe(false);
  });
});
