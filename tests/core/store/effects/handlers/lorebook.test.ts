import { describe, it, expect } from "vitest";
import { parseLorebookKeys } from "../../../../../src/core/store/effects/handlers/lorebook";

// ─────────────────────────────────────────────────────────────────────────────
// parseLorebookKeys
// ─────────────────────────────────────────────────────────────────────────────

describe("parseLorebookKeys", () => {
  it("parses comma-separated keys from a KEYS: line", () => {
    const text = "Some preamble\nKEYS: elara, silver court, the keep\nMore text";
    expect(parseLorebookKeys(text)).toEqual(["elara", "silver court", "the keep"]);
  });

  it("is case-insensitive for the KEYS: marker", () => {
    expect(parseLorebookKeys("keys: alpha, beta")).toEqual(["alpha", "beta"]);
    expect(parseLorebookKeys("Keys: alpha, beta")).toEqual(["alpha", "beta"]);
    expect(parseLorebookKeys("KEYS: alpha, beta")).toEqual(["alpha", "beta"]);
  });

  it("lowercases all parsed keys", () => {
    const result = parseLorebookKeys("KEYS: Elara, Silver Court, THE KEEP");
    expect(result).toEqual(["elara", "silver court", "the keep"]);
  });

  it("trims whitespace from each key", () => {
    const result = parseLorebookKeys("KEYS:  elara ,  silver court  , keep ");
    expect(result).toEqual(["elara", "silver court", "keep"]);
  });

  it("filters out empty tokens after splitting", () => {
    const result = parseLorebookKeys("KEYS: elara,,keep,");
    expect(result).toEqual(["elara", "keep"]);
  });

  it("filters out keys that are 50 characters or longer", () => {
    const longKey = "a".repeat(50);
    const borderKey = "a".repeat(49);
    const result = parseLorebookKeys(`KEYS: ${longKey}, ${borderKey}, short`);
    expect(result).not.toContain(longKey);
    expect(result).toContain(borderKey);
    expect(result).toContain("short");
  });

  it("returns null when no KEYS: line is present", () => {
    expect(parseLorebookKeys("Name: Elara\nType: Character")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseLorebookKeys("")).toBeNull();
  });

  it("handles KEYS: as the only line", () => {
    expect(parseLorebookKeys("KEYS: alpha, beta")).toEqual(["alpha", "beta"]);
  });

  it("returns empty array when KEYS: line has no content after the colon", () => {
    // The line exists but has nothing parseable after trimming
    const result = parseLorebookKeys("KEYS: ,, ,");
    expect(result).toEqual([]);
  });

  it("finds KEYS: line among many other lines", () => {
    const text = [
      "Name: Elara",
      "Type: Character",
      "Setting: Fantasy kingdom",
      "KEYS: elara, lady elara, the disgraced",
      "More content here.",
    ].join("\n");
    expect(parseLorebookKeys(text)).toEqual(["elara", "lady elara", "the disgraced"]);
  });
});
