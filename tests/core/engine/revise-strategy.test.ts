import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  REVISE_MAX_TOKENS,
  createReviseFactory,
  composeRevision,
  reviseParams,
  type ReviseInput,
} from "../../../src/core/engine/revise-strategy";
import {
  ENGINE_REVISE_SYSTEM,
  ENGINE_REVISE_INSTRUCTION,
} from "../../../src/core/utils/prompts";

// ─────────────────────────────── the harness ───────────────────────────────

function entry(over: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    id: "lb1",
    displayName: "Ada",
    text: "Ada\nType: Character\nSetting: original\n\nA locksmith with steady hands.",
    keys: ["ada"],
    enabled: true,
    ...over,
  } as LorebookEntry;
}

function input(over: Partial<ReviseInput> = {}): ReviseInput {
  return {
    entry: entry(),
    prefill: "Ada\nType: Character\nSetting: original\n",
    newText: "Ada lost her left hand to the press.",
    ...over,
  };
}

async function resolve(over: Partial<ReviseInput> = {}) {
  return createReviseFactory(input(over))();
}

beforeEach(() => {
  vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
});

// ─────────────────────────────── the messages ───────────────────────────────

describe("the revise prompt", () => {
  it("opens on the system prompt and closes on the instruction and the prefill", async () => {
    const { messages } = await resolve();

    expect(messages[0]).toEqual({
      role: "system",
      content: ENGINE_REVISE_SYSTEM,
    });
    expect(messages[messages.length - 2]).toEqual({
      role: "user",
      content: ENGINE_REVISE_INSTRUCTION,
    });
    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: "Ada\nType: Character\nSetting: original\n",
    });
  });

  it("puts the prose before the entry, so the entry sits next to the ask", async () => {
    // The prose is shared by every revise in a pass (cache reuse) and is the
    // one block the rollover may trim; the entry being rewritten must not be
    // trimmable, so it is pinned in the tail.
    const { messages, contextPinning } = await resolve();
    const roles = messages.map((m) => m.content ?? "");

    const prose = roles.findIndex((c) => c.includes("NEW PROSE"));
    const current = roles.findIndex((c) => c.includes("CURRENT ENTRY"));
    expect(prose).toBeGreaterThan(0);
    expect(current).toBeGreaterThan(prose);
    expect(contextPinning).toEqual({ head: 1, tail: 3 });
  });

  it("shows the entry exactly as the door read it", async () => {
    const { messages } = await resolve();
    const block = messages.find((m) => m.content?.includes("CURRENT ENTRY"));
    expect(block?.content).toContain("A locksmith with steady hands.");
  });

  it("says the entry is empty rather than showing nothing", async () => {
    // A blank block reads as "the entry says nothing worth keeping" only if it
    // is labelled; an absent one reads as a formatting slip and invites the
    // model to invent the entry from scratch.
    const { messages } = await resolve({ entry: entry({ text: "" }) });
    const block = messages.find((m) => m.content?.includes("CURRENT ENTRY"));
    expect(block).toBeDefined();
    expect(block?.content).toMatch(/empty/i);
  });

  it("clamps the prose the same way triage does", async () => {
    const long = "x".repeat(20000);
    const { messages } = await resolve({ newText: long });
    const block = messages.find((m) => m.content?.includes("NEW PROSE"));
    expect(block?.content?.length).toBeLessThan(long.length);
  });
});

// ──────────────────────────────── the params ────────────────────────────────

describe("the revise params", () => {
  it("is priced at §3.3's 1024 and asks for the instruct model", async () => {
    expect(REVISE_MAX_TOKENS).toBe(1024);
    const params = await reviseParams();
    expect(params.max_tokens).toBe(REVISE_MAX_TOKENS);
    expect(params.model).toBe("glm-4-6");
  });

  it("stays on the instruct model even in Xialong mode", async () => {
    // §8: a creative fine-tune's failure mode is embellishment, and an
    // unattended rewrite of the writer's lorebook is the worst place for it.
    vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
      key === "xialong_mode" ? true : undefined,
    );
    expect((await reviseParams()).model).toBe("glm-4-6");
  });

  it("carries no Xialong style block", async () => {
    vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
      key === "xialong_mode" ? true : undefined,
    );
    const { messages } = await resolve();
    expect(messages.some((m) => m.content?.includes("[ Style"))).toBe(false);
  });
});

// ─────────────────────────────── the response ───────────────────────────────

describe("composeRevision", () => {
  const PREFILL = "Ada\nType: Character\nSetting: original\n";

  it("prepends the header the model was prefilled with", async () => {
    const text = await composeRevision(PREFILL, "\nOne-handed now.", "stop");
    expect(text).toBe(PREFILL + "\nOne-handed now.");
  });

  it("trims a trailing stop fragment", async () => {
    const text = await composeRevision(PREFILL, "Body text.\n---", "stop");
    expect(text).toBe(PREFILL + "Body text.");
  });

  it("does not leave a thinking tag in the writer's entry", async () => {
    const text = await composeRevision(
      PREFILL,
      "<think></think>Body text.",
      "stop",
    );
    expect(text).not.toContain("think>");
  });

  it("declines a response with nothing in it", async () => {
    expect(await composeRevision(PREFILL, "   ", "stop")).toBeNull();
  });

  it("cuts a truncated revision back to its last complete sentence", async () => {
    // 0.14.0 fixed generated text stopping mid-sentence; a revision that
    // truncates mid-word is the same defect, and 1024 tokens makes it likelier.
    const text = await composeRevision(
      PREFILL,
      "She lost the hand. The press took it clean. She still wo",
      "length",
    );
    expect(text).toBe(PREFILL + "She lost the hand. The press took it clean.");
  });

  it("falls back to the last complete line when there is no sentence", async () => {
    const text = await composeRevision(
      PREFILL,
      "Age: 34\nTrade: locksmith\nHan",
      "length",
    );
    expect(text).toBe(PREFILL + "Age: 34\nTrade: locksmith");
  });

  it("declines a truncation with no complete unit in it at all", async () => {
    expect(await composeRevision(PREFILL, "She still wo", "length")).toBeNull();
  });

  it("leaves an untruncated response alone even without final punctuation", async () => {
    const text = await composeRevision(PREFILL, "Age: 34", "stop");
    expect(text).toBe(PREFILL + "Age: 34");
  });

  it("keeps the erato separator the rest of the codebase writes", async () => {
    vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
      key === "erato_compatibility" ? true : undefined,
    );
    const text = await composeRevision(PREFILL, "Body.", "stop");
    expect(text).toBe("----\n" + PREFILL + "Body.");
  });
});
