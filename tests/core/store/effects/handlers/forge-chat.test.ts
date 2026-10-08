import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore, combineReducers } from "nai-store";
import {
  forgeChatHandler,
  executeForgeCommand,
} from "../../../../../src/core/store/effects/handlers/forge-chat";
import type { CompletionContext } from "../../../../../src/core/store/effects/generation-handlers";
import type {
  RootState,
  WorldEntity,
  Thread,
  AppDispatch,
} from "../../../../../src/core/store/types";
import {
  worldSlice,
  initialWorldState,
  entityForged,
  threadCreated,
  threadLedgerUpdated,
  threadWishSet,
} from "../../../../../src/core/store/slices/world";
import { FieldID } from "../../../../../src/config/field-definitions";
import type { ForgeSegment } from "../../../../../src/core/chat-types/types";
import {
  THREAD_REPAIR,
  type ParsedCommand,
} from "../../../../../src/core/utils/crucible-command-parser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function segmentsFromCompletion(calls: any[][]): ForgeSegment[] {
  const call = calls.find(([a]) => a.type === "chat/forgeSegmentsSet");
  return call ? (call[0].payload.segments ?? []) : [];
}

type ForgeChatTarget = { type: "forgeChat"; chatId: string; messageId: string };

function makeEntity(over: Partial<WorldEntity>): WorldEntity {
  return {
    id: "e",
    categoryId: FieldID.DramatisPersonae,
    name: "X",
    summary: "",
    lifecycle: "draft",
    ...over,
  } as WorldEntity;
}

function makeState(entities: WorldEntity[] = []): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const e of entities) entitiesById[e.id] = e;
  return {
    world: { threads: [], entitiesById, entityIds: entities.map((e) => e.id) },
  } as unknown as RootState;
}

function imported(name: string, summary: string, entryId?: string) {
  return makeEntity({
    id: `id-${name}`,
    name,
    summary,
    lifecycle: "live",
    ...(entryId ? { lorebookEntryId: entryId } : {}),
  });
}

/** A real store (real world reducer) so the commands' effects can be read back. */
function harness(seed: { entities?: WorldEntity[]; threads?: unknown[] } = {}) {
  const entities = seed.entities ?? [];
  const entitiesById: Record<string, WorldEntity> = {};
  for (const e of entities) entitiesById[e.id] = e;
  const store = createStore<{ world: typeof initialWorldState }>(
    combineReducers({ world: worldSlice.reducer }),
    false,
  );
  // Seed through the store's own reducer: forge each entity, create each thread.
  for (const e of entities) store.dispatch(entityForged({ entity: e }));
  for (const t of (seed.threads ?? []) as Thread[]) {
    store.dispatch(threadCreated({ thread: t }));
  }
  return {
    getState: () => store.getState() as unknown as RootState,
    dispatch: store.dispatch as AppDispatch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.v1.lorebook.entries).mockResolvedValue([]);
  vi.mocked(api.v1.lorebook.createEntry).mockResolvedValue("e-new");
  vi.mocked(api.v1.lorebook.updateEntry).mockResolvedValue(undefined);
  vi.mocked(api.v1.lorebook.removeEntry).mockResolvedValue(undefined);
});

describe("forgeChatHandler.streaming", () => {
  it("dispatches messageAppended with the delta", () => {
    const dispatch = vi.fn();
    forgeChatHandler.streaming(
      {
        target: {
          type: "forgeChat",
          chatId: "c1",
          messageId: "m1",
        } as ForgeChatTarget,
        getState: vi.fn(() => makeState()),
        dispatch,
        accumulatedText: "[",
      },
      "CREATE",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "chat/messageAppended",
      payload: { chatId: "c1", id: "m1", content: "CREATE" },
    });
  });
});

describe("forgeChatHandler.completion", () => {
  it("stores canonicalized content (bare TYPE → CREATE) and forges the draft", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText:
        '[SYSTEM: "Apartment Evolution" | progressive transformation]',
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const updateCall = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageUpdated",
    );
    expect(updateCall![0].payload.content).toBe(
      '[CREATE SYSTEM "Apartment Evolution" | progressive transformation]',
    );
    const forged = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityForged",
    );
    expect(forged).toBeDefined();
    expect(forged![0].payload.entity.name).toBe("Apartment Evolution");
  });

  it("strips thinking tags and writes cleaned text via messageUpdated", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: '</think>[CREATE CHARACTER "A" | foo]',
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const updateCall = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageUpdated",
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].payload.content).toBe('[CREATE CHARACTER "A" | foo]');
  });

  it("creates a LIVE entity bound to a lorebook entry on CREATE", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: '[CREATE CHARACTER "Vesper" | paranoid governess]',
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const forged = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityForged",
    );
    expect(forged).toBeDefined();
    expect(forged![0].payload.entity.lifecycle).toBe("live");
    expect(forged![0].payload.entity.sourceChatId).toBe("c1");
    expect(forged![0].payload.entity.lorebookEntryId).toBe("e-new");
    expect(api.v1.lorebook.createEntry).toHaveBeenCalledTimes(1);
  });

  it("REVISE on a non-existent name creates a live Character (find-or-create)", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: '[REVISE "Wholly New" | a stranger from the marsh]',
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const forged = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityForged",
    );
    expect(forged).toBeDefined();
    expect(forged![0].payload.entity.name).toBe("Wholly New");
    expect(forged![0].payload.entity.lifecycle).toBe("live");
    expect(forged![0].payload.entity.categoryId).toBe(FieldID.DramatisPersonae);
    expect(forged![0].payload.entity.sourceChatId).toBe("c1");
  });

  it("permits REVISE on a draft entity", async () => {
    const dispatch = vi.fn();
    const draft = makeEntity({
      id: "d1",
      name: "Vesper",
      lifecycle: "draft",
      summary: "old",
      sourceChatId: "c1",
    });
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState([draft]),
      dispatch,
      accumulatedText: '[REVISE "Vesper" | new summary]',
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const updated = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entitySummaryUpdated",
    );
    expect(updated).toBeDefined();
    expect(updated![0].payload.summary).toBe("new summary");
  });

  it("removes the empty placeholder turn on empty accumulatedText", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: "",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const removed = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageRemoved",
    );
    expect(removed).toBeDefined();
    expect(removed![0].payload).toEqual({ chatId: "c1", id: "m1" });
  });
});

describe("forgeChatHandler.completion — segments", () => {
  it("interleaves prose and an applied CREATE chip in document order", async () => {
    const dispatch = vi.fn();
    await forgeChatHandler.completion({
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: [
        "Let me sketch the apartment.",
        '[CREATE SYSTEM "Apartment Evolution" | progressive transformation]',
        "That anchors the dread.",
      ].join("\n"),
      generationSucceeded: true,
    } as CompletionContext<ForgeChatTarget>);
    const segs = segmentsFromCompletion(dispatch.mock.calls);
    expect(segs.map((s) => s.kind)).toEqual(["prose", "action", "prose"]);
    expect(segs[1]).toEqual({
      kind: "action",
      action: {
        kind: "CREATE",
        status: "applied",
        elementType: "SYSTEM",
        name: "Apartment Evolution",
        entityId: expect.any(String),
        undo: {
          op: "entityCreated",
          entityId: expect.any(String),
          entryCreated: true,
        },
        body: [
          { label: "Type", text: "SYSTEM" },
          { label: "Summary", text: "progressive transformation" },
        ],
      },
    });
  });

  it("emits an unrecognized chip for a known-verb typo", async () => {
    const dispatch = vi.fn();
    await forgeChatHandler.completion({
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: '[CREATE SYSTm "X" | desc]',
      generationSucceeded: true,
    } as CompletionContext<ForgeChatTarget>);
    expect(segmentsFromCompletion(dispatch.mock.calls)).toEqual([
      {
        kind: "action",
        action: {
          kind: "UNKNOWN",
          status: "unrecognized",
          reason: '[CREATE SYSTm "X" | desc]',
          body: [{ label: "Written", text: '[CREATE SYSTm "X" | desc]' }],
        },
      },
    ]);
  });

  it("records a CREATE chip when REVISE targets a missing entity (find-or-create)", async () => {
    const dispatch = vi.fn();
    await forgeChatHandler.completion({
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: '[REVISE "Ghost" | flickers]',
      generationSucceeded: true,
    } as CompletionContext<ForgeChatTarget>);
    expect(segmentsFromCompletion(dispatch.mock.calls)[0]).toEqual({
      kind: "action",
      action: {
        kind: "CREATE",
        status: "applied",
        elementType: "CHARACTER",
        name: "Ghost",
        entityId: expect.any(String),
        undo: {
          op: "entityCreated",
          entityId: expect.any(String),
          entryCreated: true,
        },
        body: [{ label: "Summary", text: "flickers" }],
      },
    });
  });
});

describe("forgeChatHandler.completion — THREAD", () => {
  it("lands a thread with its state, a blank private note and the default status", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () =>
        makeState([
          makeEntity({ id: "e1", name: "Ada" }),
          makeEntity({ id: "e2", name: "Bram" }),
        ]),
      dispatch,
      accumulatedText:
        '[THREAD "The hidden letter" | "Ada", "Bram" | Ada keeps a sealed letter from Bram. | | ]',
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);

    const created = dispatch.mock.calls.find(
      ([a]) => a.type === "world/threadCreated",
    );
    expect(created).toBeDefined();

    // Asserted through the reducer, because that is where the defaults live.
    // The Forge's grammar has no vocabulary for status, so its payload
    // legitimately omits it — and the thread must still land complete.
    const state = worldSlice.reducer(initialWorldState, created![0]);
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0].status).toBe("open");
    expect(state.threads[0].state).toBe("Ada keeps a sealed letter from Bram.");
    expect(state.threads[0].latent).toBe("");
    expect(state.threads[0].entityIds).toEqual(["e1", "e2"]);
  });

  it("creates no Thread from the old four-segment form, and says how to write it", async () => {
    const dispatch = vi.fn();
    await forgeChatHandler.completion({
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () =>
        makeState([
          makeEntity({ id: "e1", name: "A" }),
          makeEntity({ id: "e2", name: "B" }),
        ]),
      dispatch,
      accumulatedText: '[THREAD "T" | "A", "B" | state | private]',
      generationSucceeded: true,
    } as CompletionContext<ForgeChatTarget>);

    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/threadCreated"),
    ).toBe(false);
    const actions = segmentsFromCompletion(dispatch.mock.calls).filter(
      (seg) => seg.kind === "action",
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toMatchObject({
      status: "unrecognized",
      reason: THREAD_REPAIR,
      body: [
        { label: "Written", text: '[THREAD "T" | "A", "B" | state | private]' },
      ],
    });
  });
});

describe("a THREAD command, applied", () => {
  const entity = (id: string, name: string) => ({
    id,
    name,
    summary: "",
    categoryId: FieldID.DramatisPersonae,
    lifecycle: "draft" as const,
  });
  const stateWith = (threads: unknown[]) =>
    ({
      world: {
        threads,
        entitiesById: {
          h: entity("h", "Hesper Vane"),
          c: entity("c", "Corin Vane"),
        },
        entityIds: ["h", "c"],
      },
    }) as unknown as RootState;
  const cmd = {
    kind: "THREAD" as const,
    title: "Half the House",
    memberNames: ["Hesper Vane", "Corin Vane"],
    state: "He sold his half.",
    latent: "He was paid already.",
    wish: "She floods the cut.",
  };
  const run = async (state: RootState, command: typeof cmd) => {
    const dispatch = vi.fn();
    const record = await executeForgeCommand(
      command,
      "chat",
      "msg",
      () => state,
      dispatch,
    );
    return { dispatch, record };
  };

  it("creates a Thread carrying its wish", async () => {
    const { dispatch, record } = await run(stateWith([]), cmd);
    expect(record.status).toBe("applied");
    const created = dispatch.mock.calls[0][0];
    expect(created.type).toBe(threadCreated.type);
    expect(created.payload.thread).toMatchObject({
      title: "Half the House",
      state: "He sold his half.",
      latent: "He was paid already.",
      wish: "She floods the cut.",
      entityIds: ["h", "c"],
    });
  });

  it("creates a Thread with one member", async () => {
    const { record } = await run(stateWith([]), {
      ...cmd,
      memberNames: ["Hesper Vane"],
    });
    expect(record.status).toBe("applied");
  });

  it("rejects a new Thread naming someone who is not a known element, though the others are", async () => {
    const { dispatch, record } = await run(stateWith([]), {
      ...cmd,
      memberNames: ["Hesper Vane", "Nobody", "No One Else"],
    });
    expect(record).toMatchObject({
      kind: "THREAD",
      status: "rejected",
      name: "Half the House",
      reason:
        'unknown member "Nobody"; name only elements under [WORLD], spelled exactly',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects a new Thread none of whose members is known, for the same reason", async () => {
    const { dispatch, record } = await run(stateWith([]), {
      ...cmd,
      memberNames: ["Nobody"],
    });
    expect(record).toMatchObject({
      status: "rejected",
      reason:
        'unknown member "Nobody"; name only elements under [WORLD], spelled exactly',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  const existing = {
    id: "t1",
    title: "half the house",
    state: "old state",
    latent: "old private",
    wish: "old wish",
    entityIds: ["h", "c"],
    status: "open",
  };

  it("rewrites the open Thread with the same title", async () => {
    const { dispatch, record } = await run(stateWith([existing]), cmd);
    expect(record.status).toBe("applied");
    expect(dispatch).toHaveBeenCalledWith(
      threadLedgerUpdated({
        threadId: "t1",
        state: "He sold his half.",
        latent: "He was paid already.",
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      threadWishSet({ threadId: "t1", wish: "She floods the cut." }),
    );
  });

  it("keeps the stored private notes and wish when the rewrite leaves them empty", async () => {
    const { dispatch } = await run(stateWith([existing]), {
      ...cmd,
      latent: "",
      wish: "",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      threadLedgerUpdated({
        threadId: "t1",
        state: "He sold his half.",
        latent: "old private",
      }),
    );
  });

  it("does not rewrite a concluded Thread", async () => {
    const { dispatch, record } = await run(
      stateWith([{ ...existing, status: "concluded" }]),
      cmd,
    );
    expect(record).toMatchObject({
      status: "rejected",
      reason: "is concluded and cannot be rewritten",
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("a rejection says how to repair it", () => {
  const draft = makeEntity({ id: "d", name: "Vesper" });
  const live = makeEntity({ id: "l", name: "Ilsa", lifecycle: "live" });
  const reasonFor = async (
    command: ParsedCommand,
  ): Promise<string | undefined> => {
    const dispatch = vi.fn();
    const state = makeState([draft, live]);
    const record = await executeForgeCommand(
      command,
      "c1",
      "m1",
      () => state,
      dispatch,
    );
    expect(record.status).toBe("rejected");
    expect(dispatch).not.toHaveBeenCalled();
    return record.reason;
  };
  const create = (
    name: string,
    content = "x",
    elementType = "CHARACTER",
  ): ParsedCommand => ({ kind: "CREATE", elementType, name, content });
  const revise = (name: string, content = "x"): ParsedCommand => ({
    kind: "REVISE",
    name,
    content,
  });
  const rename = (oldName: string, newName: string): ParsedCommand => ({
    kind: "RENAME",
    oldName,
    newName,
  });
  const NOT_BUILT = "was not built here and cannot be deleted from the chat";
  const NOT_FOUND = "not found; name an element under [WORLD], spelled exactly";
  const NO_SUMMARY = "needs a summary after the bar";

  it.each<[string, ParsedCommand, string]>([
    [
      "CREATE of a name that exists",
      create("Vesper"),
      "already exists; REVISE it instead",
    ],
    ["CREATE with no summary", create("New", " "), NO_SUMMARY],
    ["REVISE with no summary", revise("Vesper", " "), NO_SUMMARY],
    [
      "CREATE of an unknown type",
      create("New", "x", "WIDGET"),
      "unknown type; use CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION or TOPIC",
    ],
    [
      "DELETE of an element no chat built",
      { kind: "DELETE", name: "Ilsa" },
      NOT_BUILT,
    ],
    [
      "RENAME to its own name",
      rename("Ilsa", "Ilsa"),
      "is already its name; write no RENAME for it",
    ],
    [
      "RENAME to another element's name",
      rename("Ilsa", "vesper"),
      "is the name of another element; choose a different name",
    ],
    ["DELETE of no one", { kind: "DELETE", name: "Nobody" }, NOT_FOUND],
    ["RENAME of no one", rename("Nobody", "Somebody"), NOT_FOUND],
    [
      "RENAME to nothing",
      rename("Vesper", " "),
      "needs a new name after the arrow",
    ],
  ])("%s", async (_case, command, reason) => {
    expect(await reasonFor(command)).toBe(reason);
  });
});

describe("a Build command writes for real", () => {
  const createMikki: ParsedCommand = {
    kind: "CREATE",
    elementType: "CHARACTER",
    name: "Mikki",
    content: "A fox.",
  };

  it("CREATE makes a live entity bound to an entry, and records how to undo it", async () => {
    const { getState, dispatch } = harness();
    const rec = await executeForgeCommand(
      createMikki,
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const made = Object.values(getState().world.entitiesById)[0];
    expect(made).toMatchObject({
      name: "Mikki",
      summary: "A fox.",
      lifecycle: "live",
      lorebookEntryId: "e-new",
      sourceChatId: "c1",
    });
    expect(rec).toMatchObject({
      kind: "CREATE",
      status: "applied",
      entityId: made.id,
      undo: { op: "entityCreated", entityId: made.id, entryCreated: true },
    });
  });

  it("CREATE is rejected, and makes nothing, when the lorebook refuses", async () => {
    vi.mocked(api.v1.lorebook.createEntry).mockRejectedValue(new Error("full"));
    const { getState, dispatch } = harness();
    const rec = await executeForgeCommand(
      createMikki,
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(rec.status).toBe("rejected");
    expect(rec.reason).toContain("full");
    expect(Object.keys(getState().world.entitiesById)).toHaveLength(0);
  });

  it("REVISE rewrites any entity's summary and records what it replaced", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "Old.")],
    });
    const rec = await executeForgeCommand(
      { kind: "REVISE", name: "Kei", content: "New." },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const kei = Object.values(getState().world.entitiesById)[0];
    expect(kei.summary).toBe("New.");
    expect(rec.undo).toEqual({
      op: "summary",
      entityId: kei.id,
      before: "Old.",
      wrote: "New.",
    });
  });

  it("RENAME renames the entity and its entry", async () => {
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue({
      id: "e1",
      displayName: "Kei",
      keys: ["kei"],
    });
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "S.", "e1")],
    });
    const rec = await executeForgeCommand(
      { kind: "RENAME", oldName: "Kei", newName: "Kay" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const kay = Object.values(getState().world.entitiesById)[0];
    expect(kay.name).toBe("Kay");
    expect(api.v1.lorebook.updateEntry).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ displayName: "Kay" }),
    );
    expect(rec.undo).toEqual({
      op: "name",
      entityId: kay.id,
      before: "Kei",
      wrote: "Kay",
    });
  });

  it("RENAME to the same name, or to a name in use, is rejected", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "S."), imported("Mikki", "S.")],
    });
    const same = await executeForgeCommand(
      { kind: "RENAME", oldName: "Kei", newName: "Kei" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const taken = await executeForgeCommand(
      { kind: "RENAME", oldName: "Kei", newName: "mikki" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(same.status).toBe("rejected");
    expect(taken.status).toBe("rejected");
  });

  it("DELETE removes an entity a Scenario chat built, with its entry", async () => {
    const entry = {
      id: "e1",
      displayName: "Kei",
      text: "Lore.",
      keys: ["kei"],
    };
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue(entry);
    const built = { ...imported("Kei", "S.", "e1"), sourceChatId: "c0" };
    const { getState, dispatch } = harness({ entities: [built] });
    const rec = await executeForgeCommand(
      { kind: "DELETE", name: "Kei" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(getState().world.entitiesById[built.id]).toBeUndefined();
    expect(api.v1.lorebook.removeEntry).toHaveBeenCalledWith("e1");
    expect(rec.undo).toMatchObject({
      op: "entityDeleted",
      entity: built,
      entry,
      threadIds: [],
    });
  });

  it("DELETE of an entity no Scenario chat built is rejected with the repair", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("Kei", "S.", "e1")],
    });
    const rec = await executeForgeCommand(
      { kind: "DELETE", name: "Kei" },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(rec).toMatchObject({
      status: "rejected",
      reason: "was not built here and cannot be deleted from the chat",
    });
    expect(api.v1.lorebook.removeEntry).not.toHaveBeenCalled();
  });

  it("a THREAD rewrite records the three texts before and after, positionally", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("A", "s"), imported("B", "s")],
      threads: [
        {
          id: "t1",
          title: "Half",
          state: "S0",
          latent: "P0",
          wish: "W0",
          entityIds: [],
          status: "open",
        },
      ],
    });
    const rec = await executeForgeCommand(
      {
        kind: "THREAD",
        title: "half",
        memberNames: ["A"],
        state: "S1",
        latent: "",
        wish: "W1",
      },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    expect(rec).toMatchObject({
      status: "applied",
      threadId: "t1",
      undo: {
        op: "threadRewritten",
        threadId: "t1",
        before: ["S0", "P0", "W0"],
        wrote: ["S1", "P0", "W1"],
      },
    });
  });

  it("a new THREAD records its id", async () => {
    const { getState, dispatch } = harness({
      entities: [imported("A", "s"), imported("B", "s")],
    });
    const rec = await executeForgeCommand(
      {
        kind: "THREAD",
        title: "Half",
        memberNames: ["A", "B"],
        state: "S",
        latent: "",
        wish: "",
      },
      "c1",
      "m1",
      getState,
      dispatch,
    );
    const t = getState().world.threads[0];
    expect(rec).toMatchObject({
      threadId: t.id,
      undo: { op: "threadCreated", threadId: t.id },
    });
  });
});
