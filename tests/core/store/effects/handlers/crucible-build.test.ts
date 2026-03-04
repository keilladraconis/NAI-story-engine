import { describe, it, expect, vi } from "vitest";
import { parseCommands, executeCommands } from "../../../../../src/core/utils/crucible-command-parser";
import { FieldID } from "../../../../../src/config/field-definitions";
import { initialCrucibleState } from "../../../../../src/core/store/slices/crucible";
import { RootState, CrucibleWorldElement } from "../../../../../src/core/store/types";

// Minimal mock RootState with crucible slice
const makeState = (elements: CrucibleWorldElement[] = []): RootState =>
  ({
    crucible: { ...initialCrucibleState, elements },
  }) as unknown as RootState;

describe("executeCommands", () => {
  it("executes a CREATE command and dispatches elementCreated", () => {
    const commands = parseCommands(`[CREATE CHARACTER "Elara"]\nA disgraced knight.`);
    const dispatch = vi.fn();
    const getState = () => makeState();

    const result = executeCommands(commands, getState, dispatch);

    expect(result.commandLog).toHaveLength(1);
    expect(result.commandLog[0]).toContain("CREATE");
    expect(result.commandLog[0]).toContain("Elara");
    expect(dispatch).toHaveBeenCalled();
    const call = dispatch.mock.calls[0][0];
    expect(call.payload.element.name).toBe("Elara");
    expect(call.payload.element.fieldId).toBe(FieldID.DramatisPersonae);
  });

  it("rejects duplicate CREATE (same name already exists)", () => {
    const existing: CrucibleWorldElement = {
      id: "e1",
      fieldId: FieldID.DramatisPersonae,
      name: "Elara",
      content: "Existing",
    };
    const commands = parseCommands(`[CREATE CHARACTER "Elara"]\nDuplicate.`);
    const dispatch = vi.fn();
    const getState = () => makeState([existing]);

    const result = executeCommands(commands, getState, dispatch);

    expect(result.commandLog).toHaveLength(1);
    expect(result.commandLog[0]).toContain("rejected");
    // No elementCreated dispatch
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("executes a REVISE command and dispatches elementRevised", () => {
    const existing: CrucibleWorldElement = {
      id: "e1",
      fieldId: FieldID.DramatisPersonae,
      name: "Elara",
      content: "Old content",
    };
    const commands = parseCommands(`[REVISE "Elara"]\nNew content.`);
    const dispatch = vi.fn();
    const getState = () => makeState([existing]);

    const result = executeCommands(commands, getState, dispatch);

    expect(result.commandLog).toHaveLength(1);
    expect(result.commandLog[0]).toContain("REVISE");
    const call = dispatch.mock.calls[0][0];
    expect(call.payload.id).toBe("e1");
    expect(call.payload.content).toBe("New content.");
  });

  it("logs skip when REVISE target not found", () => {
    const commands = parseCommands(`[REVISE "Ghost"]\nNew content.`);
    const dispatch = vi.fn();
    const getState = () => makeState();

    const result = executeCommands(commands, getState, dispatch);

    expect(result.commandLog).toHaveLength(1);
    expect(result.commandLog[0]).toContain("not found");
  });

  it("executes a DELETE command and dispatches elementDeleted", () => {
    const existing: CrucibleWorldElement = {
      id: "e1",
      fieldId: FieldID.DramatisPersonae,
      name: "Elara",
      content: "Content",
    };
    const commands = parseCommands(`[DELETE "Elara"]`);
    const dispatch = vi.fn();
    const getState = () => makeState([existing]);

    const result = executeCommands(commands, getState, dispatch);

    expect(result.commandLog).toHaveLength(1);
    expect(result.commandLog[0]).toContain("DELETE");
    const call = dispatch.mock.calls[0][0];
    expect(call.payload.id).toBe("e1");
  });

  it("executes a LINK command and dispatches linkCreated", () => {
    const elara: CrucibleWorldElement = {
      id: "e1", fieldId: FieldID.DramatisPersonae, name: "Elara", content: "A knight",
    };
    const keep: CrucibleWorldElement = {
      id: "e2", fieldId: FieldID.Locations, name: "The Keep", content: "A fortress",
    };
    const commands = parseCommands(`[LINK "Elara" → "The Keep"]\nBorn here.`);
    const dispatch = vi.fn();
    const getState = () => makeState([elara, keep]);

    const result = executeCommands(commands, getState, dispatch);

    expect(result.commandLog).toHaveLength(1);
    expect(result.commandLog[0]).toContain("LINK");
    const call = dispatch.mock.calls[0][0];
    expect(call.payload.link.fromName).toBe("Elara");
    expect(call.payload.link.toName).toBe("The Keep");
    expect(call.payload.link.description).toBe("Born here.");
  });

  it("captures critique text", () => {
    const commands = parseCommands(`[CRITIQUE]\nNeeds more factions.`);
    const dispatch = vi.fn();
    const getState = () => makeState();

    const result = executeCommands(commands, getState, dispatch);

    expect(result.critique).toBe("Needs more factions.");
    expect(dispatch).toHaveBeenCalled();
  });

  it("handles a mixed command sequence", () => {
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
    const dispatch = vi.fn();
    const getState = () => makeState();

    const result = executeCommands(commands, getState, dispatch);

    // CREATE + CREATE + LINK + CRITIQUE dispatches (DONE is no-op)
    expect(result.commandLog.length).toBeGreaterThanOrEqual(4);
    expect(result.critique).toBe("Missing factions.");
  });
});
