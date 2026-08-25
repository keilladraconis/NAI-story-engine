import { describe, it, expect, beforeEach } from "vitest";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import { writeLorebookEntry } from "../../../src/core/engine/lorebook-write";

const ENTRY = "entry-1";
const ORIGINAL = "Kael is a courier. He has never been outside the city.";

let lorebook: LorebookFake;

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
  lorebook = installLorebookFake();
});

describe("writeLorebookEntry — the read", () => {
  it("hands the producer the LIVE entry, not what a caller believed", async () => {
    // §5, and the only reason this module exists: a hand-edit made thirty
    // seconds ago is part of the input. The door is the only reader, so a
    // caller cannot pass in a stale copy at all.
    seed({ text: "the writer edited this a moment ago" });
    let seen: LorebookEntry | undefined;
    await writeLorebookEntry(ENTRY, (live) => {
      seen = live;
      return { text: "rewritten" };
    });
    expect(seen?.text).toBe("the writer edited this a moment ago");
    // The whole entry, not a shape assembled from the id: the producers build
    // prefills from `displayName` and read `enabled` to decide whether a flag
    // flip is a no-op.
    expect(seen?.displayName).toBe("Kael");
    expect(seen?.enabled).toBe(true);
    expect(seen?.keys).toEqual(["Kael"]);
  });

  it("reads the entry again for every write, never once per session", async () => {
    // Two passes over the same entry, with the writer editing in between. The
    // second producer must see the writer's text, not the first pass's read.
    seed({ text: "first" });
    const seen: (string | undefined)[] = [];
    await writeLorebookEntry(ENTRY, (live) => {
      seen.push(live.text);
      return { text: "engine output" };
    });
    lorebook.seed({ id: ENTRY, text: "the writer typed over it" });
    await writeLorebookEntry(ENTRY, (live) => {
      seen.push(live.text);
      return { text: "engine output again" };
    });
    expect(seen).toEqual(["first", "the writer typed over it"]);
  });

  it("writes nothing at all for an entry the writer has deleted", async () => {
    const written = await writeLorebookEntry("gone", () => ({
      text: "resurrected",
    }));
    expect(written).toBe(false);
    expect(lorebook.updates()).toEqual([]);
  });
});

describe("writeLorebookEntry — the write", () => {
  it("applies the producer's patch to the entry", async () => {
    seed();
    const written = await writeLorebookEntry(ENTRY, () => ({
      text: "Kael is a courier who has now crossed the wall.",
    }));
    expect(written).toBe(true);
    expect(lorebook.read(ENTRY)?.text).toBe(
      "Kael is a courier who has now crossed the wall.",
    );
  });

  it("writes a patch that carries no text — the retire flag flip", async () => {
    seed();
    const written = await writeLorebookEntry(ENTRY, () => ({
      enabled: false,
    }));
    expect(written).toBe(true);
    expect(lorebook.read(ENTRY)?.enabled).toBe(false);
    // Only what the patch named. The Engine touches the least of an entry the
    // job requires.
    expect(lorebook.read(ENTRY)?.text).toBe(ORIGINAL);
  });

  it("does not write when the producer declines", async () => {
    // A refused generation returns null rather than empty text, because a
    // revision REPLACES: an empty patch would delete the writer's entry.
    seed();
    const written = await writeLorebookEntry(ENTRY, () => null);
    expect(written).toBe(false);
    expect(lorebook.updates()).toEqual([]);
    expect(lorebook.read(ENTRY)?.text).toBe(ORIGINAL);
  });

  it("awaits a producer that returns a promise", async () => {
    // Every arm that spends a generation is one of these: the model call runs
    // inside the producer, which is what makes read-then-write structural.
    seed();
    const written = await writeLorebookEntry(ENTRY, async (live) => ({
      text: `${live.text ?? ""} He has now.`,
    }));
    expect(written).toBe(true);
    expect(lorebook.read(ENTRY)?.text).toBe(`${ORIGINAL} He has now.`);
  });

  it("rethrows a failed write rather than reporting a success", async () => {
    // The pass classifies failures and the HUD reports them; a door that
    // swallowed one would report a write that never landed.
    seed();
    lorebook.failNextUpdate(new Error("backend refused"));
    await expect(
      writeLorebookEntry(ENTRY, () => ({ text: "never lands" })),
    ).rejects.toThrow("backend refused");
    expect(lorebook.read(ENTRY)?.text).toBe(ORIGINAL);
  });
});
