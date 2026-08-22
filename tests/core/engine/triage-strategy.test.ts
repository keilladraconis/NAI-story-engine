import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createTriageFactory,
  parseTriage,
  type TriageManifest,
} from "../../../src/core/engine/triage-strategy";
import type { Assessment } from "../../../src/core/engine/assess";

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
  threads: [
    {
      id: "g1",
      title: "The hidden letter",
      text: "Ada pocketed a letter she has not read.",
      horizon: "plot",
      status: "open",
    },
    {
      id: "g2",
      title: "Debt to the Syndicate",
      text: "",
      horizon: "arc",
      status: "open",
    },
  ],
  threadCap: 8,
};

const EMPTY_MANIFEST: TriageManifest = {
  entities: [],
  threads: [],
  threadCap: 8,
};

/** A manifest whose thread list is `count` long, with an optional override on
 *  the first entry — the cap cases are all about the list's shape, not its
 *  prose. */
function threaded(
  count: number,
  threadCap: number,
  over: Partial<TriageManifest["threads"][number]> = {},
): TriageManifest {
  const threads = Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    title: `Thread ${i}`,
    text: `The ${i}th commitment.`,
    horizon: "plot" as const,
    status: "open" as const,
    ...(i === 0 ? over : {}),
  }));
  return { entities: [], threads, threadCap };
}

/** The manifest block triage was actually shown, minus the prose and the ask. */
async function threadBlock(manifest: TriageManifest): Promise<string> {
  const { messages } = await createTriageFactory({
    manifest,
    assessment: assessment(),
  })();
  return (
    messages
      .map((m) => m.content ?? "")
      .find((c) => c.startsWith("=== THREADS")) ?? ""
  );
}

describe("parseTriage — the three commands", () => {
  it("maps REVISE back to an entity id", () => {
    expect(parseTriage("REVISE Ada Vance", MANIFEST)).toEqual([
      { kind: "revise", entityId: "e1" },
    ]);
  });

  it("takes OPEN's subject as free text — nothing to match it against", () => {
    expect(parseTriage("OPEN the letter Ada took", MANIFEST)).toEqual([
      { kind: "open", subject: "the letter Ada took" },
    ]);
  });

  it("maps RETIRE back to a thread id", () => {
    expect(parseTriage("RETIRE The hidden letter", MANIFEST)).toEqual([
      { kind: "retire", threadId: "g1" },
    ]);
  });

  it("reads several commands from one response, in order", () => {
    const text = [
      "REVISE Brennan",
      "OPEN the debt comes due at midwinter",
      "RETIRE Debt to the Syndicate",
    ].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([
      { kind: "revise", entityId: "e2" },
      { kind: "open", subject: "the debt comes due at midwinter" },
      { kind: "retire", threadId: "g2" },
    ]);
  });
});

describe("parseTriage — untrusted text", () => {
  it("yields nothing for an empty response, which is the common case", () => {
    expect(parseTriage("", MANIFEST)).toEqual([]);
    expect(parseTriage("   \n\n  \n", MANIFEST)).toEqual([]);
  });

  it("ignores a verb it does not know", () => {
    const text = ["DELETE Ada Vance", "SUMMARIZE Brennan", "REVISE Brennan"];
    expect(parseTriage(text.join("\n"), MANIFEST)).toEqual([
      { kind: "revise", entityId: "e2" },
    ]);
  });

  it("drops a name the manifest does not list rather than guessing", () => {
    const text = ["REVISE Mira Voss", "RETIRE The buried key"].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([]);
  });

  it("drops every REVISE and RETIRE when the manifest is empty", () => {
    const text = [
      "REVISE Ada Vance",
      "RETIRE The hidden letter",
      "OPEN a debt",
    ];
    expect(parseTriage(text.join("\n"), EMPTY_MANIFEST)).toEqual([
      { kind: "open", subject: "a debt" },
    ]);
  });

  it("matches names case-insensitively and whitespace-insensitively", () => {
    const text = ["revise: ADA   vance", "RETIRE   the HIDDEN letter  "].join(
      "\n",
    );
    // The verb still has to be capitals; only the name is forgiving.
    expect(parseTriage(text, MANIFEST)).toEqual([
      { kind: "retire", threadId: "g1" },
    ]);
  });

  it("tolerates leading and trailing whitespace around a command", () => {
    expect(parseTriage("   REVISE   Ada Vance   \r\n", MANIFEST)).toEqual([
      { kind: "revise", entityId: "e1" },
    ]);
  });

  it("does not read prose as commands", () => {
    const text = [
      "Looking at the new passage, Ada opens the door and revises her plan.",
      "I would suggest opening a thread about the letter, and retiring the debt.",
      "Nothing in the world needs attention right now.",
    ].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([]);
  });

  it("requires the verb in capitals, so a prose sentence cannot be a command", () => {
    expect(parseTriage("Open the door slowly.", MANIFEST)).toEqual([]);
    expect(parseTriage("revise Ada Vance", MANIFEST)).toEqual([]);
  });

  it("does not fire on a longer word starting with a verb", () => {
    const text = ["REVISED Ada Vance", "OPENING the letter"].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([]);
  });

  it("drops a command with no argument", () => {
    const text = ["REVISE", "OPEN   ", "RETIRE:", "REVISE Brennan"].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([
      { kind: "revise", entityId: "e2" },
    ]);
  });

  it("collapses duplicate commands in one response", () => {
    const text = [
      "REVISE Ada Vance",
      "REVISE ada vance",
      "OPEN the buried letter",
      "OPEN The Buried Letter",
      "RETIRE The hidden letter",
      "RETIRE the hidden letter",
    ].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([
      { kind: "revise", entityId: "e1" },
      { kind: "open", subject: "the buried letter" },
      { kind: "retire", threadId: "g1" },
    ]);
  });

  it("matches a name full of regex metacharacters literally", () => {
    expect(parseTriage("REVISE C++ (redacted)", MANIFEST)).toEqual([
      { kind: "revise", entityId: "e3" },
    ]);
    // ...and does not treat that name as a pattern that matches other text.
    expect(parseTriage("REVISE C (redacted)", MANIFEST)).toEqual([]);
  });

  it("strips decoration the format never asked for", () => {
    const text = [
      '- REVISE "Ada Vance"',
      "2. RETIRE [The hidden letter]",
      "* OPEN the letter is still sealed.",
    ].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([
      { kind: "revise", entityId: "e1" },
      { kind: "retire", threadId: "g1" },
      { kind: "open", subject: "the letter is still sealed" },
    ]);
  });

  it("drops an explanation the model appended after a separator", () => {
    const text = [
      "REVISE Brennan — he is dead now",
      "OPEN the sealed letter | Ada has not read it",
    ].join("\n");
    expect(parseTriage(text, MANIFEST)).toEqual([
      { kind: "revise", entityId: "e2" },
      { kind: "open", subject: "the sealed letter" },
    ]);
  });

  it("survives a response that is only decoration", () => {
    expect(parseTriage("```\n---\n**\n", MANIFEST)).toEqual([]);
  });
});

describe("the manifest states the cap triage has to justify against", () => {
  it("gives the fill and the ceiling in the threads heading", async () => {
    const block = await threadBlock(threaded(3, 8));
    expect(block.split("\n")[0]).toBe("=== THREADS (3 of 8) ===");
  });

  it("carries each thread's horizon", async () => {
    const block = await threadBlock(MANIFEST);
    expect(block).toContain(
      "- The hidden letter [plot]: Ada pocketed a letter she has not read.",
    );
    expect(block).toContain("- Debt to the Syndicate [arc]");
  });

  it("marks a satisfied thread and spends no tokens on its reminder", async () => {
    // A settled commitment has nothing left to remind anyone of; what it still
    // has is a slot, which is the only reason it is listed at all.
    const block = await threadBlock(
      threaded(2, 8, { status: "satisfied", text: "Long since settled." }),
    );
    expect(block).toContain("- Thread 0 [plot, satisfied]");
    expect(block).not.toContain("Long since settled.");
  });

  it("names nothing while there is room", async () => {
    const block = await threadBlock(threaded(3, 8));
    expect(block).not.toContain("displaces");
    expect(block).not.toContain("full");
  });

  it("names the thread the next OPEN would cost, once the list is full", async () => {
    const block = await threadBlock(threaded(3, 3));
    expect(block).toContain(
      "The list is full. Opening another displaces: Thread 0",
    );
  });

  it("nominates the victim the reducer would actually take", async () => {
    // Not the oldest: a satisfied thread goes first whatever its age, and the
    // model must not be left to invent its own answer to that.
    const full = threaded(3, 3);
    const block = await threadBlock({
      ...full,
      threads: full.threads.map((t, i) =>
        i === 2 ? { ...t, status: "satisfied" as const } : t,
      ),
    });
    expect(block).toContain("displaces: Thread 2");
    expect(block).not.toContain("displaces: Thread 0");
  });

  it("names every thread a create would cost after the cap was lowered", async () => {
    const block = await threadBlock(threaded(4, 2));
    expect(block).toContain(
      "The list is full. Opening another displaces: Thread 0, Thread 1, Thread 2",
    );
  });

  it("keeps the whole manifest in one message ahead of the prose", async () => {
    // The stable prefix is the point (§8): a cap line in its own message after
    // the prose would break the shared prefix on every pass.
    const { messages } = await createTriageFactory({
      manifest: threaded(3, 3),
      assessment: assessment(),
    })();
    const contents = messages.map((m) => m.content ?? "");
    expect(contents.filter((c) => c.includes("=== THREADS"))).toHaveLength(1);
    expect(
      contents.findIndex((c) => c.includes("The list is full")),
    ).toBeLessThan(contents.findIndex((c) => c.includes("=== NEW PROSE ===")));
  });
});

describe("parseTriage — the wire format did not change", () => {
  it("still reads a bare OPEN, cap or no cap", () => {
    expect(parseTriage("OPEN the letter Ada took", threaded(3, 3))).toEqual([
      { kind: "open", subject: "the letter Ada took" },
    ]);
  });

  it("keeps the subject when the model justifies the cost after it", () => {
    // Being told what an OPEN costs is an invitation to explain the trade. The
    // existing separator tolerance is what stops that becoming a dropped line —
    // which is why OPEN gained no syntax to carry the justification in.
    const text = [
      "OPEN the sealed letter — worth more than Thread 0",
      "OPEN the debt at midwinter | displaces Thread 0",
    ].join("\n");
    expect(parseTriage(text, threaded(3, 3))).toEqual([
      { kind: "open", subject: "the sealed letter" },
      { kind: "open", subject: "the debt at midwinter" },
    ]);
  });

  it("still resolves RETIRE against a thread the manifest lists", () => {
    expect(parseTriage("RETIRE Thread 1", threaded(3, 3))).toEqual([
      { kind: "retire", threadId: "t1" },
    ]);
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
    // Xialong Mode ON throughout: triage must stay on the instruct model anyway.
    vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
      key === "xialong_mode" ? true : undefined,
    );
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
    expect(params?.max_tokens).toBe(200);
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
    for (const t of MANIFEST.threads) expect(text).toContain(t.title);
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
    expect(text).not.toContain("KNOWN ENTITIES");
    // No threads means no ceiling worth stating: an OPEN costs nothing.
    expect(text).not.toContain("=== THREADS");
    // The new prose and the ask survive on their own.
    expect(text).toContain("turned the key");
  });
});
