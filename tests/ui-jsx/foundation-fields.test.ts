import { describe, it, expect } from "vitest";
import {
  parseContract,
  formatContract,
  isFoundationGenerating,
  INTENSITY_LEVELS,
  FIELD_DESCRIPTORS,
} from "../../src/ui-jsx/panels/foundation/fields";
import type { RootState } from "../../src/core/store";

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
    const s = base([], { type: "foundation", targetId: "shape" });
    expect(isFoundationGenerating(s, "shape")).toBe(true);
    expect(isFoundationGenerating(s, "intent")).toBe(false);
  });

  it("false when nothing matches", () => {
    const s = base([{ type: "list", targetId: "attg" }], null);
    expect(isFoundationGenerating(s, "attg")).toBe(false);
  });
});

describe("foundation fields — descriptors", () => {
  it("has exactly the five card-fields in SUI order", () => {
    expect(FIELD_DESCRIPTORS.map((d) => d.id)).toEqual([
      "shape",
      "intent",
      "contract",
      "attg",
      "style",
    ]);
  });

  it("shape is titled and generate-only; attg/style carry sync", () => {
    const byId = Object.fromEntries(FIELD_DESCRIPTORS.map((d) => [d.id, d]));
    expect(byId.shape.titled).toBe(true);
    expect(byId.shape.hasRefine).toBe(false);
    expect(byId.attg.hasSync).toBe(true);
    expect(byId.style.hasSync).toBe(true);
    expect(byId.intent.hasRefine).toBe(true);
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
