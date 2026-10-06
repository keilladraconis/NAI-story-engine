import { describe, it, expect } from "vitest";
import {
  createThreadWriteFactory,
  lintState,
  parseThreadWrite,
  stateRejection,
  type ThreadWriteInput,
} from "../../../src/core/engine/thread-write-strategy";
import { THREAD_WRITE_SYSTEM } from "../../../src/core/utils/prompts";

const input: ThreadWriteInput = {
  title: "The Shared Apiary",
  cast: [
    { name: "Ines Corbel", summary: "Keeps the east hives." },
    { name: "Pell", summary: "" },
  ],
  current: {
    state: "They work the hives together.",
    latent: "Pell means to sell.",
  },
  prose: "Ines found the bill of sale under the smoker.",
};

const contents = async (factory: ReturnType<typeof createThreadWriteFactory>) =>
  (await factory()).messages.map((m) => m.content ?? "");

describe("the Thread write prompt", () => {
  it("orders system, cast, thread, prose, instruction", async () => {
    const blocks = await contents(createThreadWriteFactory(input));
    expect(blocks[0]).toBe(THREAD_WRITE_SYSTEM);
    expect(blocks[1]).toBe(
      "=== CAST ===\n- Ines Corbel: Keeps the east hives.\n- Pell",
    );
    expect(blocks[2]).toBe(
      "=== THREAD ===\nTitle: The Shared Apiary\nCast: Ines Corbel, Pell\nSTATE: They work the hives together.\nLATENT: Pell means to sell.",
    );
    expect(blocks[3]).toBe(
      "=== PROSE ===\nInes found the bill of sale under the smoker.",
    );
    expect(blocks).toHaveLength(5);
  });

  it("marks a Thread with no record as new", async () => {
    const blocks = await contents(
      createThreadWriteFactory({ ...input, current: null }),
    );
    expect(blocks[2]).toBe(
      "=== THREAD ===\nTitle: The Shared Apiary\nCast: Ines Corbel, Pell\n(new: no record yet)",
    );
  });

  it("writes an empty private note as none", async () => {
    const blocks = await contents(
      createThreadWriteFactory({
        ...input,
        current: { state: "S.", latent: "" },
      }),
    );
    expect(blocks[2]).toContain("LATENT: none");
  });

  it("appends its own rejected reply and the repair on a retry", async () => {
    const blocks = await contents(
      createThreadWriteFactory(input, {
        reply: "STATE: Pell will sell.",
        phrase: "will",
      }),
    );
    expect(blocks).toHaveLength(7);
    expect(blocks[5]).toBe("STATE: Pell will sell.");
    expect(blocks[6]).toBe(stateRejection("will"));
  });
});

describe("reading a Thread write", () => {
  it("reads the three fields", () => {
    expect(
      parseThreadWrite(
        "MOVED: Ines found the bill of sale.\nLATENT: Pell does not know she has it.\nSTATE: Ines Corbel holds the bill of sale for the east hives.",
        "stop",
      ),
    ).toEqual({
      moved: "Ines found the bill of sale.",
      latent: "Pell does not know she has it.",
      state: "Ines Corbel holds the bill of sale for the east hives.",
    });
  });

  it("tolerates bullets, bold labels and wrapped lines", () => {
    const record = parseThreadWrite(
      "- **MOVED:** a.\n**LATENT**: b\n  and more b.\n* STATE: c.\r\n",
      "stop",
    );
    expect(record).toEqual({
      moved: "a.",
      latent: "b and more b.",
      state: "c.",
    });
  });

  it("reads a LATENT of none as empty", () => {
    expect(parseThreadWrite("LATENT: None.\nSTATE: c.", "stop")?.latent).toBe(
      "",
    );
  });

  it("declines when STATE is missing or blank", () => {
    expect(parseThreadWrite("MOVED: a.\nLATENT: b.", "stop")).toBeNull();
    expect(parseThreadWrite("STATE:   ", "stop")).toBeNull();
  });

  it("cuts a truncated STATE back to its last whole sentence, or declines", () => {
    expect(
      parseThreadWrite("STATE: Ines holds the bill. Pell has gon", "length")
        ?.state,
    ).toBe("Ines holds the bill.");
    expect(parseThreadWrite("STATE: Ines holds the bi", "length")).toBeNull();
  });

  it("ignores a lowercase label in prose", () => {
    expect(
      parseThreadWrite("the state: of things\nSTATE: c.", "stop")?.state,
    ).toBe("c.");
  });
});

describe("the STATE lint", () => {
  it.each([
    ["Pell has not yet sold the hives.", "yet"],
    ["Pell hasn't told her.", "hasn't"],
    ["Pell hasn\u2019t told her.", "hasn't"],
    ["Ines must decide.", "must"],
    ["The sale happens soon.", "soon"],
    ["Pell is about to leave.", "about to"],
    ["She keeps them until spring.", "until"],
    ["Pell will sell the hives.", "will"],
    ["One day the hives go.", "one day"],
  ])("rejects %j for %j", (state, phrase) => {
    expect(lintState(state)).toBe(phrase);
  });

  it.each([
    "Ines Corbel holds the bill of sale for the east hives.",
    "The mustard field belongs to Pell.",
    "Will Carter keeps the west hives.",
    "The water in the trough stands still.",
  ])("accepts %j", (state) => {
    expect(lintState(state)).toBeNull();
  });

  it("names the phrase and the repair in its rejection", () => {
    expect(stateRejection("yet")).toBe(
      'STATE contains "yet", which points forward. Move that to LATENT. STATE says only what is already so. Write all three fields again.',
    );
  });
});
