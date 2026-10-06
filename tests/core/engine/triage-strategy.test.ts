import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clampProse,
  createTriageFactory,
  parseTriage,
  type TriageManifest,
} from "../../../src/core/engine/triage-strategy";
import type { Assessment } from "../../../src/core/engine/assess";
import { useCreativeModel } from "../../helpers/creative-model";

const MANIFEST: TriageManifest = {
  entities: [
    {
      id: "e1",
      name: "Ada Vance",
      category: "Character",
      summary: "A locksmith who owes the Syndicate.",
    },
    { id: "e2", name: "Brennan", category: "Character", summary: "" },
    {
      id: "e3",
      name: "C++ (redacted)",
      category: "Topic",
      summary: "A banned compiler cult.",
    },
  ],
};

const EMPTY_MANIFEST: TriageManifest = {
  entities: [],
};

/** The prose the pass read, which a `revise` carries away with it — see
 *  `Intent`. Short enough that `clampProse` returns it unchanged, so
 *  every expectation below can name it as-is. */
const PROSE = "Ada pocketed the letter and said nothing.";

describe("parseTriage — the command", () => {
  it("maps REVISE back to an entity id", () => {
    expect(parseTriage("REVISE Ada Vance", MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e1", prose: PROSE },
    ]);
  });
});

describe("parseTriage — the prose an intent carries", () => {
  it("clamps it to the window the prompt would have used anyway", () => {
    // The queue is persisted on every pass, so an intent that could hold a
    // whole novel would write one on every pass it waited through. Clamped at
    // the mint, with `clampProse` — the same clamp and therefore the same
    // window triage read, never a second and smaller one.
    const long = `${"x".repeat(20000)}\n\nAda put her hand into the press.`;
    const [intent] = parseTriage("REVISE Ada Vance", MANIFEST, long);

    expect(intent).toMatchObject({ kind: "revise", entityId: "e1" });
    const carried = (intent as { prose: string }).prose;
    expect(carried.length).toBeLessThan(long.length);
    expect(carried).toBe(clampProse(long));
  });
});

describe("parseTriage — untrusted text", () => {
  it("yields nothing for an empty response, which is the common case", () => {
    expect(parseTriage("", MANIFEST, PROSE)).toEqual([]);
    expect(parseTriage("   \n\n  \n", MANIFEST, PROSE)).toEqual([]);
  });

  it("ignores a verb it does not know", () => {
    const text = ["DELETE Ada Vance", "SUMMARIZE Brennan", "REVISE Brennan"];
    expect(parseTriage(text.join("\n"), MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e2", prose: PROSE },
    ]);
  });

  it("drops a name the manifest does not list rather than guessing", () => {
    expect(parseTriage("REVISE Mira Voss", MANIFEST, PROSE)).toEqual([]);
  });

  it("drops every REVISE when the manifest is empty", () => {
    expect(parseTriage("REVISE Ada Vance", EMPTY_MANIFEST, PROSE)).toEqual([]);
  });

  it("matches names case-insensitively and whitespace-insensitively", () => {
    // The verb still has to be capitals; only the name is forgiving.
    expect(parseTriage("REVISE   ADA   vance  ", MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e1", prose: PROSE },
    ]);
  });

  it("tolerates leading and trailing whitespace around a command", () => {
    expect(
      parseTriage("   REVISE   Ada Vance   \r\n", MANIFEST, PROSE),
    ).toEqual([{ kind: "revise", entityId: "e1", prose: PROSE }]);
  });

  it("does not read prose as commands", () => {
    const text = [
      "Looking at the new passage, Ada opens the door and revises her plan.",
      "I would suggest a revision of Ada Vance, and nothing else.",
      "Nothing in the world needs attention right now.",
    ].join("\n");
    expect(parseTriage(text, MANIFEST, PROSE)).toEqual([]);
  });

  it("requires the verb in capitals, so a prose sentence cannot be a command", () => {
    expect(parseTriage("Revise Ada Vance slowly.", MANIFEST, PROSE)).toEqual(
      [],
    );
    expect(parseTriage("revise Ada Vance", MANIFEST, PROSE)).toEqual([]);
  });

  it("does not fire on a longer word starting with a verb", () => {
    expect(parseTriage("REVISED Ada Vance", MANIFEST, PROSE)).toEqual([]);
  });

  it("drops a command with no argument", () => {
    const text = ["REVISE", "REVISE:  ", "REVISE Brennan"].join("\n");
    expect(parseTriage(text, MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e2", prose: PROSE },
    ]);
  });

  it("collapses duplicate commands in one response", () => {
    const text = ["REVISE Ada Vance", "REVISE ada vance"].join("\n");
    expect(parseTriage(text, MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e1", prose: PROSE },
    ]);
  });

  it("matches a name full of regex metacharacters literally", () => {
    expect(parseTriage("REVISE C++ (redacted)", MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e3", prose: PROSE },
    ]);
    // ...and does not treat that name as a pattern that matches other text.
    expect(parseTriage("REVISE C (redacted)", MANIFEST, PROSE)).toEqual([]);
  });

  it("strips decoration the format never asked for", () => {
    expect(parseTriage('- REVISE "Ada Vance"', MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e1", prose: PROSE },
    ]);
    expect(parseTriage("2. REVISE [Brennan]", MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e2", prose: PROSE },
    ]);
  });

  it("drops an explanation the model appended after a separator", () => {
    const text = [
      "REVISE Brennan — he is dead now",
      "REVISE Ada Vance | she has paid the debt",
    ].join("\n");
    expect(parseTriage(text, MANIFEST, PROSE)).toEqual([
      { kind: "revise", entityId: "e2", prose: PROSE },
      { kind: "revise", entityId: "e1", prose: PROSE },
    ]);
  });

  it("survives a response that is only decoration", () => {
    expect(parseTriage("```\n---\n**\n", MANIFEST, PROSE)).toEqual([]);
  });
});

function assessment(over: Partial<Assessment> = {}): Assessment {
  return {
    backlog: 2,
    newText: "Ada turned the key. The letter stayed in her pocket.",
    candidateIds: ["e1"],
    ...over,
  };
}

/** A Xialong style block is recognisable by its opening token. */
function styleBlocks(messages: Message[]): Message[] {
  return messages.filter((m) => (m.content ?? "").includes("[ Style"));
}

describe("createTriageFactory", () => {
  beforeEach(() => {
    vi.mocked(api.v1.config.get).mockReset();
    // The story is on Xialong throughout: triage must stay on the instruct
    // model anyway.
    useCreativeModel("xialong-v1");
  });

  it("runs on the instruct model even in Xialong Mode", async () => {
    const { params } = await createTriageFactory({
      manifest: MANIFEST,
      assessment: assessment(),
    })();
    expect(params?.model).toBe("glm-4-6");
    // The creative branch's sampler knobs must not ride along.
    expect(params?.top_k).toBeUndefined();
    expect(params?.top_p).toBeUndefined();
  });

  it("sends no Xialong style block — triage never writes prose", async () => {
    const { messages } = await createTriageFactory({
      manifest: MANIFEST,
      assessment: assessment(),
    })();
    expect(styleBlocks(messages)).toEqual([]);
  });

  it("keeps the request small enough for triage to run hot", async () => {
    const { params } = await createTriageFactory({
      manifest: MANIFEST,
      assessment: assessment(),
    })();
    expect(params?.max_tokens).toBe(300);
    expect(params?.temperature).toBe(0.3);
  });

  it("layers the stable manifest before the volatile new prose", async () => {
    const { messages } = await createTriageFactory({
      manifest: MANIFEST,
      assessment: assessment(),
    })();
    const joined = messages.map((m) => m.content ?? "");
    const manifestAt = joined.findIndex((c) => c.includes("Ada Vance"));
    const proseAt = joined.findIndex((c) => c.includes("turned the key"));
    expect(manifestAt).toBeGreaterThanOrEqual(0);
    expect(proseAt).toBeGreaterThan(manifestAt);
    // The ask comes last, after everything it is asking about.
    expect(messages[messages.length - 1].role).toBe("user");
  });

  it("names every manifest entry the model is allowed to name", async () => {
    const { messages } = await createTriageFactory({
      manifest: MANIFEST,
      assessment: assessment(),
    })();
    const text = messages.map((m) => m.content ?? "").join("\n");
    for (const e of MANIFEST.entities) expect(text).toContain(e.name);
  });

  it("clamps prose the assessment could not bound", async () => {
    // A lost watermark makes assess return the whole document; the prompt is
    // where that gets a ceiling.
    const paragraph = `${"x".repeat(999)}\n\n`;
    const { messages } = await createTriageFactory({
      manifest: EMPTY_MANIFEST,
      assessment: assessment({
        newText: `THE OPENING\n\n${paragraph.repeat(40)}THE LATEST BEAT`,
      }),
    })();
    const prose = messages.find((m) =>
      (m.content ?? "").includes("=== NEW PROSE ==="),
    );
    expect(prose?.content?.length).toBeLessThan(13000);
    // The newest writing survives; the oldest is what gets dropped.
    expect(prose?.content).toContain("THE LATEST BEAT");
    expect(prose?.content).not.toContain("THE OPENING");
    // And the cut lands on a paragraph break, not mid-paragraph.
    const body = (prose?.content ?? "").slice("=== NEW PROSE ===\n".length);
    expect(body.split("\n\n")[0]).toBe("x".repeat(999));
  });

  it("omits the manifest sections it has nothing to put in", async () => {
    const { messages } = await createTriageFactory({
      manifest: EMPTY_MANIFEST,
      assessment: assessment(),
    })();
    const text = messages.map((m) => m.content ?? "").join("\n");
    expect(text).not.toContain("=== KNOWN ENTITIES ===");
    // The new prose and the ask survive on their own.
    expect(text).toContain("turned the key");
  });
});

describe("triage names revisions and nothing else", () => {
  const manifest = {
    entities: [
      {
        id: "e1",
        name: "Ines Corbel",
        category: "Character",
        summary: "Keeps the east hives.",
      },
    ],
  };

  it("reads a REVISE command", () => {
    expect(parseTriage("REVISE Ines Corbel", manifest, "prose")).toEqual([
      { kind: "revise", entityId: "e1", prose: "prose" },
    ]);
  });

  it("ignores a reasoning line that ends in the verb", () => {
    const text =
      "Ines Corbel: the prose shows her sell the east hives, and her record says she keeps them: REVISE\nREVISE Ines Corbel";
    expect(parseTriage(text, manifest, "prose")).toHaveLength(1);
  });

  it("no longer opens or retires anything", () => {
    expect(
      parseTriage(
        "OPEN the unpaid honey levy\nRETIRE The Levy",
        manifest,
        "prose",
      ),
    ).toEqual([]);
  });
});
