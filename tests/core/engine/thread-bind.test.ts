import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStore, type Store } from "nai-store";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import { initialWorldState } from "../../../src/core/store/slices/world";
import {
  threadAnchorSet,
  threadCreated,
  threadDeleted,
  threadRenamed,
  threadMemberToggled,
  threadHorizonSet,
  threadTextUpdated,
  threadStatusSet,
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
  applyThreadStatus,
  rebuildThreadCondition,
  registerThreadConditionEffects,
  resolveThreadCondition,
  resolveThreadMembers,
  SE_THREAD_CATEGORY,
} from "../../../src/core/engine/thread-bind";
import {
  THREAD_GRACE_PARAGRAPHS,
  THREAD_RANGE_CHARS,
} from "../../../src/core/engine/thread-horizon";
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

  it("does NOT take the open edit pane's unsaved title, because nobody is watching", async () => {
    // The DRAFT layer exists so a HAND-PRESSED Generate reflects what the
    // writer just typed. `EDIT_PANE_TITLE` is mirrored on every keystroke, so
    // it is a name part-way through being typed rather than a name — and this
    // caller turns a name into a `{type: "key"}` probe. A probe for "Ada of"
    // matches nothing the prose contains, so the negation is always true and
    // the thread reminds forever: exactly what `UNNAMED_ENTRY` is dropped to
    // avoid, arriving by another door.
    lorebook.seed({ id: "lb-e1", displayName: "Adalind", text: "" });
    const store = harness();
    store.dispatch(
      uiLorebookEntrySelected({ entryId: "lb-e1", categoryId: null }),
    );
    story.set(EDIT_PANE_TITLE, "Ada of");

    const members = await resolveThreadMembers(store.getState(), thread());

    expect(members[0].displayName).toBe("Adalind");
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
    // through a `lore` gate. So the entry carries no keys — and it must NOT be
    // force-activated either: the probe measured `forceActivation` overriding
    // `advancedConditions` outright, so an always-on thread entry is one whose
    // detector never fires. The condition does the activating by itself.
    const store = harness();

    const entryId = await createThreadEntry(store.getState(), thread());

    expect(lorebook.read(entryId)?.forceActivation).toBe(false);
    expect(lorebook.read(entryId)?.keys ?? []).toEqual([]);
  });

  it("never force-activates, however the condition is built", async () => {
    // The regression this guards is silent and total: an always-on entry with a
    // detector reads exactly like a working one in every test that inspects the
    // condition, because the condition IS there — it is just never consulted.
    // Phases 5 and 6 both shipped that, and two tests asserted it as a
    // guarantee. Whatever else changes about the shape, this must not come back.
    for (const t of [
      thread(),
      thread({ horizon: "arc", anchorParagraph: 12 }),
      thread({ entityIds: [], title: "" }),
    ]) {
      const store = harness([t]);
      const entryId = await createThreadEntry(store.getState(), t);
      expect(lorebook.read(entryId)?.forceActivation).toBe(false);
    }
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
    registerThreadConditionEffects(
      store.subscribeEffect,
      store.getState,
      store.dispatch,
    );
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

  it("rebuilds when the anchor moves, so the gate follows the renewal", async () => {
    // The fourth trigger, and it exists because the anchor is BAKED INTO the
    // stored condition: a renewal that did not rebuild would leave the entry
    // gating on the paragraph the thread was opened at, which is the grace the
    // renewal was supposed to restart.
    const { store, entryId } = await wired();

    store.dispatch(threadAnchorSet({ threadId: "t1", paragraph: 200 }));
    await settle();

    expect(
      JSON.stringify(lorebook.read(entryId)?.advancedConditions),
    ).toContain(String(200 + THREAD_GRACE_PARAGRAPHS.plot));
  });

  it("switches off the entry of a thread deleted by hand", async () => {
    // The third time this phase makes the same argument, and the worst: after
    // a hand delete nothing will ever name this entry again on any branch, so
    // its always-on note goes on injecting forever with no surface in Story
    // Engine still showing the thread. `applyThreadStatus` and the cap
    // displacement in the drain both answer it where the entry is
    // attributably ours; this is the same rule at the same door.
    const { store, entryId } = await wired();

    store.dispatch(threadDeleted({ threadId: "t1", lorebookEntryId: entryId }));
    await settle();

    expect(lorebook.read(entryId)?.enabled).toBe(false);
  });

  it("disables rather than deletes, and snapshots on the way through", async () => {
    // §5.2: the strongest thing the Engine does to an entry it no longer wants
    // firing is switch it off, and the door takes the original on the way past
    // — creation bypasses the door, so this may be that entry's FIRST
    // snapshot.
    const { store, entryId } = await wired();

    store.dispatch(threadDeleted({ threadId: "t1", lorebookEntryId: entryId }));
    await settle();

    expect(lorebook.read(entryId)).toBeDefined();
    expect(story.get(lorebookOriginalKey(entryId))).toMatchObject({
      id: entryId,
    });
  });

  it("touches the lorebook not at all when the deleted thread had no entry", async () => {
    // A thread the writer created by hand has no lorebook entry, and a delete
    // must not become a lorebook call of any kind for it — not a write, and
    // not the read the door would make before declining one.
    const { store } = await wired();
    vi.mocked(api.v1.lorebook.entry).mockClear();
    vi.mocked(api.v1.lorebook.updateEntry).mockClear();

    store.dispatch(
      threadDeleted({ threadId: "t1", lorebookEntryId: undefined }),
    );
    await settle();

    expect(api.v1.lorebook.entry).not.toHaveBeenCalled();
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });

  it("does not rebuild for an edit the condition does not read", async () => {
    const { store } = await wired();

    store.dispatch(threadTextUpdated({ threadId: "t1", text: "reworded" }));
    await settle();

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });
});

// ──────────────────── the writer's own status press (§4.4, §7) ────────────────────

describe("applyThreadStatus", () => {
  it("switches the entry off when a thread is marked satisfied by hand", async () => {
    const store = harness();
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));
    store.dispatch(threadStatusSet({ threadId: "t1", status: "satisfied" }));

    expect(
      await applyThreadStatus(store.getState, "t1", history.current()),
    ).toBe(true);
    expect(lorebook.read(entryId)?.enabled).toBe(false);
  });

  it("switches the entry back on when a satisfied thread is reopened", async () => {
    const store = harness([thread({ status: "satisfied" })]);
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));
    await api.v1.lorebook.updateEntry(entryId, { enabled: false });
    store.dispatch(threadStatusSet({ threadId: "t1", status: "open" }));

    expect(
      await applyThreadStatus(store.getState, "t1", history.current()),
    ).toBe(true);
    expect(lorebook.read(entryId)?.enabled).toBe(true);
  });

  it("switches the entry off for an abandoned thread too", async () => {
    // §7's rule is "enabled exactly when an OPEN thread names it". An
    // abandoned thread is closed, so its reminder must stop — writing the
    // rule against `!== "satisfied"` would leave it injecting forever.
    const store = harness([thread({ status: "abandoned" })]);
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));

    expect(
      await applyThreadStatus(store.getState, "t1", history.current()),
    ).toBe(true);
    expect(lorebook.read(entryId)?.enabled).toBe(false);
  });

  it("writes nothing when the flag already agrees with the thread", async () => {
    // The drain's retire writes the flag and THEN dispatches, so the effect it
    // triggers must be a no-op rather than a second writer of the same value.
    const store = harness([thread({ status: "satisfied" })]);
    const entryId = await createThreadEntry(store.getState(), thread());
    store.dispatch(rebound(entryId));
    await api.v1.lorebook.updateEntry(entryId, { enabled: false });

    expect(
      await applyThreadStatus(store.getState, "t1", history.current()),
    ).toBe(false);
  });

  it("leaves a hand-made thread with no entry alone", async () => {
    const store = harness();
    expect(
      await applyThreadStatus(store.getState, "t1", history.current()),
    ).toBe(false);
  });

  it("is wired to threadStatusSet, so a press in the pane reaches the entry", () => {
    const source = readFileSync(
      join(process.cwd(), "src/core/engine/thread-bind.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /subscribeEffect\(\s*matchesAction\(threadStatusSet\)/,
    );
  });
});

describe("every named thread gets an entry, whoever made it", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  function wired(threads: Thread[] = []) {
    const store = harness(threads);
    registerThreadConditionEffects(
      store.subscribeEffect,
      store.getState,
      store.dispatch,
    );
    return store;
  }

  it("gives the Forge's [THREAD] an entry as soon as it is created", async () => {
    // The Forge names a thread as it makes it, so there is nothing to wait for.
    const store = wired();
    store.dispatch(
      threadCreated({
        thread: {
          id: "t9",
          title: "The debt",
          text: "Vesper owes the guild.",
          entityIds: [],
        },
      }),
    );
    await settle();

    const [thread] = store.getState().world.threads;
    expect(thread.lorebookEntryId).toBeDefined();
    expect(lorebook.read(thread.lorebookEntryId!)?.displayName).toBe(
      "The debt",
    );
  });

  it("gives the World's untitled '+' nothing until it has a name", async () => {
    // CLAUDE.md's draft rule, for threads: "+ Add Entity" creates a draft and
    // no entry exists until Save, so cancelling leaves no orphan behind. An
    // untitled thread minting an always-on entry would leave exactly that.
    const store = wired();
    store.dispatch(
      threadCreated({
        thread: { id: "t9", title: "", text: "", entityIds: [] },
      }),
    );
    await settle();
    expect(store.getState().world.threads[0].lorebookEntryId).toBeUndefined();

    // Save supplies the title.
    store.dispatch(threadRenamed({ threadId: "t9", title: "The debt" }));
    await settle();
    expect(store.getState().world.threads[0].lorebookEntryId).toBeDefined();
  });

  it("mints one entry however many times the title changes", async () => {
    // The rename subscription is what gives a hand-made thread its entry, so
    // it fires on every later rename too. Without the idempotence guard a
    // writer editing a title three times would own three always-on entries.
    const store = wired();
    store.dispatch(
      threadCreated({
        thread: { id: "t9", title: "First", text: "", entityIds: [] },
      }),
    );
    await settle();
    store.dispatch(threadRenamed({ threadId: "t9", title: "Second" }));
    await settle();
    store.dispatch(threadRenamed({ threadId: "t9", title: "Third" }));
    await settle();

    expect(lorebook.created()).toHaveLength(1);
  });
});
