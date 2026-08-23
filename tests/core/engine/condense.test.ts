// Condense (§5.1) — the action that can lose information, and the two guards
// standing between it and the writer's entry.
//
// Everything about the prompt is `revise-strategy.test.ts`'s shape, because
// §5.1 says condense obeys every rule revision does. What is NOT shared is how
// the answer is read: a revise that ran out of tokens is trimmed and kept,
// while a condense that ran out of tokens produced MORE text than the entry it
// was asked to shorten and is refused. That divergence, and the ratio floor
// under it, are what most of this file is about.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CONDENSE_MAX_TOKENS,
  CONDENSE_MIN_RATIO,
  CONDENSE_REGROWTH_CHARS,
  composeCondensation,
  condenseParams,
  createCondenseFactory,
  readCondenseMark,
  worthCondensing,
  writeCondenseMark,
  type CondenseInput,
} from "../../../src/core/engine/condense";
import { REVISE_MAX_TOKENS } from "../../../src/core/engine/revise-strategy";
import {
  ENGINE_CONDENSE_SYSTEM,
  ENGINE_CONDENSE_INSTRUCTION,
} from "../../../src/core/utils/prompts";
import { lorebookCondensedKey } from "../../../src/core/keys";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

// ─────────────────────────────── the harness ───────────────────────────────

const PREFILL = "Ada\nType: Character\nSetting: original\n";

function entry(over: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    id: "lb1",
    displayName: "Ada",
    text: `${PREFILL}\nA locksmith with steady hands. She is, it seems, a locksmith of some skill.`,
    keys: ["ada"],
    enabled: true,
    ...over,
  } as LorebookEntry;
}

function input(over: Partial<CondenseInput> = {}): CondenseInput {
  return { entry: entry(), prefill: PREFILL, ...over };
}

async function resolve(over: Partial<CondenseInput> = {}) {
  return createCondenseFactory(input(over))();
}

beforeEach(() => {
  vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
});

// ─────────────────────────────── the messages ───────────────────────────────

describe("the condense prompt", () => {
  it("opens on the system prompt and closes on the instruction and the prefill", async () => {
    const { messages } = await resolve();

    expect(messages[0]).toEqual({
      role: "system",
      content: ENGINE_CONDENSE_SYSTEM,
    });
    expect(messages[messages.length - 2]).toEqual({
      role: "user",
      content: ENGINE_CONDENSE_INSTRUCTION,
    });
    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: PREFILL,
    });
  });

  it("shows the entry exactly as the door read it", async () => {
    const { messages } = await resolve();
    const block = messages.find((m) => m.content?.includes("CURRENT ENTRY"));
    expect(block?.content).toContain("A locksmith with steady hands.");
  });

  it("shows the model nothing but the entry", async () => {
    // A condense is not a function of the new prose — it asserts nothing new,
    // so prose in the prompt is an invitation to add. `newText` never reaches
    // this call.
    const { messages } = await resolve();
    expect(messages.some((m) => m.content?.includes("NEW PROSE"))).toBe(false);
  });

  it("pins every message, so the rollover can trim nothing", async () => {
    // The one block a condense cannot survive losing is the entry, and there is
    // no second block to lose instead: head 1 + tail 3 covers all four.
    const { messages, contextPinning } = await resolve();
    expect(messages).toHaveLength(4);
    expect(contextPinning).toEqual({ head: 1, tail: 3 });
  });
});

// ──────────────────────────────── the params ────────────────────────────────

describe("the condense params", () => {
  it("is priced exactly as a revision is, because §5.1 says so", async () => {
    expect(CONDENSE_MAX_TOKENS).toBe(REVISE_MAX_TOKENS);
    expect((await condenseParams()).max_tokens).toBe(CONDENSE_MAX_TOKENS);
  });

  it("asks for the instruct model, in Xialong mode too", async () => {
    expect((await condenseParams()).model).toBe("glm-4-6");
    vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
      key === "xialong_mode" ? true : undefined,
    );
    expect((await condenseParams()).model).toBe("glm-4-6");
  });

  it("samples colder than a revision, having nothing new to phrase", async () => {
    const { temperature } = await condenseParams();
    expect(temperature).toBeLessThan(0.6);
  });
});

// ─────────────────────────────── the response ───────────────────────────────

/** An entry long enough for the ratio to be meaningful. */
const ORIGINAL = "A fact. ".repeat(100);

describe("composeCondensation", () => {
  it("takes a compaction that keeps most of the entry", async () => {
    const body = "A fact. ".repeat(70);
    const text = await composeCondensation(PREFILL, body, "stop", ORIGINAL);
    expect(text).toBe(PREFILL + body.trimEnd());
  });

  it("refuses a result that is not shorter than what it was given", async () => {
    // A condense that grew the entry did the opposite of its one job, and
    // writing it spends the writer's context to no purpose.
    const text = await composeCondensation(
      PREFILL,
      "A fact. ".repeat(120),
      "stop",
      ORIGINAL,
    );
    expect(text).toBeNull();
  });

  it("refuses a result so short it must be a summary", async () => {
    // §5.1's named risk: condensing is the one action that can lose
    // information. A model that answered "condense" with a two-sentence gist
    // produces exactly this, and nothing downstream would notice.
    const body = "A fact. ".repeat(20);
    expect(body.length).toBeLessThan(ORIGINAL.length * CONDENSE_MIN_RATIO);
    expect(
      await composeCondensation(PREFILL, body, "stop", ORIGINAL),
    ).toBeNull();
  });

  it("refuses a truncated condense outright, where a revise would trim it", async () => {
    // The divergence from `composeRevision`, and the reason for it: a revision
    // that ran out of tokens still recorded the new fact and loses only its
    // tail, but a condense that ran out produced MORE text than the entry it
    // was shortening — it has failed at its one job, and its trimmed tail is
    // pure deletion of the writer's entry.
    const body = "A fact. ".repeat(80);
    expect(await composeCondensation(PREFILL, body, "length", ORIGINAL)).toBe(
      null,
    );
    // …and the same body, untruncated, is fine.
    expect(
      await composeCondensation(PREFILL, body, "stop", ORIGINAL),
    ).not.toBeNull();
  });

  it("refuses a response with nothing in it", async () => {
    expect(await composeCondensation(PREFILL, "   ", "stop", ORIGINAL)).toBe(
      null,
    );
  });

  it("cleans the response the way every other entry write does", async () => {
    // Same stop-tail trim, same thinking-tag strip, same erato separator: a
    // condensed entry must be indistinguishable in shape from a generated one.
    vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
      key === "erato_compatibility" ? true : undefined,
    );
    const body = "A fact. ".repeat(50);
    const text = await composeCondensation(
      PREFILL,
      `<think></think>${body}\n---`,
      "stop",
      ORIGINAL,
    );
    expect(text).toBe("----\n" + PREFILL + body.trimEnd());
  });
});

// ──────────────────────────────── the mark ────────────────────────────────

describe("the condense mark", () => {
  let story: StoryStorageFake;

  beforeEach(() => {
    story = installStoryStorageFake();
  });

  it("reads zero for an entry the Engine has never condensed", async () => {
    expect(await readCondenseMark("lb1")).toBe(0);
  });

  it("round-trips a length under the entry's own key", async () => {
    await writeCondenseMark("lb1", 1700);
    expect(story.get(lorebookCondensedKey("lb1"))).toBe(1700);
    expect(await readCondenseMark("lb1")).toBe(1700);
  });

  it.each([
    ["a string", "1700"],
    ["NaN", Number.NaN],
    ["null", null],
  ])("reads zero when the slot holds %s", async (_label, value) => {
    story.set(lorebookCondensedKey("lb1"), value);
    expect(await readCondenseMark("lb1")).toBe(0);
  });

  it("refuses to condense the same entry again until it has grown a paragraph", async () => {
    // Without this an entry whose facts genuinely do not fit under the
    // threshold is re-condensed on every pass, forever — each attempt spending
    // §3.3's one entry rewrite and each one dropping a little more. The mark is
    // what makes a condense a thing that happens once per bloat episode.
    expect(worthCondensing(2400, 2400)).toBe(false);
    expect(worthCondensing(2400 + CONDENSE_REGROWTH_CHARS - 1, 2400)).toBe(
      false,
    );
    expect(worthCondensing(2400 + CONDENSE_REGROWTH_CHARS, 2400)).toBe(true);
  });

  it("condenses an entry it has never touched", async () => {
    expect(worthCondensing(2400, 0)).toBe(true);
  });
});
