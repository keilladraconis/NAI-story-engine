import { describe, it, expect } from "vitest";
import {
  parseLorebookKeys,
  keysFromDisplayName,
} from "../../../../../src/core/store/effects/handlers/lorebook";

// ─────────────────────────────────────────────────────────────────────────────
// parseLorebookKeys
// ─────────────────────────────────────────────────────────────────────────────

describe("parseLorebookKeys", () => {
  it("parses comma-separated keys from a KEYS: line", () => {
    const text =
      "Some preamble\nKEYS: elara, silver court, the keep\nMore text";
    expect(parseLorebookKeys(text)).toEqual([
      "elara",
      "silver court",
      "the keep",
    ]);
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
    expect(parseLorebookKeys(text)).toEqual([
      "elara",
      "lady elara",
      "the disgraced",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateKey (tested indirectly via parseLorebookKeys)
// ─────────────────────────────────────────────────────────────────────────────

describe("validateKey via parseLorebookKeys", () => {
  it("passes through plain-text keys unchanged", () => {
    expect(parseLorebookKeys("KEYS: elara, voss")).toEqual(["elara", "voss"]);
  });

  it("keeps valid regex keys that don't match short strings", () => {
    expect(parseLorebookKeys("KEYS: /anya/, voss")).toEqual(["/anya/", "voss"]);
  });

  it("drops regex that matches 2-char test strings", () => {
    expect(parseLorebookKeys("KEYS: /an/, voss")).toEqual(["voss"]);
  });

  it("drops regex that matches 3-char test strings like 'any'", () => {
    expect(parseLorebookKeys("KEYS: /any(a|ya)?/, voss")).toEqual(["voss"]);
  });

  it("drops regex matching 'the'", () => {
    expect(parseLorebookKeys("KEYS: /the/, voss")).toEqual(["voss"]);
  });

  it("drops regex matching 'len'", () => {
    expect(parseLorebookKeys("KEYS: /len(a|na)?/, voss")).toEqual(["voss"]);
  });

  it("keeps regex that requires more than 3 chars to match", () => {
    expect(parseLorebookKeys("KEYS: /caldera/, voss")).toEqual([
      "/caldera/",
      "voss",
    ]);
  });

  // Regex with flags
  it("accepts regex with /i flag", () => {
    expect(parseLorebookKeys("KEYS: /caldera/i, voss")).toEqual([
      "/caldera/i",
      "voss",
    ]);
  });

  it("accepts regex with no flags (case-sensitive)", () => {
    expect(parseLorebookKeys("KEYS: /caldera/, voss")).toEqual([
      "/caldera/",
      "voss",
    ]);
  });

  it("accepts regex with multiple valid flags", () => {
    expect(parseLorebookKeys("KEYS: /vor(tex|tices)/im, voss")).toEqual([
      "/vor(tex|tices)/im",
      "voss",
    ]);
  });

  it("drops malformed regex with no closing slash", () => {
    expect(parseLorebookKeys("KEYS: /caldera, voss")).toEqual(["voss"]);
  });

  it("does not lowercase regex keys", () => {
    const result = parseLorebookKeys("KEYS: /Caldera/i, Voss");
    expect(result).toEqual(["/Caldera/i", "voss"]);
  });

  // Compound & keys
  it("accepts compound & keys", () => {
    expect(parseLorebookKeys("KEYS: mira & operating, voss")).toEqual([
      "mira & operating",
      "voss",
    ]);
  });

  it("drops compound key when any part is overbroad regex", () => {
    expect(parseLorebookKeys("KEYS: mira & /th/i, voss")).toEqual(["voss"]);
  });

  it("accepts compound key with valid regex part", () => {
    expect(parseLorebookKeys("KEYS: /caldera/i & voss, elara")).toEqual([
      "/caldera/i & voss",
      "elara",
    ]);
  });

  it("drops syntactically invalid regex", () => {
    expect(parseLorebookKeys("KEYS: /[invalid/, voss")).toEqual(["voss"]);
  });

  it("strips leading dash from keys", () => {
    expect(parseLorebookKeys("KEYS: - elara, - voss")).toEqual([
      "elara",
      "voss",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// keysFromDisplayName
// ─────────────────────────────────────────────────────────────────────────────

describe("keysFromDisplayName", () => {
  it("splits a simple name into word tokens", () => {
    expect(keysFromDisplayName("Elara Nightshade")).toEqual([
      "elara",
      "nightshade",
    ]);
  });

  it("lowercases all tokens", () => {
    expect(keysFromDisplayName("Silver Court")).toEqual(["silver", "court"]);
  });

  it("splits on hyphens", () => {
    expect(keysFromDisplayName("Maren-Voss")).toEqual(["maren", "voss"]);
  });

  it("splits on underscores", () => {
    expect(keysFromDisplayName("iron_throne")).toEqual(["iron", "throne"]);
  });

  it("filters out single-character tokens", () => {
    expect(keysFromDisplayName("A Long Name")).toEqual(["long", "name"]);
  });

  it("handles extra whitespace", () => {
    expect(keysFromDisplayName("  Elara  Nightshade  ")).toEqual([
      "elara",
      "nightshade",
    ]);
  });

  it("returns empty array for a blank display name", () => {
    expect(keysFromDisplayName("")).toEqual([]);
  });

  it("returns empty array when all tokens are single characters", () => {
    expect(keysFromDisplayName("A B C")).toEqual([]);
  });
});
