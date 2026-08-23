import { describe, it, expect, beforeEach } from "vitest";
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
import {
  writeLorebookEntry,
  readLorebookWriteRecord,
  listLorebookWriteRecords,
  fingerprintEntryText,
  lorebookRecordKey,
} from "../../../src/core/engine/lorebook-write";
import { lorebookOriginalKey } from "../../../src/core/keys";
import { QUEUE_KEY, WATERMARK_KEY } from "../../../src/core/engine/intents";
import {
  INDEX_KEY,
  entityKey,
  threadKey,
  fieldKey,
} from "../../../src/core/store/persistence/keyspace";
import { saveRecords } from "../../../src/core/store/persistence/history-store";

const ENTRY = "entry-1";
const ORIGINAL = "Kael is a courier. He has never been outside the city.";

let history: HistoryFake;
let lorebook: LorebookFake;
let story: StoryStorageFake;

const seed = (over: Partial<LorebookEntry> = {}) =>
  lorebook.seed({
    id: ENTRY,
    displayName: "Kael",
    text: ORIGINAL,
    enabled: true,
    keys: ["Kael"],
    ...over,
  });

beforeEach(() => {
  history = installHistoryFake();
  lorebook = installLorebookFake();
  story = installStoryStorageFake();
});

describe("writeLorebookEntry — the read", () => {
  it("hands the producer the LIVE entry, not what a caller believed", async () => {
    // §5: a hand-edit made thirty seconds ago is part of the input. The door is
    // the only reader, so a caller cannot pass in a stale copy at all.
    seed({ text: "the writer edited this a moment ago" });
    let seen: string | undefined;
    await writeLorebookEntry(
      { entryId: ENTRY, nodeId: history.current() },
      (live) => {
        seen = live.text;
        return { text: "rewritten" };
      },
    );
    expect(seen).toBe("the writer edited this a moment ago");
  });

  it("writes nothing at all for an entry the writer has deleted", async () => {
    const out = await writeLorebookEntry(
      { entryId: "gone", nodeId: history.current() },
      () => ({ text: "resurrected" }),
    );
    expect(out.written).toBe(false);
    expect(out.record).toBeNull();
    expect(lorebook.updates()).toEqual([]);
    expect(story.keys()).toEqual([]);
  });
});

describe("writeLorebookEntry — the write", () => {
  it("applies the producer's patch to the entry", async () => {
    seed();
    await writeLorebookEntry(
      { entryId: ENTRY, nodeId: history.current() },
      () => ({
        text: "Kael is a courier who has now crossed the wall.",
      }),
    );
    expect(lorebook.read(ENTRY)?.text).toBe(
      "Kael is a courier who has now crossed the wall.",
    );
  });

  it("writes a patch that carries no text — the retire flag flip", async () => {
    seed();
    const out = await writeLorebookEntry(
      { entryId: ENTRY, nodeId: history.current() },
      () => ({ enabled: false }),
    );
    expect(lorebook.read(ENTRY)?.enabled).toBe(false);
    expect(lorebook.read(ENTRY)?.text).toBe(ORIGINAL);
    expect(out.written).toBe(true);
    // No text was written, so there is nothing for §7 to compare and no record
    // claiming otherwise.
    expect(out.record).toBeNull();
  });

  it("does not write when the producer declines", async () => {
    seed();
    const out = await writeLorebookEntry(
      { entryId: ENTRY, nodeId: history.current() },
      () => null,
    );
    expect(out.written).toBe(false);
    expect(lorebook.updates()).toEqual([]);
    expect(lorebook.read(ENTRY)?.text).toBe(ORIGINAL);
  });

  it("rethrows a failed write rather than reporting a success", async () => {
    seed();
    lorebook.failNextUpdate(new Error("backend refused"));
    await expect(
      writeLorebookEntry({ entryId: ENTRY, nodeId: history.current() }, () => ({
        text: "never lands",
      })),
    ).rejects.toThrow("backend refused");
  });
});

describe("writeLorebookEntry — the write-once snapshot (§5.2)", () => {
  it("snapshots the entry the first time the Engine touches it", async () => {
    seed();
    await writeLorebookEntry(
      { entryId: ENTRY, nodeId: history.current() },
      () => ({
        text: "engine output",
      }),
    );
    const snapshot = story.get(lorebookOriginalKey(ENTRY)) as LorebookEntry;
    expect(snapshot.text).toBe(ORIGINAL);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.keys).toEqual(["Kael"]);
  });

  it("KEEPS the writer's original when the Engine touches the entry again", async () => {
    // The one way this feature destroys what it exists to protect: a second
    // snapshot overwrites the writer's text with the Engine's own earlier
    // output. This test fails if `setIfAbsent` is ever relaxed to `set`.
    seed();
    const node = history.current();
    await writeLorebookEntry({ entryId: ENTRY, nodeId: node }, () => ({
      text: "engine output, pass one",
    }));
    await writeLorebookEntry({ entryId: ENTRY, nodeId: node }, () => ({
      text: "engine output, pass two",
    }));
    const snapshot = story.get(lorebookOriginalKey(ENTRY)) as LorebookEntry;
    expect(snapshot.text).toBe(ORIGINAL);
    expect(snapshot.text).not.toContain("engine output");
  });

  it("keeps the snapshot when the entry write then fails", async () => {
    // The snapshot is not wrong, only early: the failed write left the entry
    // holding exactly the text the snapshot holds. Rolling it back would let a
    // retry — after the writer, or a half-applied write, has moved the text —
    // snapshot something that is no longer the original.
    seed();
    lorebook.failNextUpdate(new Error("backend refused"));
    await expect(
      writeLorebookEntry({ entryId: ENTRY, nodeId: history.current() }, () => ({
        text: "never lands",
      })),
    ).rejects.toThrow();
    expect((story.get(lorebookOriginalKey(ENTRY)) as LorebookEntry).text).toBe(
      ORIGINAL,
    );
    expect(lorebook.read(ENTRY)?.text).toBe(ORIGINAL);
  });

  it("writes no record for a write that failed", async () => {
    seed();
    lorebook.failNextUpdate(new Error("backend refused"));
    await expect(
      writeLorebookEntry({ entryId: ENTRY, nodeId: history.current() }, () => ({
        text: "never lands",
      })),
    ).rejects.toThrow();
    expect(await readLorebookWriteRecord(ENTRY, history.current())).toBeNull();
  });

  it("snapshots each entry separately", async () => {
    seed();
    lorebook.seed({ id: "entry-2", text: "second original" });
    const node = history.current();
    await writeLorebookEntry({ entryId: ENTRY, nodeId: node }, () => ({
      text: "a",
    }));
    await writeLorebookEntry({ entryId: "entry-2", nodeId: node }, () => ({
      text: "b",
    }));
    expect((story.get(lorebookOriginalKey(ENTRY)) as LorebookEntry).text).toBe(
      ORIGINAL,
    );
    expect(
      (story.get(lorebookOriginalKey("entry-2")) as LorebookEntry).text,
    ).toBe("second original");
  });
});

describe("writeLorebookEntry — the record (§6.2, §7)", () => {
  it("records the write at the CAPTURED node, not wherever the cursor drifted to", async () => {
    // §6.3: the writer keeps typing while a generation runs. This test fails if
    // the node argument is dropped — the record would land at the cursor, and a
    // read at the captured node (a node the cursor's chain no longer holds it
    // at) would find nothing.
    seed();
    const captured = history.current();
    history.push();
    history.push();
    await writeLorebookEntry({ entryId: ENTRY, nodeId: captured }, () => ({
      text: "engine output",
    }));
    history.goto(captured);
    const record = await readLorebookWriteRecord(ENTRY, captured);
    expect(record).not.toBeNull();
    expect(record?.entryId).toBe(ENTRY);
  });

  it("records a fingerprint of what was written, never the text itself", async () => {
    // §7: the record answers "what did we do", never "what does it say". A
    // record that carried the text could answer the second question, so it does
    // not carry it.
    seed();
    const node = history.current();
    const out = await writeLorebookEntry(
      { entryId: ENTRY, nodeId: node },
      () => ({
        text: "Kael has crossed the wall and cannot go back.",
      }),
    );
    expect(JSON.stringify(out.record)).not.toContain("Kael");
    expect(JSON.stringify(out.record)).not.toContain("wall");
    expect(out.record?.textFingerprint).toBe(
      fingerprintEntryText("Kael has crossed the wall and cannot go back."),
    );
  });

  it("returns the record it persisted", async () => {
    seed();
    const node = history.current();
    const out = await writeLorebookEntry(
      { entryId: ENTRY, nodeId: node },
      () => ({
        text: "engine output",
      }),
    );
    expect(await readLorebookWriteRecord(ENTRY, node)).toEqual(out.record);
  });

  it("reads back null for an entry the Engine has never written", async () => {
    expect(
      await readLorebookWriteRecord("never", history.current()),
    ).toBeNull();
  });

  it("reads back null for a record of the wrong shape", async () => {
    // Persisted JSON is trusted no further than its shape, the same way the
    // watermark and queue records are.
    await saveRecords(
      { [lorebookRecordKey(ENTRY)]: "a bare string" },
      history.current(),
    );
    expect(await readLorebookWriteRecord(ENTRY, history.current())).toBeNull();
  });

  it("is inherited by a descendant node, like every other branch record", async () => {
    seed();
    const captured = history.current();
    await writeLorebookEntry({ entryId: ENTRY, nodeId: captured }, () => ({
      text: "engine output",
    }));
    const child = history.push();
    expect(await readLorebookWriteRecord(ENTRY, child)).not.toBeNull();
  });

  it("enumerates only lorebook write records", async () => {
    seed();
    lorebook.seed({ id: "entry-2", text: "second" });
    const node = history.current();
    await saveRecords(
      {
        [INDEX_KEY]: { entityIds: [], threadIds: [], fieldIds: [] },
        [entityKey("x")]: { id: "x" },
        [threadKey("x")]: { id: "x" },
        [fieldKey("x")]: { id: "x" },
        [WATERMARK_KEY]: { sectionId: 0, offset: 0 },
        [QUEUE_KEY]: [],
      },
      node,
    );
    await writeLorebookEntry({ entryId: ENTRY, nodeId: node }, () => ({
      text: "a",
    }));
    await writeLorebookEntry({ entryId: "entry-2", nodeId: node }, () => ({
      text: "b",
    }));
    const found = await listLorebookWriteRecords(node);
    expect(found.map((r) => r.entryId).sort()).toEqual([ENTRY, "entry-2"]);
  });

  it("skips a malformed record while enumerating", async () => {
    seed();
    const node = history.current();
    await writeLorebookEntry({ entryId: ENTRY, nodeId: node }, () => ({
      text: "a",
    }));
    await saveRecords({ [lorebookRecordKey("junk")]: 7 }, node);
    const found = await listLorebookWriteRecords(node);
    expect(found.map((r) => r.entryId)).toEqual([ENTRY]);
  });
});

describe("lorebookRecordKey", () => {
  it("cannot collide with any other key in the branch keyspace", () => {
    // Entity, thread and lorebook-entry ids are all UUIDs from one generator,
    // so "same string, different record" is reachable in practice.
    const id = "shared-uuid";
    const keys = [
      lorebookRecordKey(id),
      entityKey(id),
      threadKey(id),
      fieldKey(id),
      INDEX_KEY,
      WATERMARK_KEY,
      QUEUE_KEY,
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses the §6.2 prefix", () => {
    expect(lorebookRecordKey("abc")).toBe("lb:abc");
  });
});

describe("fingerprintEntryText", () => {
  it("agrees with itself on identical text", () => {
    expect(fingerprintEntryText(ORIGINAL)).toBe(fingerprintEntryText(ORIGINAL));
  });

  it("treats a missing text and an empty one as the same", () => {
    // `LorebookEntry.text` is optional; an entry with no text and one with ""
    // say the same thing, and §7 must not read that difference as a hand-edit.
    expect(fingerprintEntryText(undefined)).toBe(fingerprintEntryText(""));
  });

  it("differs on a one-character edit", () => {
    expect(fingerprintEntryText(ORIGINAL)).not.toBe(
      fingerprintEntryText(ORIGINAL + "."),
    );
  });

  it("differs on a change that keeps the length", () => {
    // A hash of length alone would pass every other test in this block.
    expect(fingerprintEntryText("abcd")).not.toBe(fingerprintEntryText("abdc"));
  });

  it("differs on trailing whitespace", () => {
    expect(fingerprintEntryText("Kael")).not.toBe(
      fingerprintEntryText("Kael "),
    );
  });

  it("does not embed the text it fingerprints", () => {
    expect(fingerprintEntryText("Kael")).not.toContain("Kael");
  });

  it("is stable across a JSON round trip", () => {
    // The record is stored as JSON and compared after being read back.
    const fp = fingerprintEntryText(ORIGINAL);
    expect(JSON.parse(JSON.stringify({ fp })).fp).toBe(fp);
  });
});
