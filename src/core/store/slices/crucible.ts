import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleGoal,
  CruciblePhase,
  StructuralGoal,
  Prerequisite,
  CrucibleWorldElement,
} from "../types";

/** Coerce persisted crucible data into current shape.
 *  Detects old v7 shape (has `chains`/`builder` keys) and returns clean initial state. */
export function migrateCrucibleState(loaded: Partial<CrucibleState>): CrucibleState {
  // Detect old v7 shape — has chains/builder/autoChaining
  const raw = loaded as Record<string, unknown>;
  if (raw.chains || raw.builder || raw.autoChaining !== undefined) {
    return { ...initialCrucibleState, direction: loaded.direction ?? null };
  }

  // Clamp persisted phase — "expanding" no longer exists
  const rawPhase = loaded.phase as string;
  const validPhases = new Set(["direction", "goals", "building", "review", "merged"]);
  const phase = validPhases.has(rawPhase) ? (rawPhase as CruciblePhase) : "direction";

  return {
    ...initialCrucibleState,
    phase,
    direction: loaded.direction ?? null,
    goals: Array.isArray(loaded.goals) ? loaded.goals : [],
    structuralGoals: Array.isArray(loaded.structuralGoals) ? loaded.structuralGoals : [],
    prerequisites: Array.isArray(loaded.prerequisites) ? loaded.prerequisites : [],
    elements: Array.isArray(loaded.elements) ? loaded.elements : [],
  };
}

export const initialCrucibleState: CrucibleState = {
  phase: "direction",
  direction: null,
  goals: [],
  structuralGoals: [],
  prerequisites: [],
  elements: [],
};

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    // Signal actions — effects handle the actual work
    crucibleGoalsRequested: (state) => state,
    crucibleStopRequested: (state) => state,
    crucibleMergeRequested: (state) => state,
    crucibleBuildRequested: (state) => state,
    expansionTriggered: (state, _payload: { elementId?: string }) => state,

    // Phase transitions
    phaseTransitioned: (state, payload: { phase: CruciblePhase }) => {
      // Starting a fresh build — clear all derived data so previous results don't accumulate
      if (payload.phase === "building") {
        return { ...state, phase: payload.phase, structuralGoals: [], prerequisites: [], elements: [], expandingElementId: null, expansionPrereqs: [] };
      }
      return { ...state, phase: payload.phase };
    },

    // Direction phase reducers
    crucibleDirectionRequested: (state) => state,
    directionSet: (state, payload: { direction: string }) => {
      return { ...state, direction: payload.direction };
    },
    crucibleDirectionEdited: (state, payload: { text: string }) => {
      return { ...state, direction: payload.text };
    },

    // Goal management
    goalTextUpdated: (state, payload: { goalId: string; text: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, text: payload.text } : g,
        ),
      };
    },

    goalAdded: (state, payload: { goal: CrucibleGoal }) => {
      return { ...state, goals: [...state.goals, { ...payload.goal, text: "_Generating..._" }] };
    },

    goalRemoved: (state, payload: { goalId: string }) => {
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== payload.goalId),
        structuralGoals: state.structuralGoals.filter((sg) => sg.sourceGoalId !== payload.goalId),
      };
    },

    goalsCleared: (state) => {
      return { ...state, goals: [], structuralGoals: [] };
    },

    goalStarred: (state, payload: { goalId: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, starred: !g.starred } : g,
        ),
      };
    },

    // Structural goal derivation
    structuralGoalDerived: (state, payload: { goal: StructuralGoal }) => {
      return {
        ...state,
        structuralGoals: [...state.structuralGoals, payload.goal],
      };
    },

    // Prerequisites
    prerequisitesDerived: (state, payload: { prerequisites: Prerequisite[] }) => {
      return {
        ...state,
        prerequisites: [...state.prerequisites, ...payload.prerequisites],
      };
    },

    prerequisiteRemoved: (state, payload: { id: string }) => {
      return {
        ...state,
        prerequisites: state.prerequisites.filter((p) => p.id !== payload.id),
      };
    },

    prerequisiteUpdated: (state, payload: { id: string; element?: string; loadBearing?: string }) => {
      return {
        ...state,
        prerequisites: state.prerequisites.map((p) =>
          p.id === payload.id
            ? {
              ...p,
              ...(payload.element !== undefined ? { element: payload.element } : {}),
              ...(payload.loadBearing !== undefined ? { loadBearing: payload.loadBearing } : {}),
            }
            : p,
        ),
      };
    },

    // World elements
    elementsDerived: (state, payload: { elements: CrucibleWorldElement[] }) => {
      return {
        ...state,
        elements: [...state.elements, ...payload.elements],
      };
    },

    elementRemoved: (state, payload: { id: string }) => {
      return {
        ...state,
        elements: state.elements.filter((e) => e.id !== payload.id),
      };
    },

    elementUpdated: (state, payload: { id: string; name?: string; content?: string; want?: string; need?: string; relationship?: string }) => {
      return {
        ...state,
        elements: state.elements.map((e) =>
          e.id === payload.id
            ? {
              ...e,
              ...(payload.name !== undefined ? { name: payload.name } : {}),
              ...(payload.content !== undefined ? { content: payload.content } : {}),
              ...(payload.want !== undefined ? { want: payload.want } : {}),
              ...(payload.need !== undefined ? { need: payload.need } : {}),
              ...(payload.relationship !== undefined ? { relationship: payload.relationship } : {}),
            }
            : e,
        ),
      };
    },

    crucibleReset: () => {
      return { ...initialCrucibleState };
    },
  },
});

export const {
  crucibleGoalsRequested,
  crucibleStopRequested,
  crucibleMergeRequested,
  crucibleBuildRequested,
  phaseTransitioned,
  crucibleDirectionRequested,
  directionSet,
  crucibleDirectionEdited,
  goalTextUpdated,
  goalAdded,
  goalRemoved,
  goalsCleared,
  goalStarred,
  structuralGoalDerived,
  prerequisitesDerived,
  prerequisiteRemoved,
  prerequisiteUpdated,
  elementsDerived,
  elementRemoved,
  elementUpdated,
  expansionTriggered,
  crucibleReset,
} = crucibleSlice.actions;
