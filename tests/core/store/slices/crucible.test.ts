import { describe, it, expect } from "vitest";
import {
  crucibleSlice,
  initialCrucibleState,
  phaseTransitioned,
  tensionsDerived,
  tensionRemoved,
  tensionTextUpdated,
  tensionAcceptanceToggled,
  tensionsCleared,
  mergeCompleted,
  updateShape,
  directionSet,
  crucibleDirectionEdited,
  elementCreated,
  elementRevised,
  elementDeleted,
  elementUpdated,
  elementRemoved,
  linkCreated,
  linkRemoved,
  critiqueSet,
  buildPassCompleted,
  crucibleReset,
} from "../../../../src/core/store/slices/crucible";
import { CrucibleState, CrucibleTension, CrucibleWorldElement, CrucibleLink } from "../../../../src/core/store/types";
import { FieldID } from "../../../../src/config/field-definitions";

const reduce = (state: CrucibleState, action: { type: string; payload?: unknown }) =>
  crucibleSlice.reducer(state, action as any);

const makeTension = (overrides: Partial<CrucibleTension> = {}): CrucibleTension => ({
  id: "t1",
  text: "An apprentice's blind loyalty to a mentor whose methods have grown increasingly ruthless",
  accepted: true,
  ...overrides,
});

const makeElement = (overrides: Partial<CrucibleWorldElement> = {}): CrucibleWorldElement => ({
  id: "e1",
  fieldId: FieldID.DramatisPersonae,
  name: "Elara",
  content: "A disgraced knight",
  ...overrides,
});

const makeLink = (overrides: Partial<CrucibleLink> = {}): CrucibleLink => ({
  id: "l1",
  fromName: "Elara",
  toName: "The Shattered Keep",
  description: "Born here",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase transitions
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — phaseTransitioned", () => {
  it("transitions to tensions phase", () => {
    const next = reduce(initialCrucibleState, phaseTransitioned({ phase: "tensions" }));
    expect(next.phase).toBe("tensions");
  });

  it("clears elements, links, passes, critique, and merged flag when transitioning to building", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      phase: "tensions",
      merged: true,
      elements: [makeElement()],
      links: [makeLink()],
      passes: [{ passNumber: 1, commandLog: ["test"], guidance: "" }],
      activeCritique: "old critique",
    };
    const next = reduce(state, phaseTransitioned({ phase: "building" }));
    expect(next.phase).toBe("building");
    expect(next.elements).toEqual([]);
    expect(next.links).toEqual([]);
    expect(next.passes).toEqual([]);
    expect(next.activeCritique).toBeNull();
    expect(next.merged).toBe(false);
  });

  it("does NOT clear tensions when transitioning to building", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      tensions: [makeTension()],
    };
    const next = reduce(state, phaseTransitioned({ phase: "building" }));
    expect(next.tensions).toHaveLength(1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Tensions
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — tensions", () => {
  it("tensionsDerived appends tensions", () => {
    const tension = makeTension();
    const next = reduce(initialCrucibleState, tensionsDerived({ tensions: [tension] }));
    expect(next.tensions).toHaveLength(1);
    expect(next.tensions[0]).toEqual(tension);
  });

  it("tensionsDerived appends without disturbing existing tensions", () => {
    const state: CrucibleState = { ...initialCrucibleState, tensions: [makeTension({ id: "t1" })] };
    const next = reduce(state, tensionsDerived({ tensions: [makeTension({ id: "t2" })] }));
    expect(next.tensions).toHaveLength(2);
  });

  it("tensionRemoved removes by id", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      tensions: [makeTension({ id: "t1" }), makeTension({ id: "t2" })],
    };
    const next = reduce(state, tensionRemoved({ tensionId: "t1" }));
    expect(next.tensions).toHaveLength(1);
    expect(next.tensions[0].id).toBe("t2");
  });

  it("tensionTextUpdated updates text", () => {
    const state: CrucibleState = { ...initialCrucibleState, tensions: [makeTension({ id: "t1", text: "old" })] };
    const next = reduce(state, tensionTextUpdated({ tensionId: "t1", text: "new" }));
    expect(next.tensions[0].text).toBe("new");
  });

  it("tensionAcceptanceToggled flips accepted", () => {
    const state: CrucibleState = { ...initialCrucibleState, tensions: [makeTension({ id: "t1", accepted: true })] };
    const next = reduce(state, tensionAcceptanceToggled({ tensionId: "t1" }));
    expect(next.tensions[0].accepted).toBe(false);
  });

  it("tensionsCleared empties the tensions array", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      tensions: [makeTension({ id: "t1" }), makeTension({ id: "t2" })],
    };
    const next = reduce(state, tensionsCleared());
    expect(next.tensions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Shape & Direction
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — shape and direction", () => {
  it("updateShape stores name and instruction", () => {
    const next = reduce(initialCrucibleState, updateShape({ name: "TRAGEDY", instruction: "Loss at the apex." }));
    expect(next.shape?.name).toBe("TRAGEDY");
    expect(next.shape?.instruction).toBe("Loss at the apex.");
  });

  it("directionSet stores direction text", () => {
    const next = reduce(initialCrucibleState, directionSet({ direction: "A lone survivor." }));
    expect(next.direction).toBe("A lone survivor.");
  });

  it("crucibleDirectionEdited updates direction", () => {
    const state: CrucibleState = { ...initialCrucibleState, direction: "original" };
    const next = reduce(state, crucibleDirectionEdited({ text: "edited" }));
    expect(next.direction).toBe("edited");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Merge
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — mergeCompleted", () => {
  it("sets merged to true", () => {
    expect(initialCrucibleState.merged).toBe(false);
    const next = reduce(initialCrucibleState, mergeCompleted());
    expect(next.merged).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// World elements
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — elements", () => {
  it("elementCreated appends an element", () => {
    const el = makeElement();
    const next = reduce(initialCrucibleState, elementCreated({ element: el }));
    expect(next.elements).toHaveLength(1);
    expect(next.elements[0]).toEqual(el);
  });

  it("elementRevised updates content", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement({ id: "e1", content: "old" })],
    };
    const next = reduce(state, elementRevised({ id: "e1", content: "new content" }));
    expect(next.elements[0].content).toBe("new content");
    expect(next.elements[0].name).toBe("Elara"); // name unchanged
  });

  it("elementDeleted removes by id", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement({ id: "e1" }), makeElement({ id: "e2" })],
    };
    const next = reduce(state, elementDeleted({ id: "e1" }));
    expect(next.elements).toHaveLength(1);
    expect(next.elements[0].id).toBe("e2");
  });

  it("elementUpdated changes name and content", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement({ id: "e1", name: "Old", content: "Old content" })],
    };
    const next = reduce(state, elementUpdated({ id: "e1", name: "New", content: "New content" }));
    expect(next.elements[0].name).toBe("New");
    expect(next.elements[0].content).toBe("New content");
  });

  it("elementRemoved removes by id", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement({ id: "e1" }), makeElement({ id: "e2" })],
    };
    const next = reduce(state, elementRemoved({ id: "e1" }));
    expect(next.elements).toHaveLength(1);
    expect(next.elements[0].id).toBe("e2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Links
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — links", () => {
  it("linkCreated appends a link", () => {
    const link = makeLink();
    const next = reduce(initialCrucibleState, linkCreated({ link }));
    expect(next.links).toHaveLength(1);
    expect(next.links[0]).toEqual(link);
  });

  it("linkRemoved removes by id", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      links: [makeLink({ id: "l1" }), makeLink({ id: "l2" })],
    };
    const next = reduce(state, linkRemoved({ id: "l1" }));
    expect(next.links).toHaveLength(1);
    expect(next.links[0].id).toBe("l2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Critique and Build Pass
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — critique and build pass", () => {
  it("critiqueSet stores critique text", () => {
    const next = reduce(initialCrucibleState, critiqueSet({ critique: "Missing factions" }));
    expect(next.activeCritique).toBe("Missing factions");
  });

  it("buildPassCompleted appends a pass record", () => {
    const next = reduce(initialCrucibleState, buildPassCompleted({
      passNumber: 1,
      commandLog: ["✓ CREATE CHARACTER \"Elara\""],
      guidance: "",
    }));
    expect(next.passes).toHaveLength(1);
    expect(next.passes[0].passNumber).toBe(1);
    expect(next.passes[0].commandLog).toEqual(["✓ CREATE CHARACTER \"Elara\""]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — crucibleReset", () => {
  it("returns to initial state", () => {
    const dirty: CrucibleState = {
      phase: "building",
      merged: true,
      shape: { name: "TRAGEDY", instruction: "Loss." },
      direction: "A story of loss.",
      tensions: [makeTension()],
      elements: [makeElement()],
      links: [makeLink()],
      passes: [{ passNumber: 1, commandLog: [], guidance: "" }],
      activeCritique: "some critique",
    };
    const next = reduce(dirty, crucibleReset());
    expect(next).toEqual(initialCrucibleState);
  });
});
