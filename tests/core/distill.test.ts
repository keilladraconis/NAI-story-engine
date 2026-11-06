import { describe, it, expect } from "vitest";
import {
  adultHeat,
  nameKeys,
  distillTargets,
  statusOf,
  finish,
  castKeys,
  parseKeys,
} from "../../src/core/distill";
import { rootReducer, type RootState } from "../../src/core/store";
import { emptyBrief } from "../../src/core/store/slices/canon";
import { hashText } from "../../src/core/text";

function withCanon(patch: Partial<RootState["canon"]>): RootState {
  const base = rootReducer(undefined, { type: "@@INIT" });
  return { ...base, canon: { ...base.canon, ...patch } };
}

const STATE = withCanon({
  brief: {
    ...emptyBrief,
    title: "The Keeper",
    genre: "Literary",
    premise: "A light.",
    voice: "Third, past",
    heat: "Explicit",
  },
  startingPoint: { now: "The boat is late.", notYet: "Ilse knows." },
  docs: [
    { id: "t", kind: "dossier", title: "Tam Ward", text: "Tam's dossier." },
    { id: "g", kind: "geography", title: "Geography", text: "An island." },
    {
      id: "r",
      kind: "relationships",
      title: "Relationships",
      text: "Ilse and Tam.",
    },
    { id: "e", kind: "locations", title: "Locations", text: "" },
  ],
});

describe("distillTargets", () => {
  const ids = distillTargets(STATE).map((t) => t.id);

  it("compiles whatever the canon can support, and nothing it cannot", () => {
    expect(ids).toEqual([
      "memory",
      "an",
      "entry:world",
      "entry:dramatis",
      "entry:profile:t",
      "entry:relationships",
    ]);
  });

  it("feeds a profile its dossier and the relationships", () => {
    const profile = distillTargets(STATE).find(
      (t) => t.id === "entry:profile:t",
    )!;
    expect(profile.docIds).toEqual(["t", "r"]);
    expect(profile.sources).toContain("Tam's dossier.");
    expect(profile.sources).toContain("Ilse and Tam.");
  });
});

describe("statusOf", () => {
  const target = distillTargets(STATE)[2];
  const record = {
    entryId: "x",
    sourceHash: hashText(target.sources),
    writtenHash: hashText("written"),
  };

  it("is not compiled without a record or without its text", () => {
    expect(statusOf(target, undefined, "written")).toBe("not compiled");
    expect(statusOf(target, record, null)).toBe("not compiled");
  });

  it("is hand-edited when the text is not what was written, whatever the sources", () => {
    expect(statusOf(target, { ...record, sourceHash: "old" }, "edited")).toBe(
      "hand-edited",
    );
  });

  it("is stale when the sources changed", () => {
    expect(statusOf(target, { ...record, sourceHash: "old" }, "written")).toBe(
      "stale",
    );
  });

  it("is current otherwise, ignoring trailing whitespace", () => {
    expect(statusOf(target, record, "written\n")).toBe("current");
  });
});

describe("finish", () => {
  const [memory, an, world] = distillTargets(STATE);

  it("builds Memory from the ATTG line, the compiled lines and, for adult heat, the adults line", () => {
    expect(finish(memory, "Tam: a keeper.\nThe tension.", STATE)).toBe(
      "[ Title: The Keeper; Genre: Literary ]\nTam: a keeper.\nThe tension.\nAll characters are adults over 18.",
    );
  });

  it("wraps the style once, even when the model already wrapped it", () => {
    expect(finish(an, "terse, cold", STATE)).toBe("[ Style: terse, cold ]");
    expect(finish(an, "[ Style: terse, cold ]", STATE)).toBe(
      "[ Style: terse, cold ]",
    );
  });

  it("leaves entries as compiled", () => {
    expect(finish(world, "  Setting: an island.  ", STATE)).toBe(
      "Setting: an island.",
    );
  });
});

describe("keys", () => {
  it("keys cast entries on names and first names", () => {
    expect(castKeys(STATE)).toEqual(["tam ward", "tam"]);
  });

  it("parses, cleans and dedupes a key line", () => {
    expect(parseKeys('"Tam", tam, The Lamp-room,  a')).toEqual([
      "tam",
      "the lamp-room",
    ]);
  });
});

describe("adultHeat", () => {
  it("adds the adults line for adult heat, not for its negation", () => {
    expect(adultHeat("Explicit")).toBe(true);
    expect(adultHeat("Nothing explicit")).toBe(false);
    expect(adultHeat("not sexual")).toBe(false);
    expect(adultHeat("Tender")).toBe(false);
  });
});

describe("nameKeys", () => {
  it("keys a name and its first name", () => {
    expect(nameKeys("Tam Ward")).toEqual(["tam ward", "tam"]);
    expect(nameKeys("Ilse")).toEqual(["ilse"]);
    expect(nameKeys("Al Bo")).toEqual(["al bo"]);
  });
});
