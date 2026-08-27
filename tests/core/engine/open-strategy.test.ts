import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  composeReminder,
  createOpenFactory,
  openParams,
  OPEN_MAX_TOKENS,
} from "../../../src/core/engine/open-strategy";
import { INTENT_MAX_TOKENS } from "../../../src/core/engine/execute";

beforeEach(() => {
  vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
});

describe("openParams", () => {
  it("asks for §3.3's price and nothing more", async () => {
    // The drain refuses to start an intent the bucket cannot cover, quoting
    // `INTENT_MAX_TOKENS`. The number it quotes has to be the number
    // `max_tokens` then bounds the call at, or the pass promises one price and
    // pays another.
    expect((await openParams()).max_tokens).toBe(OPEN_MAX_TOKENS);
    expect(INTENT_MAX_TOKENS.open).toBe(OPEN_MAX_TOKENS);
  });

  it("goes to the instruct model, like every other Engine call", async () => {
    expect((await openParams()).model).toBe("glm-4-6");
  });
});

describe("createOpenFactory", () => {
  async function messages(subject: string, newText: string) {
    const built = await createOpenFactory({ subject, newText })();
    return built.messages;
  }

  it("shows the subject triage named and the prose that raised it", async () => {
    const built = await messages(
      "the letter under the floorboard",
      "Ada pushed the letter beneath the board and stood on it.",
    );
    const text = built.map((m) => m.content).join("\n");

    expect(text).toContain("the letter under the floorboard");
    expect(text).toContain("Ada pushed the letter beneath the board");
  });

  it("ends on a prefill, so the answer cannot open with a preamble", async () => {
    const built = await messages("the sealed letter", "prose");
    const last = built[built.length - 1];

    expect(last.role).toBe("assistant");
    expect(last.content?.length).toBeGreaterThan(0);
  });
});

describe("composeReminder", () => {
  it("returns the reminder the model wrote", () => {
    expect(
      composeReminder("The letter is still under the board.", "stop"),
    ).toBe("The letter is still under the board.");
  });

  it("keeps only the first paragraph", () => {
    // A reminder is one standing statement. A model that adds a second
    // paragraph is explaining itself, or writing the scene — either way the
    // extra is context spent every time the thread fires.
    expect(
      composeReminder("Still hidden.\n\nShe will have to move it.", "stop"),
    ).toBe("Still hidden.");
  });

  it("cuts a truncated answer back to its last complete sentence", () => {
    expect(composeReminder("Still hidden. Brennan does not kn", "length")).toBe(
      "Still hidden.",
    );
  });

  it("declines an answer with nothing in it", () => {
    // Null leaves no thread and no entry. A blank reminder would be an
    // always-on lorebook entry that injects nothing but its own divider.
    expect(composeReminder("   ", "stop")).toBeNull();
    expect(composeReminder("", "stop")).toBeNull();
  });

  it("declines a truncation with no complete sentence in it", () => {
    expect(composeReminder("Brennan does not kn", "length")).toBeNull();
  });

  it("trims a stop sequence the sampler left on the tail", () => {
    // The same cleanup the revise path applies, through the same helpers —
    // `trimStopTail` over `LOREBOOK_CHAIN_STOPS`, then `stripThinkingTags`. A
    // note is a lorebook entry's text like any other and must not arrive
    // carrying the separator the model was about to write the next entry after.
    expect(composeReminder("Still hidden.\n---", "stop")).toBe("Still hidden.");
    expect(composeReminder("Still hidden.</think>", "stop")).toBe(
      "Still hidden.",
    );
  });
});
