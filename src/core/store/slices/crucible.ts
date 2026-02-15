import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleGoal,
  CrucibleBeat,
  CrucibleChain,
  Constraint,
  WorldElements,
  MergedWorldInventory,
  CruciblePhase,
  NamedElement,
} from "../types";

const EMPTY_WORLD: WorldElements = {
  characters: [],
  locations: [],
  factions: [],
  systems: [],
  situations: [],
};

/** Merge world elements, deduplicating by name (case-insensitive). */
function mergeWorldElements(existing: WorldElements, introduced: WorldElements): WorldElements {
  const merge = (a: NamedElement[], b: NamedElement[]): NamedElement[] => {
    const names = new Set(a.map((e) => e.name.toLowerCase()));
    return [...a, ...b.filter((e) => !names.has(e.name.toLowerCase()))];
  };
  return {
    characters: merge(existing.characters, introduced.characters),
    locations: merge(existing.locations, introduced.locations),
    factions: merge(existing.factions, introduced.factions),
    systems: merge(existing.systems, introduced.systems),
    situations: merge(existing.situations, introduced.situations),
  };
}

export const initialCrucibleState: CrucibleState = {
  phase: "idle",
  goals: [],
  chains: {},
  activeGoalId: null,
  mergedWorld: null,
  checkpointReason: null,
  autoChaining: false,
  solverStalls: 0,
};

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    // Intent actions — effects handle the actual work
    crucibleGoalsRequested: (state) => state,
    crucibleChainRequested: (state) => state,
    crucibleMergeRequested: (state) => state,
    crucibleStopRequested: (state) => state,

    goalsSet: (state, payload: { goals: CrucibleGoal[] }) => {
      return { ...state, phase: "goals" as const, goals: payload.goals };
    },

    goalToggled: (state, payload: { goalId: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, selected: !g.selected } : g,
        ),
      };
    },

    goalsConfirmed: (state) => state, // Intent action — effects start chaining

    chainStarted: (state, payload: { goalId: string }) => {
      const chain: CrucibleChain = {
        goalId: payload.goalId,
        beats: [],
        openConstraints: [],
        resolvedConstraints: [],
        worldElements: { ...EMPTY_WORLD },
        complete: false,
      };
      return {
        ...state,
        phase: "chaining" as const,
        activeGoalId: payload.goalId,
        chains: { ...state.chains, [payload.goalId]: chain },
      };
    },

    beatAdded: (
      state,
      payload: {
        goalId: string;
        beat: CrucibleBeat;
        constraints: {
          resolved: string[];
          opened: Constraint[];
          grounded: string[];
        };
      },
    ) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      // Mark resolved constraints
      const resolvedSet = new Set(payload.constraints.resolved);
      const groundedSet = new Set(payload.constraints.grounded);
      const updatedOpen = chain.openConstraints
        .map((c) => {
          if (resolvedSet.has(c.description)) return { ...c, status: "resolved" as const };
          if (groundedSet.has(c.description)) return { ...c, status: "groundState" as const };
          return c;
        });

      const nowResolved = updatedOpen.filter((c) => c.status !== "open");
      const stillOpen = updatedOpen.filter((c) => c.status === "open");

      // Add newly opened constraints
      const allOpen = [...stillOpen, ...payload.constraints.opened];

      const updatedChain: CrucibleChain = {
        ...chain,
        beats: [...chain.beats, payload.beat],
        openConstraints: allOpen,
        resolvedConstraints: [...chain.resolvedConstraints, ...nowResolved],
        worldElements: mergeWorldElements(chain.worldElements, payload.beat.worldElementsIntroduced),
      };

      return {
        ...state,
        chains: { ...state.chains, [payload.goalId]: updatedChain },
      };
    },

    beatRejected: (state, payload: { goalId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain || chain.beats.length === 0) return state;

      const lastBeat = chain.beats[chain.beats.length - 1];
      const beatIndex = chain.beats.length - 1;

      // Remove constraints opened by this beat
      const openWithoutLast = chain.openConstraints.filter(
        (c) => c.sourceBeatIndex !== beatIndex,
      );

      // Restore constraints that were resolved by this beat back to open
      const resolvedByBeat = new Set(lastBeat.constraintsResolved);
      const restored = chain.resolvedConstraints.filter(
        (c) => resolvedByBeat.has(c.description),
      ).map((c) => ({ ...c, status: "open" as const }));
      const remainingResolved = chain.resolvedConstraints.filter(
        (c) => !resolvedByBeat.has(c.description),
      );

      const updatedChain: CrucibleChain = {
        ...chain,
        beats: chain.beats.slice(0, -1),
        openConstraints: [...openWithoutLast, ...restored],
        resolvedConstraints: remainingResolved,
        // Note: worldElements are not reverted (accumulated approximation is acceptable)
      };

      return {
        ...state,
        chains: { ...state.chains, [payload.goalId]: updatedChain },
        checkpointReason: null,
      };
    },

    beatEdited: (state, payload: { goalId: string; beatIndex: number; beat: CrucibleBeat }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const updatedBeats = chain.beats.map((b, i) =>
        i === payload.beatIndex ? payload.beat : b,
      );

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, beats: updatedBeats },
        },
      };
    },

    constraintMarkedGroundState: (state, payload: { goalId: string; constraintId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const constraint = chain.openConstraints.find((c) => c.id === payload.constraintId);
      if (!constraint) return state;

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: {
            ...chain,
            openConstraints: chain.openConstraints.filter((c) => c.id !== payload.constraintId),
            resolvedConstraints: [...chain.resolvedConstraints, { ...constraint, status: "groundState" as const }],
          },
        },
      };
    },

    chainCompleted: (state, payload: { goalId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, complete: true },
        },
      };
    },

    activeGoalAdvanced: (state) => {
      const selectedGoals = state.goals.filter((g) => g.selected);
      const nextGoal = selectedGoals.find((g) => {
        const chain = state.chains[g.id];
        return !chain || !chain.complete;
      });
      return {
        ...state,
        activeGoalId: nextGoal?.id || null,
      };
    },

    checkpointSet: (state, payload: { reason: string }) => {
      return { ...state, checkpointReason: payload.reason };
    },

    checkpointCleared: (state) => {
      return { ...state, checkpointReason: null };
    },

    autoChainStarted: (state) => {
      return { ...state, autoChaining: true, solverStalls: 0 };
    },

    autoChainStopped: (state) => {
      return { ...state, autoChaining: false };
    },

    phaseSet: (state, payload: { phase: CruciblePhase }) => {
      return { ...state, phase: payload.phase };
    },

    mergedWorldSet: (state, payload: { mergedWorld: MergedWorldInventory }) => {
      return { ...state, phase: "reviewing" as const, mergedWorld: payload.mergedWorld };
    },

    crucibleCommitted: (state) => {
      return { ...state, phase: "populating" as const, autoChaining: false };
    },

    crucibleReset: () => {
      return { ...initialCrucibleState };
    },

    crucibleLoaded: (_state, payload: { crucible: CrucibleState }) => {
      return { ...payload.crucible, autoChaining: false };
    },

  },
});

export const {
  crucibleGoalsRequested,
  crucibleChainRequested,
  crucibleMergeRequested,
  crucibleStopRequested,
  goalsSet,
  goalToggled,
  goalsConfirmed,
  chainStarted,
  beatAdded,
  beatRejected,
  beatEdited,
  constraintMarkedGroundState,
  chainCompleted,
  activeGoalAdvanced,
  checkpointSet,
  checkpointCleared,
  autoChainStarted,
  autoChainStopped,
  phaseSet,
  mergedWorldSet,
  crucibleCommitted,
  crucibleReset,
  crucibleLoaded,
} = crucibleSlice.actions;
