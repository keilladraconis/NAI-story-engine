import { describe, it, expect } from "vitest";
import {
  parseContract,
  formatContract,
  isFoundationGenerating,
  INTENSITY_LEVELS,
  FIELD_DESCRIPTORS,
  foundationFieldsEmpty,
} from "../../src/ui/panels/foundation/fields";
import type { RootState } from "../../src/core/store";
import { initialFoundationState } from "../../src/core/store/slices/foundation";

describe("foundation fields — contract parse/format", () => {
  it("parses a full REQUIRED/PROHIBITED/EMPHASIS block", () => {
    const text = "REQUIRED: a\nPROHIBITED: b\nEMPHASIS: c";
    expect(parseContract(text)).toEqual({
      required: "a",
      prohibited: "b",
      emphasis: "c",
    });
  });

  it("returns null for blank/whitespace input", () => {
    expect(parseContract("")).toBeNull();
    expect(parseContract("   \n\t ")).toBeNull();
  });

  it("fills missing lines with empty strings", () => {
    expect(parseContract("REQUIRED: only this")).toEqual({
      required: "only this",
      prohibited: "",
      emphasis: "",
    });
  });

  it("formatContract of null is empty string", () => {
    expect(formatContract(null)).toBe("");
  });

  it("format→parse round-trips a filled contract", () => {
    const c = { required: "x", prohibited: "y", emphasis: "z" };
    expect(parseContract(formatContract(c))).toEqual(c);
  });
});

describe("foundation fields — generating selector", () => {
  const base = (
    queue: Array<{ type: string; targetId: string }>,
    active: { type: string; targetId: string } | null,
  ) =>
    ({
      runtime: { queue, activeRequest: active },
    }) as unknown as RootState;

  it("true when a queued request matches the field", () => {
    const s = base([{ type: "foundation", targetId: "attg" }], null);
    expect(isFoundationGenerating(s, "attg")).toBe(true);
    expect(isFoundationGenerating(s, "style")).toBe(false);
  });

  it("true when the active request matches the field", () => {
    const s = base([], { type: "foundation", targetId: "situation" });
    expect(isFoundationGenerating(s, "situation")).toBe(true);
    expect(isFoundationGenerating(s, "contract")).toBe(false);
  });

  it("false when nothing matches", () => {
    const s = base([{ type: "list", targetId: "attg" }], null);
    expect(isFoundationGenerating(s, "attg")).toBe(false);
  });
});

describe("foundation fields — descriptors", () => {
  it("has exactly the four card-fields in SUI order", () => {
    expect(FIELD_DESCRIPTORS.map((d) => d.id)).toEqual([
      "situation",
      "contract",
      "attg",
      "style",
    ]);
  });

  it("situation refines; attg/style carry sync", () => {
    const byId = Object.fromEntries(FIELD_DESCRIPTORS.map((d) => [d.id, d]));
    expect(byId.situation.hasRefine).toBe(true);
    expect(byId.attg.hasSync).toBe(true);
    expect(byId.style.hasSync).toBe(true);
  });

  it("INTENSITY_LEVELS lists Cozy…Nightmare", () => {
    expect(INTENSITY_LEVELS.map((l) => l.level)).toEqual([
      "Cozy",
      "Grounded",
      "Gritty",
      "Noir",
      "Nightmare",
    ]);
  });
});

describe("foundationFieldsEmpty", () => {
  const state = (
    foundation: Partial<RootState["foundation"]> = {},
  ): RootState =>
    ({
      foundation: { ...initialFoundationState, ...foundation },
    }) as RootState;

  it("is true for a pristine foundation", () => {
    expect(foundationFieldsEmpty(state())).toBe(true);
  });

  it("ignores Intensity — it is not one of the field cards", () => {
    expect(
      foundationFieldsEmpty(
        state({ intensity: { level: "Noir", description: "d" } }),
      ),
    ).toBe(true);
  });

  it("is false once any single field carries content", () => {
    expect(foundationFieldsEmpty(state({ situation: "a premise" }))).toBe(
      false,
    );
    expect(foundationFieldsEmpty(state({ attg: "Author: X" }))).toBe(false);
    expect(foundationFieldsEmpty(state({ style: "terse" }))).toBe(false);
    expect(
      foundationFieldsEmpty(
        state({ contract: { required: "r", prohibited: "", emphasis: "" } }),
      ),
    ).toBe(false);
  });

  it("treats whitespace-only content as empty", () => {
    expect(foundationFieldsEmpty(state({ situation: "   \n\t " }))).toBe(true);
  });
});
