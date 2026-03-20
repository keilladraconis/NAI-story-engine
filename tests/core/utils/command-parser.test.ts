import { describe, it, expect } from "vitest";
import { parseCommands } from "../../../src/core/utils/crucible-command-parser";

describe("parseCommands", () => {
  it("parses a CREATE command with content", () => {
    const commands = parseCommands(`[CREATE CHARACTER "Elara"]\nA disgraced knight.`);
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe("CREATE");
    if (commands[0].kind === "CREATE") {
      expect(commands[0].name).toBe("Elara");
      expect(commands[0].content).toBe("A disgraced knight.");
    }
  });

  it("parses a REVISE command", () => {
    const commands = parseCommands(`[REVISE "Elara"]\nNew content.`);
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe("REVISE");
    if (commands[0].kind === "REVISE") {
      expect(commands[0].name).toBe("Elara");
      expect(commands[0].content).toBe("New content.");
    }
  });

  it("parses a DELETE command", () => {
    const commands = parseCommands(`[DELETE "Elara"]`);
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe("DELETE");
    if (commands[0].kind === "DELETE") {
      expect(commands[0].name).toBe("Elara");
    }
  });

  it("parses a LINK command with arrow syntax", () => {
    const commands = parseCommands(`[LINK "Elara" → "The Keep"]\nBorn here.`);
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe("LINK");
    if (commands[0].kind === "LINK") {
      expect(commands[0].fromName).toBe("Elara");
      expect(commands[0].toName).toBe("The Keep");
      expect(commands[0].description).toBe("Born here.");
    }
  });

  it("parses a CRITIQUE block", () => {
    const commands = parseCommands(`[CRITIQUE]\nNeeds more factions.`);
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe("CRITIQUE");
    if (commands[0].kind === "CRITIQUE") {
      expect(commands[0].content).toBe("Needs more factions.");
    }
  });

  it("parses a mixed command sequence", () => {
    const text = `[CREATE CHARACTER "Elara"]
A knight.
[CREATE LOCATION "Keep"]
A fortress.
[LINK "Elara" → "Keep"]
Home.
[CRITIQUE]
Missing factions.
[DONE]`;
    const commands = parseCommands(text);
    const kinds = commands.map((c) => c.kind);
    expect(kinds).toContain("CREATE");
    expect(kinds).toContain("LINK");
    expect(kinds).toContain("CRITIQUE");
    expect(kinds).toContain("DONE");
  });

  it("returns empty array for empty input", () => {
    expect(parseCommands("")).toHaveLength(0);
    expect(parseCommands("   ")).toHaveLength(0);
  });
});
