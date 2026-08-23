import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStore, type Store } from "nai-store";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import { initialWorldState } from "../../../src/core/store/slices/world";
import {
  threadRenamed,
  threadMemberToggled,
  threadHorizonSet,
  threadTextUpdated,
} from "../../../src/core/store/slices/world";
import { uiLorebookEntrySelected } from "../../../src/core/store/slices/ui";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../../src/core/store/types";
import {
  castFromSubject,
  createThreadEntry,
  rebuildThreadCondition,
  registerThreadConditionEffects,
  resolveThreadCondition,
  resolveThreadMembers,
  SE_THREAD_CATEGORY,
} from "../../../src/core/engine/thread-bind";
import { THREAD_RANGE_CHARS } from "../../../src/core/engine/thread-horizon";
import { lorebookRecordKey } from "../../../src/core/engine/lorebook-write";
import { EDIT_PANE_TITLE, lorebookOriginalKey } from "../../../src/core/keys";
import {
  installHistoryFake,
  type HistoryFake,
} from "../../helpers/history-fake";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

// ─────────────────────────────── the harness ───────────────────────────────

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    title: "The hidden letter",
    text: "Ada still has not told Brennan what the letter said.",
    horizon: "plot",
    entityIds: ["e1"],
    status: "open",
    anchorParagraph: null,
    ...over,
  };
}

function entity(id: string, name: string, over: Partial<WorldEntity> = {}) {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: "",
    ...over,
  } as WorldEntity;
}

let history: HistoryFake;
let lorebook: LorebookFake;
let story: StoryStorageFake;

function harness(
  threads: Thread[] = [thread()],
  entities: WorldEntity[] = [entity("e1", "Ada", { lorebookEntryId: "lb-e1" })],
): Store<RootState> {
  const store = createStore<RootState>(rootReducer);
  store.dispatch(
    persistedDataLoaded({
      world: {
        ...initialWorldState,
        threads,
        entityIds: entities.map((e) => e.id),
        entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
      },
    }),
  );
  return store;
}

/** The keys a built condition probes for, in order. The structure itself is
 *  `thread-condition.test.ts`'s subject; what matters here is WHICH strings
 *  the resolution put in it. */
function probes(conditions: LorebookCondition[]): string[] {
  const [outer] = conditions;
  if (outer?.type !== "not") return [];
  const inner = outer.condition;
  const list = inner.type === "or" ? inner.conditions : [inner];
  return list.map((c) => (c.type === "key" ? c.key : `<${c.type}>`));
}

beforeEach(() => {
  vi.mocked(api.v1.config.get).mockResolvedValue(false);
  history = installHistoryFake();
  lorebook = installLorebookFake();
  story = installStoryStorageFake();
});

// ──────────────────────────── resolving the cast ────────────────────────────

describe("resolveThreadMembers — DRAFT > LOREBOOK > STATE", () => {
  it("prefers the entry's displayName over the entity's name", async () => {
    // CLAUDE.md's hierarchy, and the reason `ThreadMember` exists: the writer
    // renamed the entry in their own lorebook and Story Engine does not chase
    // the move, so `entity.name` is the layer allowed to be stale. A probe
    // built from it watches for a string the prose no longer uses.
    lorebook.seed({ id: "lb-e1", displayName: "Adalind", text: "" });
    const store = harness();

    const members = await resolveThreadMembers(store.getState(), thread());

    expect(members).toEqual([{ id: "e1", displayName: "Adalind" }]);
  });

  it("prefers the open edit pane's unsaved title over both", async () => {
    lorebook.seed({ id: "lb-e1", displayName: "Adalind", text: "" });
    const store = harness();
    store.dispatch(
      uiLorebookEntrySelected({ entryId: "lb-e1", categoryId: null }),
    );
    story.set(EDIT_PANE_TITLE, "Ada of the Vault");

    const members = await resolveThreadMembers(store.getState(), thread());

    expect(members[0].displayName).toBe("Ada of the Vault");
  });

  it("falls back to the entity's name for a draft with no entry", async () => {
    const store = harness(
      [thread()],
      [entity("e1", "Ada", { lifecycle: "draft" })],
    );

    const members = await resolveThreadMembers(store.getState(), thread());

    expect(members).toEqual([{ id: "e1", displayName: "Ada" }]);
  });

  it("drops a member the World no longer holds", async () => {
    const store = harness([thread({ entityIds: ["e1", "gone"] })]);

    const members = await resolveThreadMembers(
      store.getState(),
      thread({ entityIds: ["e1", "gone"] }),
    );

    expect(members.map((m) => m.id)).toEqual(["e1"]);
  });

  it("drops a member nothing can name, rather than probing for a placeholder", async () => {
    // `resolveDisplayName` answers "Unnamed Entry" when every layer is blank.
    // That is a sentence, not a name: probed for, it never matches, the
    // negation is always true, and the thread fires forever — the always-on
    // entry the detector exists to replace.
    lorebook.seed({ id: "lb-e1", text: "" });
    const store = harness(
      [thread()],
      [entity("e1", "", { lorebookEntryId: "lb-e1" })],
    );

    const members = await resolveThreadMembers(store.getState(), thread());

    expect(members).toEqual([]);
  });
});

describe("castFromSubject", () => {
  const cast = [entity("e1", "Ada"), entity("e2", "Brennan")];

  it("takes the entities the subject names", () => {
    expect(castFromSubject("Ada's promise to Brennan", cast)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("matches whole words only", () => {
    expect(castFromSubject("the adamant seal", cast)).toEqual([]);
  });

  it("is empty when the subject names nobody", () => {
    expect(castFromSubject("the sealed letter", cast)).toEqual([]);
  });

  it("ignores a nameless entity", () => {
    expect(castFromSubject("anything at all", [entity("e3", "  ")])).toEqual(
      [],
    );
  });
});

// ─────────────────────────────── the condition ───────────────────────────────

describe("resolveThreadCondition", () => {
  it("probes for the resolved names, not the World's copy of them", async () => {
    lorebook.seed({ id: "lb-e1", displayName: "Adalind", text: "" });
    const store = harness();

    const condition = await resolveThreadCondition(store.getState(), thread());

    expect(probes(condition)).toEqual(["the hidden letter", "adalind"]);
  });
});

// ───────────────────────────── creating the entry ─────────────────────────────

describe("createThreadEntry", () => {
  it("files the entry in its own SE category", async () => {
    const store = harness();

    await createThreadEntry(store.getState(), thread());

    const category = lorebook
      .categories()
      .find((c) => c.name === SE_THREAD_CATEGORY);
    expect(category).toBeDefined();
    expect(lorebook.created()[0].category).toBe(category?.id);
  });

  it("carries the thread's reminder prose and its forgetting detector", async () => {
    const store = harness();

    const entryId = await createThreadEntry(store.getState(), thread());

    const entry = lorebook.read(entryId);
    expect(entry?.displayName).toBe("The hidden letter");
    expect(entry?.text).toBe(
      "Ada still has not told Brennan what the letter said.",
    );
    expect(entry?.enabled).toBe(true);
    expect(probes(entry?.advancedConditions ?? [])).toEqual([
      "the hidden letter",
      "ada",
    ]);
  });

  it("is always on, because the detector fires on ABSENCE", async () => {
    // A key-activated entry needs its key present to be considered at all, and
    // the condition negates the very same string — the entry could then never
    // fire, which is §4.3's contradiction arriving through the keys instead of
    // through a `lore` gate. So the entry is force-activated and the condition
    // is the gate; it carries no keys of its own for the same reason.
    const store = harness();

    const entryId = await createThreadEntry(store.getState(), thread());

    expect(lorebook.read(entryId)?.forceActivation).toBe(true);
    expect(lorebook.read(entryId)?.keys ?? []).toEqual([]);
  });

  it("carries the erato divider when the writer has that on", async () => {
    // A thread's entry is a lorebook entry like any other. With
    // `erato_compatibility` on the SE categories carry no entry header and the
    // divider lives in the text instead, so an entry created without it is the
    // one entry in the writer's book missing its separator.
    vi.mocked(api.v1.config.get).mockResolvedValue(true);
    const store = harness();

    const entryId = await createThreadEntry(store.getState(), thread());

    expect(lorebook.read(entryId)?.text).toBe(
      "----\nAda still has not told Brennan what the letter said.",
    );
  });

  it("ranges the probe by the thread's horizon", async () => {
    const store = harness([thread({ horizon: "arc" })]);

    const entryId = await createThreadEntry(
      store.getState(),
      thread({ horizon: "arc" }),
    );

    const [outer] = lorebook.read(entryId)?.advancedConditions ?? [];
    const inner = outer?.type === "not" ? outer.condition : undefined;
    const first = inner?.type === "or" ? inner.conditions[0] : inner;
    expect(first?.type === "key" && first.range).toBe(THREAD_RANGE_CHARS.arc);
  });
});

// ──────────────────────────── rebuilding the condition ────────────────────────────

describe("rebuildThreadCondition", () => {
  it("writes the new condition when the title changed", async () => {
    const store = harness();
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));
    store.dispatch(
      threadRenamed({ threadId: "t1", title: "The Duke's letter" }),
    );

    await rebuildThreadCondition(store.getState, "t1", history.current());

    expect(probes(lorebook.read(entryId)?.advancedConditions ?? [])).toEqual([
      "the duke's letter",
      "ada",
    ]);
  });

  it("goes through the write door, so §5.2's original exists", async () => {
    const store = harness();
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));

    await rebuildThreadCondition(store.getState, "t1", history.current());

    expect(story.get(lorebookOriginalKey(entryId))).toMatchObject({
      id: entryId,
    });
  });

  it("writes no lb: record, because it wrote no text", async () => {
    // §7 compares text fingerprints. A condition rebuild changes nothing a
    // reconciliation could compare, and a record claiming otherwise would tell
    // §7 the Engine owns prose it never wrote.
    const store = harness();
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));

    await rebuildThreadCondition(store.getState, "t1", history.current());

    expect(
      await api.v1.historyStorage.get(
        lorebookRecordKey(entryId),
        history.current(),
      ),
    ).toBeUndefined();
  });

  it("leaves the entry's text alone", async () => {
    const store = harness();
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));
    store.dispatch(threadTextUpdated({ threadId: "t1", text: "changed" }));

    await rebuildThreadCondition(store.getState, "t1", history.current());

    expect(lorebook.read(entryId)?.text).toBe(
      "Ada still has not told Brennan what the letter said.",
    );
  });

  it("writes nothing for a thread with no entry behind it", async () => {
    const store = harness();

    await rebuildThreadCondition(store.getState, "t1", history.current());

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });

  it("writes nothing for a thread the World no longer holds", async () => {
    const store = harness();

    await rebuildThreadCondition(store.getState, "gone", history.current());

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });
});

/** The bind `open` performs, spelled out here so the rebuild cases start from
 *  a thread that actually has an entry. */
function rebound(entryId: string) {
  return {
    type: "world/threadLorebookEntrySet",
    payload: { threadId: "t1", entryId },
  };
}

// ─────────────────────────────── the three triggers ───────────────────────────────

describe("registerThreadConditionEffects", () => {
  /** Everything the effect needs, and a way to wait for the async body it
   *  starts: the store's effects are fire-and-forget, so a test has to let the
   *  microtask queue drain before reading the lorebook. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  async function wired() {
    const store = harness();
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));
    registerThreadConditionEffects(store.subscribeEffect, store.getState);
    return { store, entryId };
  }

  it("rebuilds on a rename, so no detector is left probing the old name", async () => {
    const { store, entryId } = await wired();

    store.dispatch(
      threadRenamed({ threadId: "t1", title: "The Duke's letter" }),
    );
    await settle();

    expect(probes(lorebook.read(entryId)?.advancedConditions ?? [])).toContain(
      "the duke's letter",
    );
  });

  it("rebuilds when the cast changes", async () => {
    const { store, entryId } = await wired();

    store.dispatch(threadMemberToggled({ threadId: "t1", entityId: "e1" }));
    await settle();

    expect(
      probes(lorebook.read(entryId)?.advancedConditions ?? []),
    ).not.toContain("ada");
  });

  it("rebuilds when the horizon changes", async () => {
    const { store, entryId } = await wired();

    store.dispatch(threadHorizonSet({ threadId: "t1", horizon: "point" }));
    await settle();

    const [outer] = lorebook.read(entryId)?.advancedConditions ?? [];
    const inner = outer?.type === "not" ? outer.condition : undefined;
    const first = inner?.type === "or" ? inner.conditions[0] : inner;
    expect(first?.type === "key" && first.range).toBe(THREAD_RANGE_CHARS.point);
  });

  it("is wired into registerEffects", () => {
    // The subscription proves nothing on its own: nothing imports this module
    // for its side effects, so leaving the registration out is a silent,
    // all-tests-green way to ship threads whose detectors never update. Same
    // guard, same reason, as the Engine loop's own.
    const wiring = readFileSync(
      join(__dirname, "../../../src/core/store/register-effects.ts"),
      "utf8",
    );
    expect(wiring).toContain("registerThreadConditionEffects(");
  });

  it("does not rebuild for an edit the condition does not read", async () => {
    const { store } = await wired();

    store.dispatch(threadTextUpdated({ threadId: "t1", text: "reworded" }));
    await settle();

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });
});
