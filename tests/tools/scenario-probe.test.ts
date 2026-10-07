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
          expect(r.shown).toContain(c.state);
        }
        if (c.kind === "CREATE") expect(r.shown).toContain(c.content);
      }
    },
  );

  it("counts zero Threads for a four-segment line in both readers", () => {
    expect(read(samples.fourSegments).threads).toBe(0);
    expect(
      parseCommands(samples.fourSegments).filter((c) => c.kind === "THREAD"),
    ).toHaveLength(0);
  });
});
