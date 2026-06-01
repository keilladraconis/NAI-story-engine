import { describe, it, expect, vi } from "vitest";
import {
  forgeChatHandler,
  forgeCleanupHandler,
} from "../../../../../src/core/store/effects/handlers/forge-chat";
import type {
  CompletionContext,
} from "../../../../../src/core/store/effects/generation-handlers";
import type {
  RootState,
  WorldEntity,
} from "../../../../../src/core/store/types";
import { FieldID } from "../../../../../src/config/field-definitions";

type ForgeChatTarget = { type: "forgeChat"; chatId: string; messageId: string };
type ForgeCleanupTarget = {
  type: "forgeCleanup";
  chatId: string;
  messageId: string;
  discardedNames: string[];
};

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

function makeState(
  entities: WorldEntity[] = [],
  tombstonesByChatId: Record<
    string,
    { name: string; category: string; reason: "user" | "model" }[]
  > = {},
): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const e of entities) entitiesById[e.id] = e;
  return {
    world: { groups: [], entitiesById, entityIds: entities.map(e => e.id) },
    forge: { tombstonesByChatId, pendingScrubByChatId: {} },
  } as unknown as RootState;
}

describe("forgeChatHandler.streaming", () => {
  it("dispatches messageAppended with the delta", () => {
    const dispatch = vi.fn();
    forgeChatHandler.streaming({
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" } as ForgeChatTarget,
      getState: vi.fn(() => makeState()),
      dispatch,
      accumulatedText: "[",
    }, "CREATE");
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
      accumulatedText: '[SYSTEM: "Apartment Evolution" | progressive transformation]',
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
      accumulatedText: "</think>[CREATE CHARACTER \"A\" | foo]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const updateCall = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageUpdated",
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].payload.content).toBe(
      "[CREATE CHARACTER \"A\" | foo]",
    );
  });

  it("creates DRAFT entity (no lorebook call) on CREATE", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: "[CREATE CHARACTER \"Vesper\" | paranoid governess]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const forged = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityForged",
    );
    expect(forged).toBeDefined();
    expect(forged![0].payload.entity.lifecycle).toBe("draft");
    expect(forged![0].payload.entity.sourceChatId).toBe("c1");
    expect(forged![0].payload.entity.lorebookEntryId).toBeUndefined();
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
  });

  it("rejects REVISE on a live entity and inserts a warning message", async () => {
    const dispatch = vi.fn();
    const live = makeEntity({
      id: "live-1", name: "OldQuay",
      lifecycle: "live", lorebookEntryId: "lb-1",
      categoryId: FieldID.Locations,
    });
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState([live]),
      dispatch,
      accumulatedText: "[REVISE \"OldQuay\" | rewritten]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/entitySummaryUpdated"),
    ).toBe(false);
    const added = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageAdded",
    );
    expect(added).toBeDefined();
    expect(added![0].payload.message.role).toBe("assistant");
    expect(added![0].payload.message.messageKind).toBe("warning");
    expect(added![0].payload.message.content).toMatch(/OldQuay/);
    expect(added![0].payload.message.content).toMatch(/live/i);
  });

  it("rejects DELETE on a live entity and inserts a warning message", async () => {
    const dispatch = vi.fn();
    const live = makeEntity({
      id: "live-1", name: "OldQuay",
      lifecycle: "live", lorebookEntryId: "lb-1",
    });
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState([live]),
      dispatch,
      accumulatedText: "[DELETE \"OldQuay\"]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/entityDeleted"),
    ).toBe(false);
    const added = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageAdded",
    );
    expect(added).toBeDefined();
    expect(added![0].payload.message.messageKind).toBe("warning");
  });

  it("rejects RENAME on a live entity and inserts a warning message", async () => {
    const dispatch = vi.fn();
    const live = makeEntity({ id: "live-1", name: "OldQuay", lifecycle: "live", lorebookEntryId: "lb-1" });
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState([live]),
      dispatch,
      accumulatedText: "[RENAME \"OldQuay\" → \"NewQuay\"]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/entityEdited"),
    ).toBe(false);
    const added = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageAdded",
    );
    expect(added).toBeDefined();
    expect(added![0].payload.message.messageKind).toBe("warning");
  });

  it("REVISE on a non-existent name creates a draft Character (find-or-create)", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: "[REVISE \"Wholly New\" | a stranger from the marsh]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const forged = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityForged",
    );
    expect(forged).toBeDefined();
    expect(forged![0].payload.entity.name).toBe("Wholly New");
    expect(forged![0].payload.entity.lifecycle).toBe("draft");
    expect(forged![0].payload.entity.categoryId).toBe(FieldID.DramatisPersonae);
    expect(forged![0].payload.entity.sourceChatId).toBe("c1");
  });

  it("REVISE on a tombstoned name does NOT recreate it", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () =>
        makeState([], {
          c1: [{ name: "Vesper", category: "Character", reason: "user" }],
        }),
      dispatch,
      accumulatedText: "[REVISE \"Vesper\" | back from the dead]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/entityForged"),
    ).toBe(false);
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/entitySummaryUpdated"),
    ).toBe(false);
  });

  it("CREATE on a tombstoned name does NOT recreate it", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () =>
        makeState([], {
          c1: [{ name: "Vesper", category: "Character", reason: "user" }],
        }),
      dispatch,
      accumulatedText: "[CREATE CHARACTER \"Vesper\" | resurrected]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/entityForged"),
    ).toBe(false);
  });

  it("permits REVISE on a draft entity", async () => {
    const dispatch = vi.fn();
    const draft = makeEntity({
      id: "d1", name: "Vesper", lifecycle: "draft",
      summary: "old", sourceChatId: "c1",
    });
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState([draft]),
      dispatch,
      accumulatedText: "[REVISE \"Vesper\" | new summary]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const updated = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entitySummaryUpdated",
    );
    expect(updated).toBeDefined();
    expect(updated![0].payload.summary).toBe("new summary");
  });

  it("sets lastAffectingMessageId on CREATE entity", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m-42" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: "[CREATE CHARACTER \"Vesper\" | A lighthouse keeper.]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const forged = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityForged",
    );
    expect(forged).toBeDefined();
    expect(forged![0].payload.entity.lastAffectingMessageId).toBe("m-42");
  });

  it("sets lastAffectingMessageId on REVISE dispatch", async () => {
    const dispatch = vi.fn();
    const draft = makeEntity({
      id: "d1", name: "Vesper", lifecycle: "draft",
      summary: "old", sourceChatId: "c1",
    });
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m-99" },
      getState: () => makeState([draft]),
      dispatch,
      accumulatedText: "[REVISE \"Vesper\" | revised content]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const updated = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entitySummaryUpdated",
    );
    expect(updated).toBeDefined();
    expect(updated![0].payload.lastAffectingMessageId).toBe("m-99");
  });

  it("DELETE on a draft adds a tombstone with reason=model", async () => {
    const dispatch = vi.fn();
    const draft = makeEntity({
      id: "d1", name: "Felix", lifecycle: "draft", sourceChatId: "c1",
      categoryId: FieldID.DramatisPersonae,
    });
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState([draft]),
      dispatch,
      accumulatedText: "[DELETE \"Felix\"]",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    const deleted = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityDeleted",
    );
    expect(deleted).toBeDefined();
    const tombstone = dispatch.mock.calls.find(
      ([a]) => a.type === "forge/tombstoneAdded",
    );
    expect(tombstone).toBeDefined();
    expect(tombstone![0].payload.chatId).toBe("c1");
    expect(tombstone![0].payload.tombstone.name).toBe("Felix");
    expect(tombstone![0].payload.tombstone.reason).toBe("model");
  });

  it("does nothing on empty accumulatedText", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeChatTarget> = {
      target: { type: "forgeChat", chatId: "c1", messageId: "m1" },
      getState: () => makeState(),
      dispatch,
      accumulatedText: "",
      generationSucceeded: true,
    };
    await forgeChatHandler.completion(ctx);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("forgeCleanupHandler.completion", () => {
  it("executes REVISE on drafts", async () => {
    const dispatch = vi.fn();
    const draft = makeEntity({
      id: "d2", name: "Marsh", lifecycle: "draft",
      summary: "dock worker, brother of Vesper",
      sourceChatId: "c1",
    });
    const ctx: CompletionContext<ForgeCleanupTarget> = {
      target: { type: "forgeCleanup", chatId: "c1", messageId: "m-clean", discardedNames: ["Vesper"] },
      getState: () => makeState([draft]),
      dispatch,
      accumulatedText: "[REVISE \"Marsh\" | dock worker, no family in the city]",
      generationSucceeded: true,
    };
    await forgeCleanupHandler.completion(ctx);
    const updated = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entitySummaryUpdated",
    );
    expect(updated).toBeDefined();
    expect(updated![0].payload.summary).toContain("no family");
  });

  it("ignores non-REVISE commands (e.g., CREATE)", async () => {
    const dispatch = vi.fn();
    const ctx: CompletionContext<ForgeCleanupTarget> = {
      target: { type: "forgeCleanup", chatId: "c1", messageId: "m-clean", discardedNames: ["Vesper"] },
      getState: () => makeState(),
      dispatch,
      accumulatedText: "[CREATE CHARACTER \"Newbie\" | bad]",
      generationSucceeded: true,
    };
    await forgeCleanupHandler.completion(ctx);
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "world/entityForged"),
    ).toBe(false);
  });
});
