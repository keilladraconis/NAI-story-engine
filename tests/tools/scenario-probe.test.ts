import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommands } from "../../src/core/utils/crucible-command-parser";
import {
  SCENARIO_PROMPT,
  SCENARIO_REGISTERS,
} from "../../src/core/utils/prompts";

/** The probe is a standalone script and cannot import from `src/`, so it
 *  carries its own copy of the prompt it measures. A probe measuring last
 *  month's prompt is worse than no probe. */
describe("tools/scenario-probe.naiscript measures the shipped prompt", () => {
  const probe = readFileSync("tools/scenario-probe.naiscript", "utf8");

  it.each([
    ["SCENARIO_PROMPT", SCENARIO_PROMPT],
    ["REGISTER", SCENARIO_REGISTERS.Gritty],
  ])("carries %s verbatim", (name, prompt) => {
    expect(probe).toContain(`const ${name} = ${JSON.stringify(prompt)};`);
  });
});

type Read = (text: string) => {
  shown: string;
  wishes: string;
  privates: string;
  threads: number;
};

/** The probe cannot import the parser either, so it carries a mirror of it.
 *  Evaluate that mirror and hold it to what the product's parser returns. */
describe("tools/scenario-probe.naiscript reads replies as the product does", () => {
  const probe = readFileSync("tools/scenario-probe.naiscript", "utf8");
  const source = probe
    .split("// --- read:start ---")[1]
    .split("// --- read:end ---")[0];
  const read = new Function(`${source}\nreturn read;`)() as Read;

  const thread =
    '[THREAD "The Ledger" | "Odile Marsh", "Brannock Tye" | Odile Marsh keeps the tannery books; Brannock Tye owes the guild for the hides. | Brannock Tye has altered two entries. | Odile Marsh takes the tannery from the guild.]';
  const creates = [
    '[CREATE CHARACTER "Odile Marsh" | Keeps the tannery books by lamplight, ink to the wrist.]',
    '[CREATE LOCATION "The Vat Yard" | Lime pits and drying racks behind the guildhall wall.]',
  ];
  const samples: Record<string, string> = {
    clean: [
      "You are drawn to the tannery's debts. I recorded who holds the books and left the takeover in its wish.",
      ...creates,
      thread,
      "[CRITIQUE | The Vat Yard has no one working it, and the debt has no creditor on the page.]",
      "Does Brannock still sell to the guild?",
    ].join("\n"),
    emptySegments:
      'Two sentences of prose.\n[THREAD "The Ledger" | "Odile Marsh", "Brannock Tye" | Odile Marsh keeps the books. | | ]\n' +
      creates[0],
    fourSegments:
      'Prose.\n[THREAD "The Ledger" | "Odile Marsh", "Brannock Tye" | Odile Marsh keeps the books. | Odile Marsh takes the tannery.]\n' +
      creates[1],
    decorated: `Prose.\n${creates[0]}\n- ${thread}\nDoes it hold?`,
  };

  it.each(Object.keys(samples))(
    "agrees with parseCommands on the %s reply",
    (name) => {
      const sample = samples[name];
      const parsed = parseCommands(sample);
      const r = read(sample);
      const parsedThreads = parsed.filter((c) => c.kind === "THREAD");
      expect(r.threads).toBe(parsedThreads.length);
      for (const c of parsed) {
        if (c.kind === "THREAD") {
          expect(r.wishes).toContain(c.wish);
          expect(r.privates).toContain(c.latent);
          expect(r.shown).toContain(c.state);
          expect(r.shown).toContain(c.title);
        }
        if (c.kind === "CREATE") {
          expect(r.shown).toContain(c.content);
          expect(r.shown).toContain(c.name);
        }
      }
    },
  );

  it("keeps what is shown, what is private and what is wished apart", () => {
    const r = read(samples.clean);
    expect(r.privates.trim()).toBe("Brannock Tye has altered two entries.");
    expect(r.wishes.trim()).toBe(
      "Odile Marsh takes the tannery from the guild.",
    );
    expect(r.shown).not.toContain("altered two entries");
    expect(r.shown).not.toContain("takes the tannery");
  });

  /** A fixture's `holds`, lifted out of the probe by name. */
  const holds = (name: string) => {
    const body = probe.slice(
      probe.indexOf("const SEEDS"),
      probe.indexOf("let report"),
    );
    const fixtures = new Function(`${body}\nreturn FIXTURES;`)() as {
      name: string;
      holds: (r: ReturnType<Read>) => boolean;
    }[];
    return fixtures.find((f) => f.name === name)!.holds;
  };
  const sketch = (title: string, name: string, priv: string, wish: string) =>
    read(
      `[CREATE CHARACTER "${name}" | Runs the furnace.]\n[THREAD "${title}" | "${name}" | She runs the furnace. | ${priv} | ${wish}]`,
    );

  const FIRE_WISH = "Maud burns the furnace house down.";

  it("passes a thing to come that is written only in the wish", () => {
    expect(holds("ToCome")(sketch("The Furnace", "Maud", "", FIRE_WISH))).toBe(
      true,
    );
  });

  it("passes an invented noun used as a name for something that is so", () => {
    expect(
      holds("ToCome")(sketch("The Furnace", "Maud Quillane", "", FIRE_WISH)),
    ).toBe(true);
    expect(
      holds("TwoWishes")(
        sketch(
          "The Post at Orrowmere",
          "Ada Vessarine",
          "Orrowmere has written twice.",
          "Ada publishes the Vessarine Catalogue; Tobias leaves for Orrowmere.",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    ["a THREAD title", sketch("The Quillane Fire", "Maud", "", FIRE_WISH)],
    [
      "a CREATE name",
      sketch("The Furnace", "The Quillane Fire", "", FIRE_WISH),
    ],
    [
      "the private segment",
      sketch("The Furnace", "Maud", "Maud will burn it down.", FIRE_WISH),
    ],
  ])("fails a thing to come that is written in %s", (_where, r) => {
    expect(holds("ToCome")(r)).toBe(false);
  });

  it("fails a thing to come that no wish holds", () => {
    expect(holds("ToCome")(sketch("The Furnace", "Maud", "", ""))).toBe(false);
  });

  it("fails either of two things to come copied into the private segment", () => {
    const both = "The Vessarine Catalogue; the post at Orrowmere.";
    expect(holds("TwoWishes")(sketch("The Telescope", "Ada", "", both))).toBe(
      true,
    );
    for (const priv of [
      "The Vessarine Catalogue is drafted.",
      "Tobias has already left for Orrowmere.",
    ]) {
      expect(
        holds("TwoWishes")(sketch("The Telescope", "Ada", priv, both)),
      ).toBe(false);
    }
  });

  it("counts zero Threads for a four-segment line in both readers", () => {
    expect(read(samples.fourSegments).threads).toBe(0);
    expect(
      parseCommands(samples.fourSegments).filter((c) => c.kind === "THREAD"),
    ).toHaveLength(0);
  });
});
