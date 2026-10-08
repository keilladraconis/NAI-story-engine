import { describe, it, expect, beforeEach } from "vitest";
import { createStore, type Store } from "nai-store";
import {
  entityAliases,
  registerThreadConditionEffects,
  resolveThreadMembers,
  syncOpenThreadEntries,
  syncThreadEntry,
} from "../../../src/core/engine/thread-bind";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../../src/core/store/types";
import {
  initialWorldState,
  entityEdited,
  threadCreated,
  threadDeleted,
  threadLedgerUpdated,
  threadMemberToggled,
  threadRenamed,
  threadStatusSet,
} from "../../../src/core/store/slices/world";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import { installStoryStorageFake } from "../../helpers/story-storage-fake";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function entity(
  id: string,
  name: string,
  lorebookEntryId?: string,
): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: lorebookEntryId ? "live" : "draft",
    name,
    summary: "",
    ...(lorebookEntryId ? { lorebookEntryId } : {}),
  };
}

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    title: "The Shared Apiary",
    state: "Ines Corbel and Pell work the east hives together.",
    latent: "Pell has not told Ines the cooperative means to sell them.",
    wish: "",
    entityIds: ["a", "b"],
    status: "open",
    ...over,
  };
}

let lorebook: LorebookFake;

function storeOf(
  entities: WorldEntity[],
  threads: Thread[] = [],
): Store<RootState> {
  const store = createStore<RootState>(rootReducer);
  store.dispatch(
    persistedDataLoaded({
      world: {
        ...initialWorldState,
        entityIds: entities.map((e) => e.id),
        entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
        threads,
      },
    }),
  );
  registerThreadConditionEffects(
    store.subscribeEffect,
    store.getState,
    store.dispatch,
  );
  return store;
}

beforeEach(() => {
  lorebook = installLorebookFake();
  installStoryStorageFake();
  lorebook.seed({
    id: "la",
    displayName: "Ines Corbel",
    keys: ["ines", "corbel"],
    text: "",
  } as LorebookEntry);
  lorebook.seed({
    id: "lb",
    displayName: "Pell",
    keys: ["pell"],
    text: "",
  } as LorebookEntry);
});

const cast = () => [
  entity("a", "Ines Corbel", "la"),
  entity("b", "Pell", "lb"),
];

describe("a member's aliases", () => {
  it("are its entry's keys plus its display name", async () => {
    const store = storeOf(cast());
    const members = await resolveThreadMembers(store.getState(), thread());
    expect(members).toEqual([
      { id: "a", aliases: ["ines", "corbel", "ines corbel"] },
      { id: "b", aliases: ["pell", "pell"] },
    ]);
  });

  it("are the name alone for a draft with no entry", async () => {
    const store = storeOf([entity("a", "Ines Corbel")]);
    const members = await resolveThreadMembers(
      store.getState(),
      thread({ entityIds: ["a"] }),
    );
    expect(members).toEqual([{ id: "a", aliases: ["ines corbel"] }]);
  });

  it("for the admission floor leave out regex keys", async () => {
    lorebook.seed({
      id: "la",
      displayName: "Ines Corbel",
      keys: ["ines", "/cor+bel/i"],
      text: "",
    } as LorebookEntry);
    const store = storeOf(cast());
    expect(await entityAliases(store.getState(), ["a"])).toEqual({
      a: ["Ines Corbel", "ines"],
    });
  });
});

describe("a Thread's lorebook entry", () => {
  it("is created with state as its text, no keys, not always-on, and never the latent", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();

    const [created] = lorebook.created();
    expect(created.text).toBe(
      "Ines Corbel and Pell work the east hives together.",
    );
    expect(created.keys).toEqual([]);
    expect(created.forceActivation).toBe(false);
    expect(created.enabled).toBe(true);
    expect(JSON.stringify(created)).not.toContain("has not told");
    expect(store.getState().world.threads[0].lorebookEntryId).toBe(created.id);
  });

  it("is not created for a Thread with no cast", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread({ entityIds: [] }) }));
    await settle();
    expect(lorebook.created()).toEqual([]);
  });

  it("is created once the Thread gains a cast", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread({ entityIds: [] }) }));
    await settle();
    store.dispatch(threadMemberToggled({ threadId: "t1", entityId: "a" }));
    await settle();
    expect(lorebook.created()).toHaveLength(1);
  });

  it("follows a ledger update, writing state and not latent", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    store.dispatch(
      threadLedgerUpdated({
        threadId: "t1",
        state: "Ines Corbel works the east hives alone.",
        latent: "Pell means to come back for his share.",
      }),
    );
    await settle();

    const entryId = store.getState().world.threads[0].lorebookEntryId as string;
    expect(lorebook.read(entryId)?.text).toBe(
      "Ines Corbel works the east hives alone.",
    );
    expect(JSON.stringify(lorebook.read(entryId))).not.toContain("come back");
  });

  it("is disabled when the Thread concludes and re-enabled when it reopens", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    store.dispatch(threadStatusSet({ threadId: "t1", status: "concluded" }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(false);

    store.dispatch(threadStatusSet({ threadId: "t1", status: "open" }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(true);
  });

  it("is disabled when the Thread loses its last cast member", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread({ entityIds: ["a"] }) }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    store.dispatch(threadMemberToggled({ threadId: "t1", entityId: "a" }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(false);
  });

  it("is disabled, not deleted, when the Thread is deleted", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    store.dispatch(threadDeleted({ threadId: "t1", lorebookEntryId: entryId }));
    await settle();
    expect(lorebook.read(entryId)?.enabled).toBe(false);
  });

  it("writes nothing when the entry already agrees", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const before = lorebook.updates().length;
    expect(await syncThreadEntry(store.getState, "t1")).toBe(false);
    expect(lorebook.updates()).toHaveLength(before);
  });

  it("follows a member's keys when they are edited in the lorebook", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;

    lorebook.seed({
      id: "lb",
      displayName: "Pell",
      keys: ["pell", "the drone-keeper"],
      text: "",
    } as LorebookEntry);
    await syncOpenThreadEntries(store.getState);

    expect(
      JSON.stringify(lorebook.read(entryId)?.advancedConditions),
    ).toContain("the drone-keeper");
  });

  it("follows a member's rename, and only in the Threads that member is in", async () => {
    const store = storeOf(
      [...cast(), entity("c", "Odile"), entity("d", "Maren")],
      [],
    );
    store.dispatch(threadCreated({ thread: thread() }));
    store.dispatch(
      threadCreated({
        thread: thread({ id: "t2", title: "Elsewhere", entityIds: ["c", "d"] }),
      }),
    );
    await settle();
    const [mine, other] = store
      .getState()
      .world.threads.map((t) => t.lorebookEntryId as string);
    const before = lorebook.updates().length;

    // As a Build RENAME does it: the entry first, then the entity.
    lorebook.seed({
      id: "lb",
      displayName: "Pell Arden",
      keys: ["pell arden"],
      text: "",
    } as LorebookEntry);
    store.dispatch(
      entityEdited({ entityId: "b", name: "Pell Arden", summary: "" }),
    );
    await settle();

    const condition = JSON.stringify(lorebook.read(mine)?.advancedConditions);
    expect(condition).toContain("pell arden");
    expect(condition).not.toContain('"pell"');
    expect(
      lorebook
        .updates()
        .slice(before)
        .some((u) => u.id === other),
    ).toBe(false);
  });

  it("overwrites a hand edit of the entry text: the Thread's state is the authority", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    await settle();
    const entryId = store.getState().world.threads[0].lorebookEntryId as string;
    lorebook.seed({
      ...(lorebook.read(entryId) as LorebookEntry),
      text: "hand-edited",
    });

    await syncThreadEntry(store.getState, "t1");
    expect(lorebook.read(entryId)?.text).toBe(
      "Ines Corbel and Pell work the east hives together.",
    );
  });

  it("is created once when several actions land before the first create finishes", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread({ entityIds: [] }) }));
    store.dispatch(threadMemberToggled({ threadId: "t1", entityId: "a" }));
    store.dispatch(
      threadLedgerUpdated({
        threadId: "t1",
        state: "Ines Corbel works the east hives alone.",
        latent: "",
      }),
    );
    await settle();
    await settle();

    expect(lorebook.created()).toHaveLength(1);
    const [created] = lorebook.created();
    const bound = store.getState().world.threads[0];
    expect(bound.lorebookEntryId).toBe(created.id);
    expect(lorebook.read(created.id)?.text).toBe(
      "Ines Corbel works the east hives alone.",
    );
  });

  it("is created once when a rename follows the create immediately", async () => {
    const store = storeOf(cast());
    store.dispatch(threadCreated({ thread: thread() }));
    store.dispatch(threadRenamed({ threadId: "t1", title: "The East Hives" }));
    await settle();
    await settle();

    expect(lorebook.created()).toHaveLength(1);
    expect(store.getState().world.threads[0].lorebookEntryId).toBe(
      lorebook.created()[0].id,
    );
  });
});
