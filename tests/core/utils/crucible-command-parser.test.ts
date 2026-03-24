import { describe, it, expect } from "vitest";
import { parseCommands } from "../../../src/core/utils/crucible-command-parser";

describe("parseCommands", () => {
  it("parses a CREATE command with content", () => {
    const text = `[CREATE CHARACTER "Elara"]
A disgraced knight seeking redemption through service to the very people she wronged.`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: "CREATE",
      elementType: "CHARACTER",
      name: "Elara",
      content: "A disgraced knight seeking redemption through service to the very people she wronged.",
    });
  });

  it("parses multiple CREATE commands", () => {
    const text = `[CREATE CHARACTER "Elara"]
A disgraced knight.
[CREATE LOCATION "The Shattered Keep"]
A ruined fortress at the edge of the realm.`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(2);
    expect(commands[0].kind).toBe("CREATE");
    expect((commands[0] as any).name).toBe("Elara");
    expect(commands[1].kind).toBe("CREATE");
    expect((commands[1] as any).name).toBe("The Shattered Keep");
  });

  it("parses all valid element types", () => {
    const types = ["CHARACTER", "LOCATION", "FACTION", "SYSTEM", "SITUATION", "TOPIC"];
    for (const type of types) {
      const text = `[CREATE ${type} "Test"]
Content for ${type}.`;
      const commands = parseCommands(text);
      expect(commands).toHaveLength(1);
      expect((commands[0] as any).elementType).toBe(type);
    }
  });

  it("parses a REVISE command", () => {
    const text = `[REVISE "Elara"]
Updated: A disgraced knight who now serves as a healer.`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: "REVISE",
      name: "Elara",
      content: "Updated: A disgraced knight who now serves as a healer.",
    });
  });

  it("parses a LINK command with → arrow", () => {
    const text = `[LINK "Elara" → "The Shattered Keep"]
She was born here and carries the weight of its fall.`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: "LINK",
      fromName: "Elara",
      toName: "The Shattered Keep",
      description: "She was born here and carries the weight of its fall.",
    });
  });

  it("parses a LINK command with -> arrow", () => {
    const text = `[LINK "Elara" -> "Kaelen"]
Former rivals turned reluctant allies.`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe("LINK");
    expect((commands[0] as any).fromName).toBe("Elara");
    expect((commands[0] as any).toName).toBe("Kaelen");
  });

  it("parses a DELETE command", () => {
    const commands = parseCommands(`[DELETE "Generic Guard"]`);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ kind: "DELETE", name: "Generic Guard" });
  });

  it("parses a CRITIQUE command", () => {
    const text = `[CRITIQUE]
The world lacks factions. All characters are individuals without institutional backing.`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: "CRITIQUE",
      text: "The world lacks factions. All characters are individuals without institutional backing.",
    });
  });

  it("parses DONE", () => {
    const commands = parseCommands("[DONE]");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ kind: "DONE" });
  });

  it("parses a full build pass with mixed commands", () => {
    const text = `[CREATE CHARACTER "Elara"]
A disgraced knight.
[CREATE LOCATION "The Shattered Keep"]
A ruined fortress.
[LINK "Elara" → "The Shattered Keep"]
Born here.
[CRITIQUE]
Missing factions.
[DONE]`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(5);
    expect(commands.map((c) => c.kind)).toEqual([
      "CREATE", "CREATE", "LINK", "CRITIQUE", "DONE",
    ]);
  });

  it("skips unparseable lines", () => {
    const text = `This is some random text
[CREATE CHARACTER "Elara"]
A knight.
More random text
[DONE]`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(2);
    expect(commands[0].kind).toBe("CREATE");
    expect(commands[1].kind).toBe("DONE");
  });

  it("returns empty array for empty input", () => {
    expect(parseCommands("")).toHaveLength(0);
  });

  it("handles CREATE with no content lines", () => {
    const text = `[CREATE CHARACTER "Elara"]
[CREATE LOCATION "Keep"]`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(2);
    expect((commands[0] as any).content).toBe("");
    expect((commands[1] as any).content).toBe("");
  });

  it("parses REVISE with optional type argument", () => {
    const text = `[REVISE FACTION "The Neighborhood Watch"]
Updated: A paranoid community militia.`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: "REVISE",
      name: "The Neighborhood Watch",
      content: "Updated: A paranoid community militia.",
    });
  });

  it("parses REVISE with type arg same as without", () => {
    const withType = parseCommands(`[REVISE CHARACTER "Elara"]\nNew content.`);
    const withoutType = parseCommands(`[REVISE "Elara"]\nNew content.`);
    expect(withType[0]).toEqual(withoutType[0]);
  });

  it("handles multiline content", () => {
    const text = `[CREATE CHARACTER "Elara"]
Line one of description.
Line two of description.
Line three of description.
[DONE]`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(2);
    expect((commands[0] as any).content).toBe(
      "Line one of description.\nLine two of description.\nLine three of description.",
    );
  });
});
