import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bootstrapContinueHandler,
  bootstrapHandler,
  dropEchoedTail,
} from "../../../../../src/core/store/effects/handlers/bootstrap";

describe("dropEchoedTail", () => {
  it("drops a restated last paragraph from the start of a continuation", () => {
    expect(
      dropEchoedTail(
        "The pendulum swings. Tam does not move.",
        "The pendulum swings.",
      ),
    ).toBe("Tam does not move.");
  });

  it("drops it when the echo is a paragraph of its own", () => {
    expect(dropEchoedTail("“I know.”\n\nTam stood.", "“I know.”")).toBe(
      "Tam stood.",
    );
  });

  it("leaves a continuation that does not echo alone", () => {
    expect(dropEchoedTail("Tam stood.", "The pendulum swings.")).toBe(
      "Tam stood.",
    );
  });

  it("does nothing on a blank page", () => {
    expect(dropEchoedTail("Tam stood.", "")).toBe("Tam stood.");
  });
});

describe("bootstrapContinueHandler", () => {
  const append = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    append.mockClear();
    (api.v1.document as unknown as { append: typeof append }).append = append;
  });

  const complete = (accumulatedText: string, generationSucceeded = true) =>
    bootstrapContinueHandler.completion({
      target: { type: "bootstrapContinue", iteration: 3 },
      accumulatedText,
      generationSucceeded,
    } as never);

  it("appends the passage as new paragraphs, without the echoed line", async () => {
    vi.mocked(api.v1.document.scan).mockResolvedValueOnce([
      { sectionId: 1, index: 0, section: { text: "The pendulum swings." } },
    ] as never);

    await complete("The pendulum swings. Tam does not move.\n\n“It’s late.”");

    expect(append).toHaveBeenCalledWith("\nTam does not move.\n“It’s late.”");
  });

  it("appends nothing when the generation failed", async () => {
    await complete("Tam stood.", false);
    expect(append).not.toHaveBeenCalled();
  });

  const page = (...texts: string[]) =>
    vi.mocked(api.v1.document.scan).mockResolvedValueOnce(
      texts.map((text, index) => ({
        sectionId: index + 1,
        index,
        section: { text },
      })) as never,
    );

  it("drops a style tag the passage opens with", async () => {
    page("Ilse looked at the lamp.");
    await complete("[ Style: advanced, sensory (sight, smell) ]\n\nTam stood.");
    expect(append).toHaveBeenCalledWith("\nTam stood.");
  });

  it("drops the paragraphs it opens with that are already on the page", async () => {
    page("He held it out.", "She did not take the paper.", "“With what?”");
    await complete(
      "He held it out.\n\nShe did not take the paper.\n\nShe climbed the stairs.",
    );
    expect(append).toHaveBeenCalledWith("\nShe climbed the stairs.");
  });

  it("appends nothing when the whole passage is already on the page", async () => {
    page("He held it out.", "She did not take the paper.");
    await complete("He held it out.\n\nShe did not take the paper.");
    expect(append).not.toHaveBeenCalled();
  });

  it("cuts a passage that ends mid-sentence back to its last full sentence", async () => {
    page("Ilse looked at the lamp.");
    await complete(
      "“I will account for them.”\n\nShe turned. She walked to the stairs, her boots",
    );
    expect(append).toHaveBeenCalledWith(
      "\n“I will account for them.”\nShe turned.",
    );
  });

  it("drops a last paragraph with no full sentence in it", async () => {
    page("Ilse looked at the lamp.");
    await complete("Tam stood.\n\nShe walked to the stairs, her boots");
    expect(append).toHaveBeenCalledWith("\nTam stood.");
  });
});

describe("bootstrapHandler", () => {
  const append = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    append.mockClear();
    (api.v1.document as unknown as { append: typeof append }).append = append;
  });

  it("cuts an opening that ends mid-sentence back to its last full sentence", async () => {
    await bootstrapHandler.completion({
      target: { type: "bootstrap" },
      accumulatedText: "Ilse polished the brass. The wick needed trimming. She",
      generationSucceeded: true,
    } as never);
    expect(append).toHaveBeenCalledWith(
      "Ilse polished the brass. The wick needed trimming.",
    );
  });
});
