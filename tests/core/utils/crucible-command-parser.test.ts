import { describe, it, expect } from "vitest";
import {
  parseCommands,
  serializeForgeCommand,
  canonicalizeForgeCommands,
  walkForgeLines,
  parseForgeStream,
  describeForgeCommand,
} from "../../../src/core/utils/crucible-command-parser";

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
      content:
        "A disgraced knight seeking redemption through service to the very people she wronged.",
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
    const types = [
      "CHARACTER",
      "LOCATION",
      "FACTION",
      "SYSTEM",
      "SITUATION",
      "TOPIC",
    ];
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
    const text = `[CRITIQUE | The world lacks factions. All characters are individuals without institutional backing.]`;

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
[CRITIQUE | Missing factions.]
[DONE]`;

    const commands = parseCommands(text);
    expect(commands).toHaveLength(5);
    expect(commands.map((c) => c.kind)).toEqual([
      "CREATE",
      "CREATE",
      "LINK",
      "CRITIQUE",
      "DONE",
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

describe("parseCommands — bare TYPE-led leniency", () => {
  it('accepts [TYPE: "Name" | desc] as a CREATE', () => {
    const cmds = parseCommands(
      '[SYSTEM: "Apartment Evolution" | progressive transformation]',
    );
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({
      kind: "CREATE",
      elementType: "SYSTEM",
      name: "Apartment Evolution",
      content: "progressive transformation",
    });
  });

  it('accepts the colon-less form [TYPE "Name" | desc]', () => {
    const cmds = parseCommands('[CHARACTER "Halloran" | the harbormaster]');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].kind).toBe("CREATE");
    expect((cmds[0] as { elementType: string }).elementType).toBe("CHARACTER");
  });

  it("is case-insensitive on the type word", () => {
    const cmds = parseCommands('[location: "Old Quay" | decaying waterfront]');
    expect((cmds[0] as { elementType: string }).elementType).toBe("LOCATION");
  });

  it("accepts the multiline bare-TYPE form", () => {
    const cmds = parseCommands(
      '[FACTION "Dock Guild"]\nThe waterfront labor union.',
    );
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({
      kind: "CREATE",
      elementType: "FACTION",
      name: "Dock Guild",
      content: "The waterfront labor union.",
    });
  });

  it("rejects an unknown leading word", () => {
    const cmds = parseCommands('[NOTE: "whatever" | not a type]');
    expect(cmds).toHaveLength(0);
  });

  it("rejects an unquoted name", () => {
    const cmds = parseCommands("[SYSTEM Apartment Evolution | desc]");
    expect(cmds).toHaveLength(0);
  });

  it("does not override an explicit CREATE", () => {
    const cmds = parseCommands('[CREATE SYSTEM "X" | y]');
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({
      kind: "CREATE",
      elementType: "SYSTEM",
      name: "X",
      content: "y",
    });
  });
});

describe("serializeForgeCommand", () => {
  it("serializes each command kind to its canonical line", () => {
    expect(
      serializeForgeCommand({
        kind: "CREATE",
        elementType: "SYSTEM",
        name: "X",
        content: "y",
      }),
    ).toBe('[CREATE SYSTEM "X" | y]');
    expect(
      serializeForgeCommand({ kind: "REVISE", name: "X", content: "y" }),
    ).toBe('[REVISE "X" | y]');
    expect(serializeForgeCommand({ kind: "DELETE", name: "X" })).toBe(
      '[DELETE "X"]',
    );
    expect(
      serializeForgeCommand({ kind: "RENAME", oldName: "A", newName: "B" }),
    ).toBe('[RENAME "A" → "B"]');
    expect(serializeForgeCommand({ kind: "CRITIQUE", text: "thin" })).toBe(
      "[CRITIQUE | thin]",
    );
    expect(serializeForgeCommand({ kind: "DONE" })).toBe("[DONE]");
  });

  it("serializes THREAD with and without a description", () => {
    expect(
      serializeForgeCommand({
        kind: "THREAD",
        title: "Crew",
        memberNames: ["A", "B"],
        description: "dock hands",
      }),
    ).toBe('[THREAD "Crew" | "A", "B" | dock hands]');
    expect(
      serializeForgeCommand({
        kind: "THREAD",
        title: "Crew",
        memberNames: ["A", "B"],
        description: "",
      }),
    ).toBe('[THREAD "Crew" | "A", "B"]');
  });
});

describe("canonicalizeForgeCommands", () => {
  it("rewrites a bare TYPE-led command to canonical CREATE", () => {
    expect(canonicalizeForgeCommands('[SYSTEM: "X" | a description]')).toBe(
      '[CREATE SYSTEM "X" | a description]',
    );
  });

  it("preserves prose around commands", () => {
    const input = [
      "Tightening the dock crew.",
      '[SYSTEM: "X" | a description]',
      "Anything else?",
    ].join("\n");
    expect(canonicalizeForgeCommands(input)).toBe(
      [
        "Tightening the dock crew.",
        '[CREATE SYSTEM "X" | a description]',
        "Anything else?",
      ].join("\n"),
    );
  });

  it("folds a multiline body into the canonical inline form", () => {
    expect(
      canonicalizeForgeCommands(
        '[FACTION "Dock Guild"]\nThe waterfront labor union.',
      ),
    ).toBe('[CREATE FACTION "Dock Guild" | The waterfront labor union.]');
  });

  it("is idempotent on already-canonical text", () => {
    const canonical = '[CREATE SYSTEM "X" | y]';
    expect(canonicalizeForgeCommands(canonical)).toBe(canonical);
  });

  it("leaves a non-command bracket alone", () => {
    expect(canonicalizeForgeCommands('[NOTE: "x" | not a type]')).toBe(
      '[NOTE: "x" | not a type]',
    );
  });
});

describe("walkForgeLines", () => {
  it("tokenizes prose, commands, and trailing prose in document order", () => {
    const text = [
      "Let me think about the apartment.",
      '[CREATE SYSTEM "Apartment Evolution" | progressive transformation]',
      "Now Wilson reacts.",
      '[REVISE "Wilson" | quieter now]',
      "Done for now.",
    ].join("\n");
    const kinds = walkForgeLines(text).map((t) => t.kind);
    expect(kinds).toEqual(["prose", "command", "prose", "command", "prose"]);
  });

  it("flags a known-verb typo as unrecognized", () => {
    const toks = walkForgeLines('[CREATE SYSTm "X" | desc]');
    expect(toks).toEqual([
      { kind: "unrecognized", raw: '[CREATE SYSTm "X" | desc]' },
    ]);
  });

  it("flags a bare known-verb with no args as unrecognized", () => {
    const toks = walkForgeLines("[REVISE]");
    expect(toks).toEqual([{ kind: "unrecognized", raw: "[REVISE]" }]);
  });

  it("treats prose brackets as prose, not unrecognized", () => {
    expect(walkForgeLines("[she pauses]")).toEqual([
      { kind: "prose", text: "[she pauses]" },
    ]);
    expect(walkForgeLines("[redacted]")).toEqual([
      { kind: "prose", text: "[redacted]" },
    ]);
  });

  it("consumes multiline command content (no stray prose tokens)", () => {
    const text = [
      '[CREATE LOCATION "Pier 7"]',
      "A rotting wharf.",
      "Fog rolls in.",
    ].join("\n");
    const toks = walkForgeLines(text);
    expect(toks).toHaveLength(1);
    expect(toks[0].kind).toBe("command");
  });
});

describe("parseCommands (still works via walkForgeLines)", () => {
  it("returns only recognized commands", () => {
    const text = [
      "narration",
      '[CREATE TOPIC "Decay" | rot spreads]',
      "[REVISE]",
    ].join("\n");
    const cmds = parseCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].kind).toBe("CREATE");
  });
});

describe("describeForgeCommand", () => {
  it("maps a CREATE to a provisional applied record", () => {
    expect(
      describeForgeCommand({
        kind: "CREATE",
        elementType: "system",
        name: "X",
        content: "d",
      }),
    ).toEqual({
      kind: "CREATE",
      status: "applied",
      elementType: "SYSTEM",
      name: "X",
    });
  });
  it("maps RENAME and CRITIQUE", () => {
    expect(
      describeForgeCommand({ kind: "RENAME", oldName: "A", newName: "B" }),
    ).toEqual({
      kind: "RENAME",
      status: "applied",
      name: "A",
      newName: "B",
    });
    expect(describeForgeCommand({ kind: "CRITIQUE", text: "hm" })).toEqual({
      kind: "CRITIQUE",
      status: "applied",
      text: "hm",
    });
  });
});

describe("parseForgeStream", () => {
  it("treats trailing text as a streaming prose tail", () => {
    expect(parseForgeStream("Let me think")).toEqual({
      segments: [],
      pending: { kind: "prose", text: "Let me think" },
    });
  });

  it("buffers an open bracket (prefill) with no settled segments", () => {
    expect(parseForgeStream("[")).toEqual({
      segments: [],
      pending: { kind: "buffering" },
    });
    expect(parseForgeStream('[CREATE SYSTEM "X" | des')).toEqual({
      segments: [],
      pending: { kind: "buffering" },
    });
  });

  it("resolves a closed command into a settled provisional chip", () => {
    expect(parseForgeStream('[CREATE SYSTEM "X" | desc]')).toEqual({
      segments: [
        {
          kind: "action",
          action: {
            kind: "CREATE",
            status: "applied",
            elementType: "SYSTEM",
            name: "X",
          },
        },
      ],
      pending: { kind: "none" },
    });
  });

  it("interleaves prose, command, and a trailing prose tail in order", () => {
    const r = parseForgeStream(
      'Sketching.\n[CREATE CHARACTER "Kei" | shy fox]\nNow ',
    );
    expect(r.segments).toEqual([
      { kind: "prose", text: "Sketching." },
      {
        kind: "action",
        action: {
          kind: "CREATE",
          status: "applied",
          elementType: "CHARACTER",
          name: "Kei",
        },
      },
    ]);
    expect(r.pending).toEqual({ kind: "prose", text: "Now " });
  });

  it("flags a known-verb typo as an unrecognized chip", () => {
    expect(parseForgeStream('[CREATE SYSTm "X" | d]')).toEqual({
      segments: [
        {
          kind: "action",
          action: {
            kind: "UNKNOWN",
            status: "unrecognized",
            reason: '[CREATE SYSTm "X" | d]',
          },
        },
      ],
      pending: { kind: "none" },
    });
  });

  it("treats a closed prose bracket as prose, not a chip", () => {
    expect(parseForgeStream("[she pauses]")).toEqual({
      segments: [{ kind: "prose", text: "[she pauses]" }],
      pending: { kind: "none" },
    });
  });

  it("emits no segment for [DONE]", () => {
    expect(parseForgeStream("[DONE]")).toEqual({
      segments: [],
      pending: { kind: "none" },
    });
  });
});
