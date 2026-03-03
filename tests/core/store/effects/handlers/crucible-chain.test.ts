import { describe, it, expect } from "vitest";
import {
  parsePrerequisites,
  parseElements,
} from "../../../../../src/core/store/effects/handlers/crucible-chain";
import { FieldID } from "../../../../../src/config/field-definitions";

// ─────────────────────────────────────────────────────────────────────────────
// parsePrerequisites
// ─────────────────────────────────────────────────────────────────────────────

describe("parsePrerequisites", () => {
  it("parses a single well-formed prerequisite", () => {
    const text = [
      "[PREREQ] The hero holds a dark secret",
      "[LOADBEARING] Drives the act 2 reveal",
      "[CATEGORY] SECRET",
    ].join("\n");

    const results = parsePrerequisites(text);
    expect(results).toHaveLength(1);
    expect(results[0].element).toBe("The hero holds a dark secret");
    expect(results[0].loadBearing).toBe("Drives the act 2 reveal");
    expect(results[0].category).toBe("SECRET");
  });

  it("parses multiple sections separated by +++", () => {
    const text = [
      "[PREREQ] Secret A\n[LOADBEARING] Load A\n[CATEGORY] SECRET",
      "+++",
      "[PREREQ] Power B\n[LOADBEARING] Load B\n[CATEGORY] POWER",
    ].join("\n");

    const results = parsePrerequisites(text);
    expect(results).toHaveLength(2);
    expect(results[0].element).toBe("Secret A");
    expect(results[1].element).toBe("Power B");
  });

  it("defaults to RELATIONSHIP category when CATEGORY tag is absent", () => {
    const text = "[PREREQ] Something\n[LOADBEARING] Reason";
    const [result] = parsePrerequisites(text);
    expect(result.category).toBe("RELATIONSHIP");
  });

  it("defaults to RELATIONSHIP for an unrecognised category value", () => {
    const text = "[PREREQ] Something\n[LOADBEARING] Reason\n[CATEGORY] MADE_UP";
    const [result] = parsePrerequisites(text);
    expect(result.category).toBe("RELATIONSHIP");
  });

  it("accepts all valid category values", () => {
    const valid = ["RELATIONSHIP", "SECRET", "POWER", "HISTORY", "OBJECT", "BELIEF", "PLACE"] as const;
    for (const cat of valid) {
      const text = `[PREREQ] X\n[LOADBEARING] Y\n[CATEGORY] ${cat}`;
      const [result] = parsePrerequisites(text);
      expect(result.category).toBe(cat);
    }
  });

  it("skips sections with no PREREQ tag", () => {
    const text = "[LOADBEARING] Only a load\n[CATEGORY] SECRET";
    expect(parsePrerequisites(text)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parsePrerequisites("")).toHaveLength(0);
  });

  it("leaves loadBearing empty when LOADBEARING tag is absent", () => {
    const text = "[PREREQ] Something\n[CATEGORY] HISTORY";
    const [result] = parsePrerequisites(text);
    expect(result.loadBearing).toBe("");
  });

  it("assigns a unique id to each prerequisite", () => {
    const text = [
      "[PREREQ] A\n[LOADBEARING] L\n[CATEGORY] SECRET",
      "+++",
      "[PREREQ] B\n[LOADBEARING] L\n[CATEGORY] POWER",
    ].join("\n");
    const results = parsePrerequisites(text);
    expect(results[0].id).toBeTruthy();
    expect(results[1].id).toBeTruthy();
    // Each call to api.v1.uuid() returns a unique value (mocked with Math.random)
    expect(results[0].id).not.toBe(results[1].id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseElements
// ─────────────────────────────────────────────────────────────────────────────

describe("parseElements", () => {
  it("parses a CHARACTER element", () => {
    const text = [
      "[CHARACTER] Elara",
      "[DESCRIPTION] A disgraced knight seeking redemption",
      "[WANT] To clear her name",
      "[NEED] To accept her past",
    ].join("\n");

    const results = parseElements(text);
    expect(results).toHaveLength(1);
    expect(results[0].fieldId).toBe(FieldID.DramatisPersonae);
    expect(results[0].name).toBe("Elara");
    expect(results[0].content).toBe("A disgraced knight seeking redemption");
    expect(results[0].want).toBe("To clear her name");
    expect(results[0].need).toBe("To accept her past");
  });

  it("maps all element tag types to the correct field IDs", () => {
    const cases: [string, string][] = [
      ["CHARACTER", FieldID.DramatisPersonae],
      ["LOCATION", FieldID.Locations],
      ["FACTION", FieldID.Factions],
      ["SYSTEM", FieldID.UniverseSystems],
      ["SITUATION", FieldID.SituationalDynamics],
    ];
    for (const [tag, fieldId] of cases) {
      const text = `[${tag}] Name\n[DESCRIPTION] Desc`;
      const [el] = parseElements(text);
      expect(el.fieldId).toBe(fieldId);
    }
  });

  it("parses multiple elements from +++ separated sections", () => {
    const text = [
      "[CHARACTER] Elara\n[DESCRIPTION] Knight",
      "+++",
      "[LOCATION] The Shattered Keep\n[DESCRIPTION] A ruined fortress",
    ].join("\n");

    const results = parseElements(text);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Elara");
    expect(results[1].name).toBe("The Shattered Keep");
  });

  it("parses SATISFIES as a list", () => {
    const text = "[CHARACTER] Elara\n[DESCRIPTION] X\n[SATISFIES] secret keeper, power broker, pivot";
    const [el] = parseElements(text);
    expect(el.satisfies).toEqual(["secret keeper", "power broker", "pivot"]);
  });

  it("parses RELATIONSHIP field", () => {
    const text = "[CHARACTER] Elara\n[DESCRIPTION] X\n[RELATIONSHIP] Mentor to the hero";
    const [el] = parseElements(text);
    expect(el.relationship).toBe("Mentor to the hero");
  });

  it("skips sections with no recognised element tag", () => {
    const text = "[PREREQ] Something\n[LOADBEARING] Reason";
    expect(parseElements(text)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parseElements("")).toHaveLength(0);
  });

  it("leaves optional fields undefined when absent", () => {
    const text = "[CHARACTER] Elara\n[DESCRIPTION] A knight";
    const [el] = parseElements(text);
    expect(el.want).toBeUndefined();
    expect(el.need).toBeUndefined();
    expect(el.relationship).toBeUndefined();
    expect(el.satisfies).toEqual([]);
  });

  it("assigns a unique id to each element", () => {
    const text = [
      "[CHARACTER] Elara\n[DESCRIPTION] A",
      "+++",
      "[LOCATION] Keep\n[DESCRIPTION] B",
    ].join("\n");
    const results = parseElements(text);
    expect(results[0].id).toBeTruthy();
    expect(results[0].id).not.toBe(results[1].id);
  });
});
