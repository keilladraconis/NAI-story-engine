import { describe, it, expect } from "vitest";
import {
  hiddenWordIn,
  withoutHidden,
} from "../../../src/core/utils/hidden-overlap";

const NAMES = ["Brisa Calloway", "Dov", "Pell", "The Marrow crossing"];
const HIDDEN = [
  "Dov has signed the ferry's landing rights over to the commission and been paid. The deed is gone from the strongbox. Dov has not told Brisa.",
];

describe("withoutHidden", () => {
  it("cuts a sentence that restates a hidden one, and keeps the rest", () => {
    expect(
      withoutHidden(
        "Brisa's nephew, helping her for the season. He signed the landing rights over to the commission.",
        HIDDEN,
        NAMES,
      ),
    ).toEqual({
      kept: "Brisa's nephew, helping her for the season.",
      cut: "He signed the landing rights over to the commission.",
    });
  });

  it("returns the text untouched when nothing is cut", () => {
    const state =
      "Brisa Calloway and Dov operate the ferry at the Marrow crossing.  The landing deed is kept in a tin strongbox under Brisa's bunk.";
    expect(withoutHidden(state, HIDDEN, NAMES)).toEqual({
      kept: state,
      cut: "",
    });
  });

  it("does not take the scene's furniture for the secret about it", () => {
    // "deed" and "strongbox" are two of the hidden sentence's three words:
    // under the three-word floor, so the sentence stays.
    expect(
      withoutHidden("The deed is kept in a strongbox.", HIDDEN, NAMES).cut,
    ).toBe("");
  });

  it("does not match on the names two sentences share", () => {
    expect(
      withoutHidden(
        "Dov works the crossing with Brisa Calloway.",
        HIDDEN,
        NAMES,
      ).cut,
    ).toBe("");
  });

  it("matches across tense and number", () => {
    expect(
      withoutHidden(
        "Dov signs the landing right over to the commission.",
        HIDDEN,
        NAMES,
      ).kept,
    ).toBe("");
  });

  it("cuts nothing when nothing is hidden", () => {
    expect(withoutHidden("He signed it over.", [], NAMES)).toEqual({
      kept: "He signed it over.",
      cut: "",
    });
  });

  it("lets a paraphrase in other words through", () => {
    // The stated limit: this is a comparison of words, not of meaning.
    expect(
      withoutHidden("He has given the crossing away in writing.", HIDDEN, NAMES)
        .cut,
    ).toBe("");
  });
});

describe("hiddenWordIn", () => {
  const PRIVATE = [
    "The notice of transfer came in the last package of flour, and Ilse has not seen it.",
    "Ilse finds the notice herself.",
  ];
  const STATE = "Ilse and Tam share the cottage. The supply boat has stopped.";
  // "The Last Boat" is an element's name, so "last" is a name word here.
  const CAST = ["Ilse", "Tam", "The Lighthouse Island", "The Last Boat"];

  it("finds a title word only the hidden text says", () => {
    expect(hiddenWordIn("The Deed and the Flour", PRIVATE, STATE, CAST)).toBe(
      "flour",
    );
    expect(hiddenWordIn("The Notice", PRIVATE, STATE, CAST)).toBe("notic");
  });

  it("passes a title for what anyone could see", () => {
    expect(hiddenWordIn("The Shared Cottage", PRIVATE, STATE, CAST)).toBe(null);
    expect(hiddenWordIn("The Last Boat", PRIVATE, STATE, CAST)).toBe(null);
  });

  it("passes a word the state says too, and a name", () => {
    expect(hiddenWordIn("The Supply Boat", PRIVATE, STATE, CAST)).toBe(null);
    expect(hiddenWordIn("Ilse and Tam", PRIVATE, STATE, CAST)).toBe(null);
  });
});
