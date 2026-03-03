import { describe, it, expect } from "vitest";
import {
  crucibleSlice,
  initialCrucibleState,
  phaseTransitioned,
  goalAdded,
  goalRemoved,
  goalsCleared,
  goalTextUpdated,
  goalAcceptanceToggled,
  mergeCompleted,
  updateShape,
  directionSet,
  crucibleDirectionEdited,
  prerequisitesDerived,
  prerequisiteRemoved,
  elementsDerived,
  elementRemoved,
  elementUpdated,
  crucibleReset,
} from "../../../../src/core/store/slices/crucible";
import { CrucibleState, CrucibleGoal, Prerequisite, CrucibleWorldElement } from "../../../../src/core/store/types";
import { FieldID } from "../../../../src/config/field-definitions";

const reduce = (state: CrucibleState, action: { type: string; payload?: unknown }) =>
  crucibleSlice.reducer(state, action as any);

const makeGoal = (overrides: Partial<CrucibleGoal> = {}): CrucibleGoal => ({
  id: "g1",
  text: "A hero must sacrifice everything",
  why: "This creates genuine dramatic tension",
  accepted: true,
  ...overrides,
});

const makePrereq = (overrides: Partial<Prerequisite> = {}): Prerequisite => ({
  id: "p1",
  element: "The hero holds a dark secret",
  loadBearing: "Drives act 2 reveal",
  category: "SECRET",
  satisfiedBy: [],
  ...overrides,
});

const makeElement = (overrides: Partial<CrucibleWorldElement> = {}): CrucibleWorldElement => ({
  id: "e1",
  fieldId: FieldID.DramatisPersonae,
  name: "Elara",
  content: "A disgraced knight",
  satisfies: [],
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase transitions
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — phaseTransitioned", () => {
  it("transitions to goals phase", () => {
    const next = reduce(initialCrucibleState, phaseTransitioned({ phase: "goals" }));
    expect(next.phase).toBe("goals");
  });

  it("transitions to review phase", () => {
    const next = reduce(initialCrucibleState, phaseTransitioned({ phase: "review" }));
    expect(next.phase).toBe("review");
  });

  it("clears elements, prerequisites, and merged flag when transitioning to building", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      phase: "goals",
      merged: true,
      prerequisites: [makePrereq()],
      elements: [makeElement()],
    };
    const next = reduce(state, phaseTransitioned({ phase: "building" }));
    expect(next.phase).toBe("building");
    expect(next.prerequisites).toEqual([]);
    expect(next.elements).toEqual([]);
    expect(next.merged).toBe(false);
  });

  it("does NOT clear goals when transitioning to building", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      goals: [makeGoal()],
    };
    const next = reduce(state, phaseTransitioned({ phase: "building" }));
    expect(next.goals).toHaveLength(1);
  });

  it("does NOT clear elements when transitioning to review", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement()],
    };
    const next = reduce(state, phaseTransitioned({ phase: "review" }));
    expect(next.elements).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Goals
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — goals", () => {
  it("goalAdded appends a goal", () => {
    const goal = makeGoal();
    const next = reduce(initialCrucibleState, goalAdded({ goal }));
    expect(next.goals).toHaveLength(1);
    expect(next.goals[0]).toEqual(goal);
  });

  it("goalAdded appends without disturbing existing goals", () => {
    const state: CrucibleState = { ...initialCrucibleState, goals: [makeGoal({ id: "g1" })] };
    const next = reduce(state, goalAdded({ goal: makeGoal({ id: "g2" }) }));
    expect(next.goals).toHaveLength(2);
    expect(next.goals[0].id).toBe("g1");
    expect(next.goals[1].id).toBe("g2");
  });

  it("goalRemoved removes by id", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      goals: [makeGoal({ id: "g1" }), makeGoal({ id: "g2" })],
    };
    const next = reduce(state, goalRemoved({ goalId: "g1" }));
    expect(next.goals).toHaveLength(1);
    expect(next.goals[0].id).toBe("g2");
  });

  it("goalRemoved with unknown id is a no-op", () => {
    const state: CrucibleState = { ...initialCrucibleState, goals: [makeGoal()] };
    const next = reduce(state, goalRemoved({ goalId: "nonexistent" }));
    expect(next.goals).toHaveLength(1);
  });

  it("goalsCleared empties the goals array", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      goals: [makeGoal({ id: "g1" }), makeGoal({ id: "g2" })],
    };
    const next = reduce(state, goalsCleared());
    expect(next.goals).toEqual([]);
  });

  it("goalTextUpdated updates text and why", () => {
    const state: CrucibleState = { ...initialCrucibleState, goals: [makeGoal({ id: "g1", text: "old", why: "old why" })] };
    const next = reduce(state, goalTextUpdated({ goalId: "g1", text: "new", why: "new why" }));
    expect(next.goals[0].text).toBe("new");
    expect(next.goals[0].why).toBe("new why");
  });

  it("goalTextUpdated updates only text when why is omitted", () => {
    const state: CrucibleState = { ...initialCrucibleState, goals: [makeGoal({ id: "g1", text: "old", why: "keep" })] };
    const next = reduce(state, goalTextUpdated({ goalId: "g1", text: "new" }));
    expect(next.goals[0].text).toBe("new");
    expect(next.goals[0].why).toBe("keep");
  });

  it("goalTextUpdated does not affect other goals", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      goals: [makeGoal({ id: "g1", text: "A" }), makeGoal({ id: "g2", text: "B" })],
    };
    const next = reduce(state, goalTextUpdated({ goalId: "g1", text: "A-updated" }));
    expect(next.goals[1].text).toBe("B");
  });

  it("goalAcceptanceToggled flips accepted from true to false", () => {
    const state: CrucibleState = { ...initialCrucibleState, goals: [makeGoal({ id: "g1", accepted: true })] };
    const next = reduce(state, goalAcceptanceToggled({ goalId: "g1" }));
    expect(next.goals[0].accepted).toBe(false);
  });

  it("goalAcceptanceToggled flips accepted from false to true", () => {
    const state: CrucibleState = { ...initialCrucibleState, goals: [makeGoal({ id: "g1", accepted: false })] };
    const next = reduce(state, goalAcceptanceToggled({ goalId: "g1" }));
    expect(next.goals[0].accepted).toBe(true);
  });

  it("goalAcceptanceToggled only affects the targeted goal", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      goals: [makeGoal({ id: "g1", accepted: true }), makeGoal({ id: "g2", accepted: true })],
    };
    const next = reduce(state, goalAcceptanceToggled({ goalId: "g1" }));
    expect(next.goals[0].accepted).toBe(false);
    expect(next.goals[1].accepted).toBe(true);
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

  it("does not disturb other state", () => {
    const state: CrucibleState = { ...initialCrucibleState, goals: [makeGoal()] };
    const next = reduce(state, mergeCompleted());
    expect(next.goals).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prerequisites
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — prerequisites", () => {
  it("prerequisitesDerived appends to empty array", () => {
    const prereq = makePrereq();
    const next = reduce(initialCrucibleState, prerequisitesDerived({ prerequisites: [prereq] }));
    expect(next.prerequisites).toHaveLength(1);
    expect(next.prerequisites[0]).toEqual(prereq);
  });

  it("prerequisitesDerived appends to existing array", () => {
    const state: CrucibleState = { ...initialCrucibleState, prerequisites: [makePrereq({ id: "p1" })] };
    const next = reduce(state, prerequisitesDerived({ prerequisites: [makePrereq({ id: "p2" })] }));
    expect(next.prerequisites).toHaveLength(2);
  });

  it("prerequisiteRemoved removes by id", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      prerequisites: [makePrereq({ id: "p1" }), makePrereq({ id: "p2" })],
    };
    const next = reduce(state, prerequisiteRemoved({ id: "p1" }));
    expect(next.prerequisites).toHaveLength(1);
    expect(next.prerequisites[0].id).toBe("p2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// World elements
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — elements", () => {
  it("elementsDerived appends elements", () => {
    const el = makeElement();
    const next = reduce(initialCrucibleState, elementsDerived({ elements: [el] }));
    expect(next.elements).toHaveLength(1);
    expect(next.elements[0]).toEqual(el);
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

  it("elementUpdated changes name and content", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement({ id: "e1", name: "Old", content: "Old content" })],
    };
    const next = reduce(state, elementUpdated({ id: "e1", name: "New", content: "New content" }));
    expect(next.elements[0].name).toBe("New");
    expect(next.elements[0].content).toBe("New content");
  });

  it("elementUpdated with partial fields does not erase unspecified fields", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement({ id: "e1", name: "Elara", want: "redemption", need: "truth" })],
    };
    const next = reduce(state, elementUpdated({ id: "e1", name: "Elara Updated" }));
    expect(next.elements[0].want).toBe("redemption");
    expect(next.elements[0].need).toBe("truth");
  });

  it("elementUpdated does not affect other elements", () => {
    const state: CrucibleState = {
      ...initialCrucibleState,
      elements: [makeElement({ id: "e1", name: "A" }), makeElement({ id: "e2", name: "B" })],
    };
    const next = reduce(state, elementUpdated({ id: "e1", name: "A-new" }));
    expect(next.elements[1].name).toBe("B");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────────────────────────────────────

describe("crucible reducer — crucibleReset", () => {
  it("returns to initial state", () => {
    const dirty: CrucibleState = {
      phase: "review",
      merged: true,
      shape: { name: "TRAGEDY", instruction: "Loss." },
      direction: "A story of loss.",
      goals: [makeGoal()],
      prerequisites: [makePrereq()],
      elements: [makeElement()],
    };
    const next = reduce(dirty, crucibleReset());
    expect(next).toEqual(initialCrucibleState);
  });
});
