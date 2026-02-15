import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleGoal,
  CrucibleBeat,
  CrucibleChain,
  CrucibleBuilderState,
  Constraint,
  CruciblePhase,
} from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";

const EMPTY_BUILDER: CrucibleBuilderState = {
  nodes: [],
  lastProcessedBeatIndex: -1,
};

export const initialCrucibleState: CrucibleState = {
  phase: "idle",
  intent: null,
  goals: [],
  chains: {},
  activeGoalId: null,
  checkpointReason: null,
  autoChaining: false,
  solverStalls: 0,
  builder: { ...EMPTY_BUILDER },
};

/** Valid phases after v5 migration. */
const VALID_PHASES = new Set<CruciblePhase>(["idle", "goals", "chaining", "building"]);

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    // Intent actions — effects handle the actual work
    crucibleGoalsRequested: (state) => state,
    crucibleChainRequested: (state) => state,
    crucibleStopRequested: (state) => state,

    // Intent phase reducers
    crucibleIntentRequested: (state) => state,
    intentSet: (state, payload: { intent: string }) => {
      return { ...state, intent: payload.intent };
    },

    goalTextUpdated: (state, payload: { goalId: string; text: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, text: payload.text } : g,
        ),
      };
    },

    goalAdded: (state, payload: { goal: CrucibleGoal }) => {
      return { ...state, phase: "goals" as const, goals: [...state.goals, payload.goal] };
    },

    goalRemoved: (state, payload: { goalId: string }) => {
      return { ...state, goals: state.goals.filter((g) => g.id !== payload.goalId) };
    },

    goalsCleared: (state) => {
      return { ...state, goals: [] };
    },

    goalToggled: (state, payload: { goalId: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, selected: !g.selected } : g,
        ),
      };
    },

    goalsConfirmed: (state) => state,

    chainStarted: (state, payload: { goalId: string }) => {
      const chain: CrucibleChain = {
        goalId: payload.goalId,
        beats: [],
        openConstraints: [],
        resolvedConstraints: [],
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

    // Builder reducers
    crucibleBuildRequested: (state) => state,

    builderNodeAdded: (state, payload: { itemId: string; fieldId: DulfsFieldID; name: string; beatIndex: number }) => {
      const existing = state.builder.nodes.find(
        (n) => n.name.toLowerCase() === payload.name.toLowerCase(),
      );
      if (existing) {
        // FIFO update: add beatIndex, cap at 4
        const beatIndices = [...existing.beatIndices, payload.beatIndex].slice(-4);
        return {
          ...state,
          builder: {
            ...state.builder,
            nodes: state.builder.nodes.map((n) =>
              n.name.toLowerCase() === payload.name.toLowerCase()
                ? { ...n, beatIndices }
                : n,
            ),
          },
        };
      }
      return {
        ...state,
        builder: {
          ...state.builder,
          nodes: [
            ...state.builder.nodes,
            {
              itemId: payload.itemId,
              fieldId: payload.fieldId,
              name: payload.name,
              beatIndices: [payload.beatIndex],
            },
          ],
        },
      };
    },

    builderBeatProcessed: (state, payload: { beatIndex: number }) => {
      return {
        ...state,
        builder: {
          ...state.builder,
          lastProcessedBeatIndex: payload.beatIndex,
        },
      };
    },

    solverYielded: (state) => {
      return { ...state, phase: "chaining" as const };
    },

    crucibleReset: () => {
      return { ...initialCrucibleState };
    },

    crucibleLoaded: (_state, payload: { crucible: CrucibleState }) => {
      const loaded = payload.crucible;

      // v5 migration: clamp phase, strip dead fields from chains/beats
      const phase = VALID_PHASES.has(loaded.phase) ? loaded.phase : "idle";

      const chains: Record<string, CrucibleChain> = {};
      for (const [goalId, chain] of Object.entries(loaded.chains)) {
        chains[goalId] = {
          goalId: chain.goalId,
          beats: chain.beats.map((b) => ({
            text: b.text,
            constraintsResolved: b.constraintsResolved,
            newOpenConstraints: b.newOpenConstraints,
            groundStateConstraints: b.groundStateConstraints,
          })),
          openConstraints: chain.openConstraints,
          resolvedConstraints: chain.resolvedConstraints,
          complete: chain.complete,
        };
      }

      return {
        phase,
        intent: loaded.intent,
        goals: loaded.goals,
        chains,
        activeGoalId: loaded.activeGoalId,
        checkpointReason: loaded.checkpointReason,
        autoChaining: false,
        solverStalls: 0,
        builder: loaded.builder || { ...EMPTY_BUILDER },
      };
    },
  },
});

export const {
  crucibleGoalsRequested,
  crucibleChainRequested,
  crucibleStopRequested,
  crucibleIntentRequested,
  intentSet,
  goalTextUpdated,
  goalAdded,
  goalRemoved,
  goalsCleared,
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
  crucibleBuildRequested,
  builderNodeAdded,
  builderBeatProcessed,
  solverYielded,
  crucibleReset,
  crucibleLoaded,
} = crucibleSlice.actions;
