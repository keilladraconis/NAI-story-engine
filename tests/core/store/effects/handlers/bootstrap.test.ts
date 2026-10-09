import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bootstrapContinueHandler,
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
});
